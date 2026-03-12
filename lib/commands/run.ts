/**
 * Run Command Module
 *
 * Central orchestrator implementing the Speci automation loop.
 * Dispatches agents based on PROGRESS.md state, runs gate validations,
 * handles failures with fix attempts, and manages the iteration cycle.
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type {
  AgentDispatchSpec,
  AgentRunResult,
  SpeciConfig,
} from '@/types.js';
import { STATE } from '@/types.js';
import { createError } from '@/errors.js';
import { MESSAGES } from '@/constants.js';
import { closeLogFile } from '@/utils/infrastructure/logger.js';
import {
  failResult,
  handleCommandError,
} from '@/utils/infrastructure/error-handler.js';
import { isYesAnswer, promptUser } from '@/utils/helpers/prompt.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import { renderIterationDisplay } from '@/ui/progress-bar.js';
import { renderTaskProgressBox } from '@/ui/task-progress.js';

const IMPL_AGENT: AgentDispatchSpec = {
  key: 'impl',
  displayName: 'Implementation Agent',
};
const REVIEW_AGENT: AgentDispatchSpec = {
  key: 'review',
  displayName: 'Review Agent',
};
const FIX_AGENT: AgentDispatchSpec = {
  key: 'fix',
  displayName: 'Fix Agent',
};
const TIDY_AGENT: AgentDispatchSpec = {
  key: 'tidy',
  displayName: 'Tidy Agent',
};

/**
 * Options for the run command
 */
export interface RunOptions {
  maxIterations?: number; // Override config.loop.maxIterations
  dryRun?: boolean; // Show what would execute without running
  force?: boolean; // Override existing lock
  yes?: boolean; // Skip confirmation prompt
  verbose?: boolean; // Detailed output
  /** Enable human-in-the-loop mode — pause on MVT readiness */
  verify?: boolean;
  prompt?: (question: string) => Promise<string>; // Injectable prompt for testing
}

/**
 * Main run command handler
 *
 * @param options - Command options with defaults
 * @param context - Dependency injection context (defaults to production)
 * @param preloadedConfig - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to command result
 * @sideEffects Creates lock file, log file; spawns GitHub Copilot CLI processes; runs gate commands; reads/writes PROGRESS.md
 */
