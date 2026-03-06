/**
 * Exit Utility Module
 *
 * Provides exit helper functions that ensure cleanup runs before process
 * termination. Includes timeout protection and double-cleanup guards to
 * prevent resource leaks and hanging on exit.
 */

import { isRunningCleanup, runCleanup } from './signals.js';
import { log } from './logger.js';
import type { ILogger } from '@/interfaces/index.js';

function exitProcess(
  exitCode: number,
  proc?: Pick<NodeJS.Process, 'exit'>
): never {
  (proc ?? process).exit(exitCode);
  throw new Error('process.exit returned unexpectedly');
}

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
export async function exitWithCleanup(
  exitCode: number,
  logger?: ILogger,
  proc?: Pick<NodeJS.Process, 'exit'>
): Promise<never> {
  const resolvedLogger = logger ?? log;
  if (isRunningCleanup()) {
    resolvedLogger.error('Cleanup already in progress, forcing exit');
    exitProcess(exitCode, proc);
  }
  try {
    await runCleanup(resolvedLogger);
  } catch (error) {
    resolvedLogger.error(
      `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  exitProcess(exitCode, proc);
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
export function exitSync(
  exitCode: number,
  proc?: Pick<NodeJS.Process, 'exit'>
): never {
  return exitProcess(exitCode, proc);
}
