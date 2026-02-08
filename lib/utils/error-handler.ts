/**
 * Error handling utilities for command error handling
 */

import type { ILogger } from '../interfaces.js';

/**
 * Command execution result with error
 */
export interface CommandErrorResult {
  success: false;
  exitCode: 1;
  error: string;
}

/**
 * Handle command errors consistently
 *
 * @param error - The error that was caught
 * @param commandName - Name of the command that failed
 * @param logger - Logger instance for error output
 * @returns Structured error result
 */
export function handleCommandError(
  error: unknown,
  commandName: string,
  logger: ILogger
): CommandErrorResult {
  const errorMsg = error instanceof Error ? error.message : String(error);
  logger.error(`${commandName} command failed: ${errorMsg}`);

  return {
    success: false,
    exitCode: 1,
    error: errorMsg,
  };
}