export async function run(
  options: RunOptions = {},
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult> {
  // 1. Load configuration (or use provided config)
  const config = preloadedConfig ?? (await context.configLoader.load());
  const maxIterations = options.maxIterations ?? config.loop.maxIterations;

  // 2. Run preflight checks
  await context.preflight.run(
    config,
    {
      requireCopilot: true,
      requireConfig: true,
      requireProgress: true,
      requireGit: true,
    },
    context.process
  );

  // 3. Check existing lock
  if (await context.lockManager.isLocked(config)) {
    const lockInfo = await context.lockManager.getInfo(config);
    if (!options.force) {
      context.logger.warn(
        `Speci is already running (PID: ${lockInfo?.pid ?? 'unknown'})`
      );
      const proceed = await promptForce(options.prompt, context.process);
      if (!proceed) {
        return { success: true, exitCode: 0 };
      }
    }
    // Release the existing lock before re-acquiring (handles both force=true
    // and the case where the user confirmed via promptForce).
    await context.lockManager.release(config);
  }

  // 4. Dry run check and pre-run confirmation
  if (options.dryRun) {
    const initialState = await context.stateReader.getState(config);
    await displayDryRun(initialState, config, maxIterations, context, options);
    return { success: true, exitCode: 0 };
  }

  if (!options.yes) {
    const initialState = await context.stateReader.getState(config);
    const stats = await context.stateReader.getTaskStats(config);
    const renderedBox =
      stats.total > 0 ? renderTaskProgressBox(stats) : undefined;
    const shouldProceed = await confirmRun(
      initialState,
      renderedBox,
      context,
      options.prompt,
      options.verify
    );
    if (!shouldProceed) {
      return failResult('User cancelled', 0);
    }
  }

  if (options.verify) {
    const shouldProceed = await checkIncompleteMvts(config, context, options);
    if (!shouldProceed) {
      return { success: true, exitCode: 0 };
    }
  }

  // 5. Acquire lock
  await context.lockManager.acquire(config, context.process, 'run');

  // 6. Setup cleanup handlers (before creating log file)
  context.signalManager.install(context.process);

  // Register cleanup functions
  const lockCleanup = async () => {
    await context.lockManager.release(config);
  };
  context.signalManager.registerCleanup(lockCleanup);

  // 8. Initialize logging (after all early exits)
  const logFile = initializeLogFile(config, context);

  // Register log file cleanup
  const logCleanup = async () => {
    try {
      await closeLogFile(logFile);
    } catch {
      // Log file may not be initialized if we exited early
    }
  };
  context.signalManager.registerCleanup(logCleanup);

  try {
    // 9. Run main loop
    await mainLoop(config, maxIterations, logFile, options, context);
    return { success: true, exitCode: 0 };
  } catch (error) {
    return handleCommandError(error, 'Run', context.logger);
  } finally {
    // 10. Cleanup
    await context.lockManager.release(config);
    try {
      await closeLogFile(logFile);
    } catch {
      // Log file may not be initialized if we exited early
    }
    context.signalManager.unregisterCleanup(lockCleanup);
    context.signalManager.unregisterCleanup(logCleanup);
    context.signalManager.remove();
  }
}

/**
 * Main orchestration loop
 *
 * @param config - Speci configuration
 * @param maxIterations - Maximum iterations to run
 * @param logFile - Log file stream
 * @param options - Command options
 * @param context - Command context for logging
 */
async function mainLoop(
  config: SpeciConfig,
  maxIterations: number,
  logFile: WriteStream,
  options: RunOptions,
  context: CommandContext
): Promise<void> {
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    logIteration(logFile, iteration, 'START');
    const lines = renderIterationDisplay({
      current: iteration,
      total: maxIterations,
    });
    context.logger.raw('');
    for (const line of lines) {
      context.logger.infoPlain(line);
    }

    // 1. Get current state
    const state = await context.stateReader.getState(config);
    logState(logFile, state);

    if (options.verify) {
      const shouldPause = await checkMvtPause(config, logFile, context);
      if (shouldPause) {
        return;
      }
    }

    // 2. Dispatch based on state
    switch (state) {
      case STATE.DONE:
        context.logger.success('All tasks complete! Exiting loop.');
        logIteration(logFile, iteration, 'DONE');
        return;

      case STATE.NO_PROGRESS:
        context.logger.error(
          'No PROGRESS.md found. Run `speci init` to initialize.'
        );
        throw createError('ERR-PRE-06');

      case STATE.WORK_LEFT:
        await handleWorkLeft(config, logFile, options, context);
        break;

      case STATE.IN_REVIEW:
        await handleInReview(config, logFile, options, context);
        break;

      case STATE.BLOCKED:
        await handleBlocked(config, logFile, options, context);
        break;
    }

    logIteration(logFile, iteration, 'END');
  }

  context.logger.warn(`Max iterations (${maxIterations}) reached. Exiting.`);
}

/**
 * Handle WORK_LEFT state: dispatch impl agent and run gates
 *
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param options - Command options
 * @param context - Command context for logging
 */
async function handleWorkLeft(
  config: SpeciConfig,
  logFile: WriteStream,
  _options: RunOptions,
  context: CommandContext
): Promise<void> {
  const implResult = await dispatchAgent(IMPL_AGENT, config, logFile, context);
  if (!implResult.isSuccess) {
    return;
  }

  const gateResult = await context.gateRunner.run(config);
  logGate(logFile, gateResult);
  if (gateResult.isSuccess) {
    return;
  }

  await context.stateReader.writeFailureNotes(config, gateResult);
  const gatesFixed = await runFixAttempts(config, logFile, context);
  if (!gatesFixed) {
    const message = `Gates still failing after ${config.gate.maxFixAttempts} fix attempts.`;
    context.logger.error(message);
    throw new Error(message);
  }
}

/**
 * Run an agent and log dispatch lifecycle.
 *
 * @param spec - Agent dispatch spec
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param context - Command context for logging and execution
 * @param attempt - Optional attempt number for log correlation
 * @returns Agent execution result
 */
