/**
 * Exit Utility Module
 *
 * Provides exit helper functions that ensure cleanup runs before process
 * termination. Includes timeout protection and double-cleanup guards to
 * prevent resource leaks and hanging on exit.
 */

import { runCleanup } from './signals.js';
import { log } from './logger.js';

/**
 * Internal state to track cleanup execution
 */
let isCleaningUp = false;

/**
 * Exit with cleanup execution
 *
 * Runs all registered cleanup handlers before calling process.exit().
 * Includes protection against double-cleanup attempts and force exits
 * if cleanup is already in progress.
 *
 * @param exitCode - Exit code to pass to process.exit()
 * @returns Never returns (process terminates)
 */
export async function exitWithCleanup(exitCode: number): Promise<never> {
  if (isCleaningUp) {
    log.error('Cleanup already in progress, forcing exit');
    process.exit(exitCode);
  }

  isCleaningUp = true;
  try {
    await runCleanup();
  } catch (error) {
    log.error(
      `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  process.exit(exitCode);
}

/**
 * Synchronous exit without cleanup
 *
 * Calls process.exit() immediately without running cleanup handlers.
 * Use only in contexts where cleanup has already run or is not needed.
 *
 * @param exitCode - Exit code to pass to process.exit()
 * @returns Never returns (process terminates)
 */
export function exitSync(exitCode: number): never {
  process.exit(exitCode);
}

/**
 * Reset exit state for testing
 *
 * Clears the isCleaningUp flag to allow tests to run cleanup multiple times.
 * Should only be used in test environments.
 */
export function resetExitState(): void {
  isCleaningUp = false;
}
