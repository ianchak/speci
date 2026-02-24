/**
 * Run Command Module
 *
 * Central orchestrator implementing the Speci automation loop.
 * Dispatches agents based on PROGRESS.md state, runs gate validations,
 * handles failures with fix attempts, and manages the iteration cycle.
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import type { AgentRunResult, SpeciConfig } from '@/types.js';
import { STATE } from '@/types.js';
import { createError } from '@/errors.js';
import { closeLogFile } from '@/utils/logger.js';
import { failResult, handleCommandError } from '@/utils/error-handler.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
import { renderIterationDisplay } from '@/ui/progress-bar.js';

/**
 * Options for the run command
 */
export interface RunOptions {
  maxIterations?: number; // Override config.loop.maxIterations
  dryRun?: boolean; // Show what would execute without running
  force?: boolean; // Override existing lock
  yes?: boolean; // Skip confirmation prompt
  verbose?: boolean; // Detailed output
  prompt?: (question: string) => Promise<string>; // Injectable prompt for testing
}

/**
 * Main run command handler
 *
 * @param options - Command options with defaults
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to command result
 * @sideEffects Creates lock file, log file; spawns GitHub Copilot CLI processes; runs gate commands; reads/writes PROGRESS.md
 */
export async function run(
  options: RunOptions = {},
  context: CommandContext = createProductionContext(),
  config?: SpeciConfig
): Promise<CommandResult> {
  // 1. Load configuration (or use provided config)
  const loadedConfig = config ?? (await context.configLoader.load());
  const maxIterations =
    options.maxIterations ?? loadedConfig.loop.maxIterations;

  // 2. Run preflight checks
  await context.preflight.run(
    loadedConfig,
    {
      requireCopilot: true,
      requireConfig: true,
      requireProgress: true,
      requireGit: true,
    },
    context.process
  );

  // 3. Check existing lock
  if (await context.lockManager.isLocked(loadedConfig)) {
    const lockInfo = await context.lockManager.getInfo(loadedConfig);
    if (!options.force) {
      context.logger.warn(
        `Speci is already running (PID: ${lockInfo?.pid ?? 'unknown'})`
      );
      const proceed = await promptForce(options.prompt);
      if (!proceed) {
        return { success: true, exitCode: 0 };
      }
    }
    // Release the existing lock before re-acquiring (handles both force=true
    // and the case where the user confirmed via promptForce).
    await context.lockManager.release(loadedConfig);
  }

  // 4. Dry run check and pre-run confirmation
  if (options.dryRun) {
    const initialState = await context.stateReader.getState(loadedConfig);
    displayDryRun(initialState, loadedConfig, maxIterations, context);
    return { success: true, exitCode: 0 };
  }

  if (!options.yes) {
    const initialState = await context.stateReader.getState(loadedConfig);
    const shouldProceed = await confirmRun(
      initialState,
      loadedConfig,
      context,
      options.prompt
    );
    if (!shouldProceed) {
      return failResult('User cancelled', 0);
    }
  }

  // 5. Acquire lock
  await context.lockManager.acquire(loadedConfig, context.process, 'run');

  // 6. Setup cleanup handlers (before creating log file)
  context.signalManager.install();

  // Register cleanup functions
  context.signalManager.registerCleanup(async () => {
    await context.lockManager.release(loadedConfig);
  });

  // 8. Initialize logging (after all early exits)
  const logFile = initializeLogFile(loadedConfig, context);

  // Register log file cleanup
  context.signalManager.registerCleanup(async () => {
    try {
      await closeLogFile(logFile);
    } catch {
      // Log file may not be initialized if we exited early
    }
  });

  try {
    // 9. Run main loop
    await mainLoop(loadedConfig, maxIterations, logFile, options, context);
    return { success: true, exitCode: 0 };
  } catch (error) {
    return handleCommandError(error, 'Run', context.logger);
  } finally {
    // 10. Cleanup
    await context.lockManager.release(loadedConfig);
    try {
      await closeLogFile(logFile);
    } catch {
      // Log file may not be initialized if we exited early
    }
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
 * @param loadedConfig - Speci configuration
 * @param logFile - Log file stream
 * @param options - Command options
 */
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
  const implResult = await dispatchAgent(
    'impl',
    'Implementation Agent',
    'Dispatching implementation agent...',
    config,
    logFile,
    context
  );
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
    context.logger.error(
      `Gates still failing after ${config.gate.maxFixAttempts} fix attempts.`
    );
  }
}