async function dispatchAgent(
  spec: AgentDispatchSpec,
  config: SpeciConfig,
  logFile: WriteStream,
  context: CommandContext,
  attempt?: number
): Promise<AgentRunResult> {
  context.logger.infoPlain(`Dispatching ${spec.displayName}...\n`);
  logAgent(logFile, spec.key, 'START', attempt);
  const result = await context.copilotRunner.run(config, spec.key);
  logAgent(logFile, spec.key, result.isSuccess ? 'SUCCESS' : 'FAILED', attempt);
  if (!result.isSuccess) {
    context.logger.error(`${spec.displayName} agent failed: ${result.error}`);
  }
  return result;
}

/**
 * Execute fix attempts until gates pass or attempts are exhausted.
 *
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param context - Command context for logging and execution
 * @returns true when gates pass after a fix attempt; otherwise false
 */
async function runFixAttempts(
  config: SpeciConfig,
  logFile: WriteStream,
  context: CommandContext
): Promise<boolean> {
  for (let attempt = 1; attempt <= config.gate.maxFixAttempts; attempt++) {
    context.logger.warn('Gate failed. Running fix agent...');
    const fixLines = renderIterationDisplay({
      current: attempt,
      total: config.gate.maxFixAttempts,
      label: 'Fix Attempt',
      fillColor: 'warning',
      borderColor: 'warning',
    });
    for (const line of fixLines) {
      context.logger.infoPlain(line);
    }

    const fixResult = await dispatchAgent(
      FIX_AGENT,
      config,
      logFile,
      context,
      attempt
    );
    if (!fixResult.isSuccess) {
      break;
    }

    const retryResult = await context.gateRunner.run(config);
    logGate(logFile, retryResult);
    if (retryResult.isSuccess) {
      context.logger.success('Gates passed after fix!');
      return true;
    }

    await context.stateReader.writeFailureNotes(config, retryResult);
  }

  return false;
}

/**
 * Handle IN_REVIEW state: dispatch review agent
 *
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param options - Command options
 * @param context - Command context for logging
 */
async function handleInReview(
  config: SpeciConfig,
  logFile: WriteStream,
  _options: RunOptions,
  context: CommandContext
): Promise<void> {
  await dispatchAgent(REVIEW_AGENT, config, logFile, context);
}

/**
 * Handle BLOCKED state: dispatch tidy agent
 *
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param options - Command options
 * @param context - Command context for logging
 */
async function handleBlocked(
  config: SpeciConfig,
  logFile: WriteStream,
  _options: RunOptions,
  context: CommandContext
): Promise<void> {
  await dispatchAgent(TIDY_AGENT, config, logFile, context);
}

/**
 * Prompt user to force override existing lock
 *
 * @returns true if user wants to proceed
 */
async function promptForce(
  promptFn: ((question: string) => Promise<string>) | undefined,
  proc:
    | Pick<NodeJS.Process, 'stdin' | 'stdout'>
    | {
        stdin: NodeJS.ReadableStream;
        stdout: NodeJS.WritableStream;
      }
): Promise<boolean> {
  const answer = await promptUser(
    'Override lock and continue anyway? [y/N] ',
    promptFn,
    proc
  );
  return isYesAnswer(answer);
}

/**
 * Prompt user to confirm run execution
 *
 * @param state - Current state
 * @param renderedBox - Pre-rendered task progress box (if available)
 * @param context - Command context for logging
 */
async function confirmRun(
  state: STATE,
  renderedBox: string | undefined,
  context: CommandContext,
  promptFn?: (question: string) => Promise<string>,
  verify?: boolean
): Promise<boolean> {
  if (verify) {
    context.logger.infoPlain(MESSAGES.MVT_VERIFY_ENABLED);
  }
  context.logger.infoPlain(`Current state: ${state}`);

  const action = getActionForState(state);
  context.logger.infoPlain(`Action: ${action}`);

  if (renderedBox) {
    context.logger.raw('');
    context.logger.raw(renderedBox);
  }

  const answer = await promptUser(
    '\nProceed with run? [Y/n] ',
    promptFn,
    context.process
  );
  if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
    context.logger.infoPlain('Run cancelled.');
    return false;
  }
  return true;
}

/**
 * Get human-readable action for a given state
 *
 * @param state - Current state
 * @returns Action description
 */
