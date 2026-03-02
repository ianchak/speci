/**
 * Error handling utilities for command error handling
 */

import type { CommandResult, ILogger } from '@/interfaces.js';
import type { ValidationError } from '@/validation/types.js';

/**
 * Command execution result with error
 */
export interface CommandErrorResult {
  success: false;
  exitCode: 1;
  error: string;
}

/**
 * Extract a string message from an unknown caught error value.
 *
 * @param error - Unknown error value
 * @returns Extracted message string
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function failResult(
  error: string
): CommandResult & { success: false; exitCode: 1; error: string };
export function failResult(
  error: string,
  exitCode: number
): CommandResult & { success: false; error: string };
/**
 * Build a consistent command failure result.
 *
 * @param error - Error message to return
 * @param exitCode - Exit code for the failure (defaults to 1)
 * @returns Standardized command failure result
 */
export function failResult(
  error: string,
  exitCode: number = 1
): CommandResult & { success: false; error: string } {
  return {
    success: false,
    exitCode,
    error,
  };
}

/**
 * Log a validation error (message + suggestions) and return a failure result.
 *
 * @param error - Validation error from a failed ValidationResult
 * @param logger - Logger used for output
 * @returns Standardized command failure result
 */
export function failValidation(
  error: ValidationError,
  logger: ILogger
): CommandResult & { success: false; exitCode: 1; error: string } {
  logger.error(error.message);
  error.suggestions?.forEach((suggestion) => logger.info(suggestion));
  return failResult(error.message);
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
  if (error instanceof Error && error.name === 'ERR-INP-02') {
    logger.error(error.message);
    logger.info('Run "speci init" to create agents');
    return failResult(error.message);
  }

  const errorMsg = toErrorMessage(error);
  logger.error(`${commandName} command failed: ${errorMsg}`);

  return failResult(errorMsg);
}