/**
 * Run an agent and log dispatch lifecycle.
 *
 * @param agentKey - Agent key passed to copilot runner
 * @param agentDisplayName - Human-readable agent name
 * @param dispatchMsg - Message printed before dispatch
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param context - Command context for logging and execution
 * @param attempt - Optional attempt number for log correlation
 * @returns Agent execution result
 */
async function dispatchAgent(
  agentKey: string,
  agentDisplayName: string,
  dispatchMsg: string,
  config: SpeciConfig,
  logFile: WriteStream,
  context: CommandContext,
  attempt?: number
): Promise<AgentRunResult> {
  context.logger.infoPlain(`${dispatchMsg}\n`);
  logAgent(logFile, agentKey, 'START', attempt);
  const result = await context.copilotRunner.run(
    config,
    agentKey,
    agentDisplayName
  );
  logAgent(logFile, agentKey, result.isSuccess ? 'SUCCESS' : 'FAILED', attempt);
  if (!result.isSuccess) {
    context.logger.error(`${agentDisplayName} agent failed: ${result.error}`);
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
      'fix',
      'Fix Agent',
      'Running fix agent...',
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
  await dispatchAgent(
    'review',
    'Review Agent',
    'Dispatching review agent...',
    config,
    logFile,
    context
  );
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
  await dispatchAgent(
    'tidy',
    'Tidy Agent',
    'Dispatching tidy agent to unblock tasks...',
    config,
    logFile,
    context
  );
}

/**
 * Prompt user to force override existing lock
 *
 * @returns true if user wants to proceed
 */
async function promptForce(
  promptFn?: (question: string) => Promise<string>
): Promise<boolean> {
  if (promptFn) {
    const answer = await promptFn('Override lock and continue anyway? [y/N] ');
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Override lock and continue anyway? [y/N] ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Prompt user to confirm run execution
 *
 * @param state - Current state
 * @param loadedConfig - Speci configuration
 * @param context - Command context for logging
 */
async function confirmRun(
  state: STATE,
  _config: SpeciConfig,
  context: CommandContext,
  promptFn?: (question: string) => Promise<string>
): Promise<boolean> {
  context.logger.infoPlain(`Current state: ${state}`);

  const action = getActionForState(state);
  context.logger.infoPlain(`Action: ${action}`);

  if (promptFn) {
    const answer = await promptFn('\nProceed with run? [Y/n] ');
    if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
      context.logger.infoPlain('Run cancelled.');
      return false;
    }
    return true;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\nProceed with run? [Y/n] ', (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        context.logger.infoPlain('Run cancelled.');
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
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
 * @param loadedConfig - Speci configuration
 * @param maxIterations - Maximum iterations
 * @param context - Command context for logging
 */
function displayDryRun(
  state: STATE,
  config: SpeciConfig,
  maxIterations: number,
  context: CommandContext
): void {
  context.logger.warnPlain('\n=== DRY RUN MODE ===\n');
  context.logger.muted(`Current state: ${state}`);
  context.logger.muted(`Action: ${getActionForState(state)}`);
  context.logger.muted(`Max iterations: ${maxIterations}`);
  context.logger.muted(`Gate commands: ${config.gate.commands.join(', ')}`);
  context.logger.muted(`Max fix attempts: ${config.gate.maxFixAttempts}`);
  context.logger.warnPlain('\nNo actions will be executed.');
}

/**
 * Initialize log file for run session
 *
 * @param loadedConfig - Speci configuration
 * @param context - Command context for filesystem and process
 * @returns WriteStream for log file
 */
function initializeLogFile(
  config: SpeciConfig,
  context: CommandContext
): WriteStream {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
    stream.write(`Started: ${new Date().toISOString()}\n`);
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
  const timestamp = new Date().toISOString();
  logFile.write(`[${timestamp}] ITERATION ${iteration} ${event}\n`);
}

/**
 * Log state to file
 *
 * @param logFile - Log file stream
 * @param state - Current state
 */
function logState(logFile: WriteStream, state: STATE): void {
  const timestamp = new Date().toISOString();
  logFile.write(`[${timestamp}] STATE ${state}\n`);
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
  const timestamp = new Date().toISOString();
  const attemptStr = attempt ? ` (attempt ${attempt})` : '';
  logFile.write(
    `[${timestamp}] AGENT ${agentName.toUpperCase()} ${event}${attemptStr}\n`
  );
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
  const timestamp = new Date().toISOString();
  logFile.write(
    `[${timestamp}] GATE ${result.isSuccess ? 'PASSED' : 'FAILED'}\n`
  );
  for (const r of result.results) {
    logFile.write(
      `  - ${r.command}: ${r.isSuccess ? 'PASS' : `FAIL (exit ${r.exitCode})`}\n`
    );
  }
}