function getActionForState(state: STATE): string {
  switch (state) {
    case STATE.WORK_LEFT:
      return 'Run implementation agent';
    case STATE.IN_REVIEW:
      return 'Run review agent';
    case STATE.BLOCKED:
      return 'Run tidy agent';
    case STATE.DONE:
      return 'All tasks complete (no action)';
    case STATE.NO_PROGRESS:
      return 'Initialize project (run `speci init`)';
  }
}

/**
 * Display dry run information
 *
 * @param state - Current state
 * @param config - Speci configuration
 * @param maxIterations - Maximum iterations
 * @param context - Command context for logging
 */
async function displayDryRun(
  state: STATE,
  config: SpeciConfig,
  maxIterations: number,
  context: CommandContext,
  options?: RunOptions
): Promise<void> {
  context.logger.warnPlain('\n=== DRY RUN MODE ===\n');
  context.logger.muted(`Current state: ${state}`);
  context.logger.muted(`Action: ${getActionForState(state)}`);

  // Display task progress summary
  const stats = await context.stateReader.getTaskStats(config);
  if (stats.total > 0) {
    context.logger.raw('');
    context.logger.raw(renderTaskProgressBox(stats));
    context.logger.raw('');
  }

  context.logger.muted(`Max iterations: ${maxIterations}`);
  context.logger.muted(`Gate commands: ${config.gate.commands.join(', ')}`);
  context.logger.muted(`Max fix attempts: ${config.gate.maxFixAttempts}`);
  if (options?.verify) {
    context.logger.muted(MESSAGES.MVT_VERIFY_ENABLED);
    const milestones = await context.stateReader.getMilestonesMvtStatus(config);
    for (const milestone of milestones) {
      context.logger.muted(
        `  ${milestone.milestoneId}: ${milestone.milestoneName} — ${milestone.mvtId ?? 'N/A'} [${milestone.mvtStatus ?? 'N/A'}] (ready: ${milestone.isMvtReady})`
      );
    }
  }
  context.logger.warnPlain('\nNo actions will be executed.');
}

/**
 * Initialize log file for run session
 *
 * @param config - Speci configuration
 * @param context - Command context for filesystem and process
 * @returns WriteStream for log file
 */
function initializeLogFile(
  config: SpeciConfig,
  context: CommandContext
): WriteStream {
  try {
    const startedAt = new Date();
    const timestamp = startedAt.toJSON().replace(/[:.]/g, '-');
    const logPath = join(config.paths.logs, `speci-run-${timestamp}.log`);

    // Ensure log directory exists
    if (!context.fs.existsSync(config.paths.logs)) {
      context.fs.mkdirSync(config.paths.logs, { recursive: true });
    }

    const stream = createWriteStream(logPath, { flags: 'a' });

    // Handle stream errors
    stream.on('error', () => {
      // Suppress errors during testing
    });

    // Write header
    stream.write(`=== Speci Run Session ===\n`);
    stream.write(`Started: ${startedAt.toJSON()}\n`);
    stream.write(`PID: ${context.process.pid}\n\n`);

    return stream;
  } catch {
    // If we can't create the log file, create a dummy stream
    // This can happen in test environments
    return new Writable({
      write(_chunk: unknown, _encoding: string, callback: () => void) {
        callback();
      },
    }) as WriteStream;
  }
}

/**
 * Write a timestamped log entry line.
 *
 * @param logFile - Log file stream
 * @param category - Log category
 * @param detail - Log entry detail text
 */
function writeLogEntry(
  logFile: WriteStream,
  category: string,
  detail: string
): void {
  logFile.write(`[${new Date().toISOString()}] ${category} ${detail}\n`);
}

/**
 * Log iteration event to file
 *
 * @param logFile - Log file stream
 * @param iteration - Iteration number
 * @param event - Event type
 */
function logIteration(
  logFile: WriteStream,
  iteration: number,
  event: string
): void {
  writeLogEntry(logFile, 'ITERATION', `${iteration} ${event}`);
}

/**
 * Log state to file
 *
 * @param logFile - Log file stream
 * @param state - Current state
 */
function logState(logFile: WriteStream, state: STATE): void {
  writeLogEntry(logFile, 'STATE', String(state));
}

/**
 * Log agent invocation to file
 *
 * @param logFile - Log file stream
 * @param agentName - Agent name
 * @param event - Event type
 * @param attempt - Optional attempt number
 */
