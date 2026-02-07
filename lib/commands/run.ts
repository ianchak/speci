/**
 * Run Command Module
 *
 * Central orchestrator implementing the Speci automation loop.
 * Dispatches agents based on PROGRESS.md state, runs gate validations,
 * handles failures with fix attempts, and manages the iteration cycle.
 */

import { createWriteStream, type WriteStream, existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { loadConfig, type SpeciConfig } from '@/config.js';
import { getState, STATE } from '@/state.js';
import {
  acquireLock,
  releaseLock,
  isLocked,
  getLockInfo,
} from '@/utils/lock.js';
import { preflight } from '@/utils/preflight.js';
import { runGate, resetGateAttempts } from '@/utils/gate.js';
import { runAgent } from '@/copilot.js';
import { renderBanner } from '@/ui/banner.js';
import { log } from '@/utils/logger.js';
import {
  installSignalHandlers,
  registerCleanup,
  removeSignalHandlers,
} from '@/utils/signals.js';

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
 * Global flag to track if cleanup is in progress
 */
let cleanupInProgress = false;

/**
 * Reset cleanup flag (for testing)
 */
export function resetCleanupFlag(): void {
  cleanupInProgress = false;
}

/**
 * Main run command handler
 *
 * @param options - Command options
 */
export async function run(options: RunOptions = {}): Promise<void> {
  // Reset cleanup flag at start of each run
  cleanupInProgress = false;

  // 1. Display banner
  renderBanner();

  // 2. Load configuration
  const config = await loadConfig();
  const maxIterations = options.maxIterations ?? config.loop.maxIterations;

  // 3. Run preflight checks
  await preflight(config, {
    requireCopilot: true,
    requireConfig: true,
    requireProgress: true,
    requireGit: true,
  });

  // 4. Check existing lock
  if (await isLocked(config)) {
    const lockInfo = await getLockInfo(config);
    if (!options.force) {
      log.warn(`Speci is already running (PID: ${lockInfo?.pid ?? 'unknown'})`);
      const proceed = await promptForce();
      if (!proceed) {
        process.exit(0);
      }
    }
  }

  // 5. Dry run check and pre-run confirmation
  if (options.dryRun) {
    const initialState = await getState(config);
    displayDryRun(initialState, config, maxIterations);
    process.exit(0);
  }

  if (!options.yes) {
    const initialState = await getState(config);
    await confirmRun(initialState, config);
  }

  // 6. Acquire lock
  await acquireLock(config);

  // 7. Setup cleanup handlers (before creating log file)
  installSignalHandlers();

  // Register cleanup functions
  registerCleanup(async () => {
    await releaseLock(config);
  });

  // 8. Initialize logging (after all early exits)
  const logFile = initializeLogFile(config);

  // Register log file cleanup
  registerCleanup(async () => {
    try {
      // Wait for log file to finish writing
      await new Promise<void>((resolve) => {
        logFile.end(() => {
          resolve();
        });
      });
    } catch {
      // Log file may not be initialized if we exited early
    }
  });

  try {
    // 9. Run main loop
    await mainLoop(config, maxIterations, logFile, options);
  } finally {
    // 10. Cleanup
    if (!cleanupInProgress) {
      cleanupInProgress = true;
      await releaseLock(config);
      try {
        // Wait for log file to finish writing
        await new Promise<void>((resolve) => {
          logFile.end(() => {
            resolve();
          });
        });
      } catch {
        // Log file may not be initialized if we exited early
      }
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
 */
async function mainLoop(
  config: SpeciConfig,
  maxIterations: number,
  logFile: WriteStream,
  options: RunOptions
): Promise<void> {
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    logIteration(logFile, iteration, 'START');
    log.info(`\n--- Iteration ${iteration}/${maxIterations} ---`);

    // 1. Get current state
    const state = await getState(config);
    logState(logFile, state);

    // 2. Dispatch based on state
    switch (state) {
      case STATE.DONE:
        log.success('All tasks complete! Exiting loop.');
        logIteration(logFile, iteration, 'DONE');
        return;

      case STATE.NO_PROGRESS:
        log.error('No PROGRESS.md found. Run `speci init` to initialize.');
        process.exit(1);
        break;

      case STATE.WORK_LEFT:
        await handleWorkLeft(config, logFile, options);
        break;

      case STATE.IN_REVIEW:
        await handleInReview(config, logFile, options);
        break;

      case STATE.BLOCKED:
        await handleBlocked(config, logFile, options);
        break;
    }

    logIteration(logFile, iteration, 'END');
  }

  log.warn(`Max iterations (${maxIterations}) reached. Exiting.`);
}

/**
 * Handle WORK_LEFT state: dispatch impl agent and run gates
 *
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param options - Command options
 */
async function handleWorkLeft(
  config: SpeciConfig,
  logFile: WriteStream,
  _options: RunOptions
): Promise<void> {
  // 1. Run impl agent
  log.info('Dispatching implementation agent...');
  logAgent(logFile, 'impl', 'START');
  const implResult = await runAgent(config, 'impl', 'Implementation Agent');
  logAgent(logFile, 'impl', implResult.success ? 'SUCCESS' : 'FAILED');

  if (!implResult.success) {
    log.error(
      `Implementation agent failed: ${implResult.error ?? 'Unknown error'}`
    );
    return;
  }

  // 2. Run gates
  log.info('Running gate commands...');
  resetGateAttempts();
  const gateResult = await runGate(config);
  logGate(logFile, gateResult);

  if (gateResult.success) {
    log.success('All gates passed!');
    return;
  }

  // 3. Handle gate failure with fix attempts
  let fixAttempt = 0;
  while (!gateResult.success && fixAttempt < config.gate.maxFixAttempts) {
    fixAttempt++;
    log.warn(
      `Gate failed. Running fix agent (attempt ${fixAttempt}/${config.gate.maxFixAttempts})...`
    );

    logAgent(logFile, 'fix', 'START', fixAttempt);
    const fixResult = await runAgent(config, 'fix', 'Fix Agent');
    logAgent(
      logFile,
      'fix',
      fixResult.success ? 'SUCCESS' : 'FAILED',
      fixAttempt
    );

    if (!fixResult.success) {
      log.error(`Fix agent failed: ${fixResult.error ?? 'Unknown error'}`);
      break;
    }

    // Re-run gates
    const retryResult = await runGate(config);
    logGate(logFile, retryResult);

    if (retryResult.success) {
      log.success('Gates passed after fix!');
      return;
    }
  }

  if (!gateResult.success) {
    log.error(
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
 */
async function handleInReview(
  config: SpeciConfig,
  logFile: WriteStream,
  _options: RunOptions
): Promise<void> {
  log.info('Dispatching review agent...');
  logAgent(logFile, 'review', 'START');
  const reviewResult = await runAgent(config, 'review', 'Review Agent');
  logAgent(logFile, 'review', reviewResult.success ? 'SUCCESS' : 'FAILED');

  if (!reviewResult.success) {
    log.error(`Review agent failed: ${reviewResult.error ?? 'Unknown error'}`);
  }
}

/**
 * Handle BLOCKED state: dispatch tidy agent
 *
 * @param config - Speci configuration
 * @param logFile - Log file stream
 * @param options - Command options
 */
async function handleBlocked(
  config: SpeciConfig,
  logFile: WriteStream,
  _options: RunOptions
): Promise<void> {
  log.info('Dispatching tidy agent to unblock tasks...');
  logAgent(logFile, 'tidy', 'START');
  const tidyResult = await runAgent(config, 'tidy', 'Tidy Agent');
  logAgent(logFile, 'tidy', tidyResult.success ? 'SUCCESS' : 'FAILED');

  if (!tidyResult.success) {
    log.error(`Tidy agent failed: ${tidyResult.error ?? 'Unknown error'}`);
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
 * @param config - Speci configuration
 */
async function confirmRun(state: STATE, _config: SpeciConfig): Promise<void> {
  log.info(`Current state: ${state}`);

  const action = getActionForState(state);
  log.info(`Action: ${action}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\nProceed with run? [Y/n] ', (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        log.info('Run cancelled.');
        process.exit(0);
      }
      resolve();
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
 * @param config - Speci configuration
 * @param maxIterations - Maximum iterations
 */
function displayDryRun(
  state: STATE,
  config: SpeciConfig,
  maxIterations: number
): void {
  log.info('\n=== DRY RUN MODE ===\n');
  log.info(`Current state: ${state}`);
  log.info(`Action: ${getActionForState(state)}`);
  log.info(`Max iterations: ${maxIterations}`);
  log.info(`Gate commands: ${config.gate.commands.join(', ')}`);
  log.info(`Max fix attempts: ${config.gate.maxFixAttempts}`);
  log.info('\nNo actions will be executed.');
}

/**
 * Initialize log file for run session
 *
 * @param config - Speci configuration
 * @returns WriteStream for log file
 */
function initializeLogFile(config: SpeciConfig): WriteStream {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = join(config.paths.logs, `speci-run-${timestamp}.log`);

    // Ensure log directory exists
    if (!existsSync(config.paths.logs)) {
      mkdirSync(config.paths.logs, { recursive: true });
    }

    const stream = createWriteStream(logPath, { flags: 'a' });

    // Handle stream errors
    stream.on('error', () => {
      // Suppress errors during testing
    });

    // Write header
    stream.write(`=== Speci Run Session ===\n`);
    stream.write(`Started: ${new Date().toISOString()}\n`);
    stream.write(`PID: ${process.pid}\n\n`);

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
    success: boolean;
    results: Array<{ command: string; success: boolean; exitCode: number }>;
  }
): void {
  const timestamp = new Date().toISOString();
  logFile.write(
    `[${timestamp}] GATE ${result.success ? 'PASSED' : 'FAILED'}\n`
  );
  for (const r of result.results) {
    logFile.write(
      `  - ${r.command}: ${r.success ? 'PASS' : `FAIL (exit ${r.exitCode})`}\n`
    );
  }
}
