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
import type { SpeciConfig } from '@/config.js';
import { getState, STATE, writeFailureNotes } from '@/state.js';
import {
  acquireLock,
  releaseLock,
  isLocked,
  getLockInfo,
} from '@/utils/lock.js';
import { preflight } from '@/utils/preflight.js';
import { runGate } from '@/utils/gate.js';
import { runAgent } from '@/copilot.js';
import { createError } from '@/errors.js';
import { log, closeLogFile } from '@/utils/logger.js';
import { handleCommandError } from '@/utils/error-handler.js';
import {
  installSignalHandlers,
  registerCleanup,
  removeSignalHandlers,
} from '@/utils/signals.js';
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
  await preflight(
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
  if (await isLocked(loadedConfig)) {
    const lockInfo = await getLockInfo(loadedConfig);
    if (!options.force) {
      context.logger.warn(
        `Speci is already running (PID: ${lockInfo?.pid ?? 'unknown'})`
      );
      const proceed = await promptForce();
      if (!proceed) {
        return { success: true, exitCode: 0 };
      }
    }
    // Release the existing lock before re-acquiring (handles both force=true
    // and the case where the user confirmed via promptForce).
    await releaseLock(loadedConfig);
  }

  // 4. Dry run check and pre-run confirmation
  if (options.dryRun) {
    const initialState = await getState(loadedConfig);
    displayDryRun(initialState, loadedConfig, maxIterations);
    return { success: true, exitCode: 0 };
  }

  if (!options.yes) {
    const initialState = await getState(loadedConfig);
    const shouldProceed = await confirmRun(initialState, loadedConfig);
    if (!shouldProceed) {
      return { success: false, exitCode: 0, error: 'User cancelled' };
    }
  }

  // 5. Acquire lock
  await acquireLock(loadedConfig, context.process, 'run');

  // 6. Setup cleanup handlers (before creating log file)
  installSignalHandlers();

  // Register cleanup functions
  registerCleanup(async () => {
    await releaseLock(loadedConfig);
  });

  // 8. Initialize logging (after all early exits)
  const logFile = initializeLogFile(loadedConfig, context);

  // Register log file cleanup
  registerCleanup(async () => {
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
    await releaseLock(loadedConfig);
    try {
      await closeLogFile(logFile);
    } catch {
      // Log file may not be initialized if we exited early
    }
    removeSignalHandlers();
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
    const state = await getState(config);
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
  // 1. Run impl agent
  context.logger.infoPlain('Dispatching implementation agent...\n');
  logAgent(logFile, 'impl', 'START');
  const implResult = await runAgent(config, 'impl', 'Implementation Agent');
  logAgent(logFile, 'impl', implResult.isSuccess ? 'SUCCESS' : 'FAILED');

  if (!implResult.isSuccess) {
    context.logger.error(`Implementation agent failed: ${implResult.error}`);
    return;
  }

  // 2. Run gates
  const gateResult = await runGate(config);
  logGate(logFile, gateResult);

  if (gateResult.isSuccess) {
    return;
  }

  // 3. Write failure notes so the fix agent knows what broke
  await writeFailureNotes(config, gateResult);

  // 4. Handle gate failure with fix attempts
  let fixAttempt = 0;
  while (!gateResult.isSuccess && fixAttempt < config.gate.maxFixAttempts) {
    fixAttempt++;
    context.logger.warn('Gate failed. Running fix agent...');
    const fixLines = renderIterationDisplay({
      current: fixAttempt,
      total: config.gate.maxFixAttempts,
      label: 'Fix Attempt',
      fillColor: 'warning',
      borderColor: 'warning',
    });
    for (const line of fixLines) {
      context.logger.infoPlain(line);
    }

    logAgent(logFile, 'fix', 'START', fixAttempt);
    const fixResult = await runAgent(config, 'fix', 'Fix Agent');
    logAgent(
      logFile,
      'fix',
      fixResult.isSuccess ? 'SUCCESS' : 'FAILED',
      fixAttempt
    );

    if (!fixResult.isSuccess) {
      context.logger.error(`Fix agent failed: ${fixResult.error}`);
      break;
    }

    // Re-run gates
    const retryResult = await runGate(config);
    logGate(logFile, retryResult);

    if (retryResult.isSuccess) {
      context.logger.success('Gates passed after fix!');
      return;
    }

    // Update failure notes with the latest failure before next fix attempt
    await writeFailureNotes(config, retryResult);
  }

  if (!gateResult.isSuccess) {
    context.logger.error(
      `Gates still failing after ${config.gate.maxFixAttempts} fix attempts.`
    );
    // Continue to next iteration - state parser will re-evaluate
  }
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
  context.logger.infoPlain('Dispatching review agent...\n');
  logAgent(logFile, 'review', 'START');
  const reviewResult = await runAgent(config, 'review', 'Review Agent');
  logAgent(logFile, 'review', reviewResult.isSuccess ? 'SUCCESS' : 'FAILED');

  if (!reviewResult.isSuccess) {
    context.logger.error(`Review agent failed: ${reviewResult.error}`);
  }
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
  context.logger.infoPlain('Dispatching tidy agent to unblock tasks...\n');
  logAgent(logFile, 'tidy', 'START');
  const tidyResult = await runAgent(config, 'tidy', 'Tidy Agent');
  logAgent(logFile, 'tidy', tidyResult.isSuccess ? 'SUCCESS' : 'FAILED');

  if (!tidyResult.isSuccess) {
    context.logger.error(`Tidy agent failed: ${tidyResult.error}`);
  }
}

/**
 * Prompt user to force override existing lock
 *
 * @returns true if user wants to proceed
 */
async function promptForce(): Promise<boolean> {
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
 */
async function confirmRun(
  state: STATE,
  _config: SpeciConfig
): Promise<boolean> {
  log.infoPlain(`Current state: ${state}`);

  const action = getActionForState(state);
  log.infoPlain(`Action: ${action}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\nProceed with run? [Y/n] ', (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        log.infoPlain('Run cancelled.');
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
 */
function displayDryRun(
  state: STATE,
  config: SpeciConfig,
  maxIterations: number
): void {
  log.warnPlain('\n=== DRY RUN MODE ===\n');
  log.muted(`Current state: ${state}`);
  log.muted(`Action: ${getActionForState(state)}`);
  log.muted(`Max iterations: ${maxIterations}`);
  log.muted(`Gate commands: ${config.gate.commands.join(', ')}`);
  log.muted(`Max fix attempts: ${config.gate.maxFixAttempts}`);
  log.warnPlain('\nNo actions will be executed.');
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