function logAgent(
  logFile: WriteStream,
  agentName: string,
  event: string,
  attempt?: number
): void {
  const attemptStr = attempt ? ` (attempt ${attempt})` : '';
  writeLogEntry(
    logFile,
    'AGENT',
    `${agentName.toUpperCase()} ${event}${attemptStr}`
  );
}

/**
 * Log milestone verification event to file.
 *
 * @param logFile - Log file stream
 * @param event - Event type
 * @param milestoneId - Milestone identifier
 * @param mvtId - MVT identifier
 */
function logMvtEvent(
  logFile: WriteStream,
  event: string,
  milestoneId: string,
  mvtId: string
): void {
  writeLogEntry(
    logFile,
    'MVT',
    `${event} milestone=${milestoneId} mvt=${mvtId}`
  );
}

/**
 * Check for incomplete milestone verification tasks before acquiring lock.
 *
 * @param config - Speci configuration
 * @param context - Command context
 * @param options - Run command options
 * @returns true when execution should proceed, false to exit cleanly
 */
async function checkIncompleteMvts(
  config: SpeciConfig,
  context: CommandContext,
  options: RunOptions
): Promise<boolean> {
  const milestones = await context.stateReader.getMilestonesMvtStatus(config);
  const incomplete = milestones.filter((milestone) => milestone.isMvtReady);
  if (incomplete.length === 0) {
    return true;
  }

  logIncompleteMilestones(context, incomplete);

  if (options.yes) {
    context.logger.info(MESSAGES.MVT_AUTO_CONTINUE);
    return true;
  }

  if (!context.process.stdin.isTTY) {
    context.logger.warn(MESSAGES.MVT_NON_TTY_ABORT);
    return false;
  }

  const answer = await promptUser(
    'Continue anyway? [y/N] ',
    options.prompt,
    context.process
  );
  const shouldContinue = isYesAnswer(answer);
  if (!shouldContinue) {
    context.logger.warn(MESSAGES.MVT_EXIT_CANCELLED);
  }
  return shouldContinue;
}

function logIncompleteMilestones(
  context: CommandContext,
  milestones: ReadonlyArray<{
    milestoneId: string;
    milestoneName: string;
    mvtId: string | null;
    mvtStatus: string | null;
  }>
): void {
  context.logger.warn(MESSAGES.MVT_WARNING_HEADER);
  for (const milestone of milestones) {
    context.logger.warn(
      `  ${milestone.milestoneId}: ${milestone.milestoneName} - ${milestone.mvtId ?? 'N/A'} [${milestone.mvtStatus ?? 'N/A'}]`
    );
  }
}

/**
 * Check whether main loop should pause for a ready milestone verification task.
 *
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param context - Command context
 * @returns true when loop should pause, false otherwise
 */
async function checkMvtPause(
  config: SpeciConfig,
  logFile: WriteStream,
  context: CommandContext
): Promise<boolean> {
  const milestones = await context.stateReader.getMilestonesMvtStatus(config);
  const readyMilestone = milestones.find((milestone) => milestone.isMvtReady);
  if (!readyMilestone || !readyMilestone.mvtId) {
    return false;
  }

  logMvtEvent(
    logFile,
    'PAUSE',
    readyMilestone.milestoneId,
    readyMilestone.mvtId
  );
  context.logger.warn(MESSAGES.MVT_PAUSE);
  context.logger.warn(
    `  Milestone: ${readyMilestone.milestoneId} - ${readyMilestone.milestoneName}`
  );
  context.logger.warn(
    `  MVT: ${readyMilestone.mvtId} [${readyMilestone.mvtStatus ?? 'N/A'}]`
  );
  context.logger.warn(MESSAGES.MVT_PAUSE_INSTRUCTION);
  return true;
}

/**
 * Log gate result to file
 *
 * @param logFile - Log file stream
 * @param result - Gate result
 */
function logGate(
  logFile: WriteStream,
  result: {
    isSuccess: boolean;
    results: Array<{ command: string; isSuccess: boolean; exitCode: number }>;
  }
): void {
  writeLogEntry(logFile, 'GATE', result.isSuccess ? 'PASSED' : 'FAILED');
  for (const r of result.results) {
    logFile.write(
      `  - ${r.command}: ${r.isSuccess ? 'PASS' : `FAIL (exit ${r.exitCode})`}\n`
    );
  }
}
