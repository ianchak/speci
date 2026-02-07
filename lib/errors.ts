/**
 * Error Codes Module
 *
 * Defines structured error codes with messages, causes, and solutions.
 * Used for consistent error reporting across the CLI.
 */

import { CONFIG_FILENAME, MESSAGES } from '@/constants.js';

/**
 * Error code definition with diagnostic information
 */
export interface ErrorDefinition {
  message: string;
  cause: string;
  solution: string;
}

/**
 * All error codes used by speci CLI
 *
 * Error codes are grouped by category:
 * - ERR-PRE-* : Prerequisite errors (missing dependencies, environment issues)
 * - ERR-INP-* : Input errors (invalid arguments, missing files)
 * - ERR-STA-* : State errors (lock conflicts, state parsing)
 * - ERR-EXE-* : Execution errors (command failures, timeouts)
 */
export const ERROR_CODES: Record<string, ErrorDefinition> = {
  // Prerequisite Errors (ERR-PRE-*)
  'ERR-PRE-01': {
    message: 'Copilot CLI is not installed',
    cause: 'The copilot command was not found in PATH',
    solution: 'Run: npm install -g @github/copilot',
  },
  'ERR-PRE-02': {
    message: 'Copilot CLI is not authenticated',
    cause: 'Copilot CLI requires authentication to function',
    solution: 'Run /login in Copilot CLI or set GH_TOKEN environment variable',
  },
  'ERR-PRE-03': {
    message: 'Not a git repository',
    cause: 'Current directory is not inside a git repository',
    solution: 'Run git init in your project root',
  },
  'ERR-PRE-04': {
    message: 'Configuration file not found',
    cause: `${CONFIG_FILENAME} does not exist in project`,
    solution: MESSAGES.RUN_INIT,
  },
  'ERR-PRE-05': {
    message: 'PROGRESS.md file not found',
    cause: 'Progress tracking file does not exist',
    solution: 'Run speci init or create docs/PROGRESS.md manually',
  },

  // Input Errors (ERR-INP-*)
  'ERR-INP-01': {
    message: 'Required argument missing',
    cause: 'A required command argument was not provided',
    solution: 'Check command usage with --help',
  },
  'ERR-INP-02': {
    message: 'Agent file not found',
    cause: 'Specified agent file does not exist',
    solution: 'Verify agent path or use bundled agents (set to null in config)',
  },
  'ERR-INP-03': {
    message: 'Config file is malformed',
    cause: `${CONFIG_FILENAME} contains invalid JSON syntax`,
    solution: `Fix JSON syntax errors in ${CONFIG_FILENAME}`,
  },
  'ERR-INP-04': {
    message: 'Config validation failed',
    cause: 'Configuration does not match expected schema',
    solution: 'Check config values against schema requirements',
  },
  'ERR-INP-05': {
    message: 'Plan file not found',
    cause: 'Specified plan file does not exist',
    solution: 'Provide valid path with --plan option',
  },

  // State Errors (ERR-STA-*)
  'ERR-STA-01': {
    message: 'Lock file already exists',
    cause: 'Another speci instance may be running',
    solution: 'Wait for other instance to finish or use --force to override',
  },
  'ERR-STA-02': {
    message: 'Cannot parse PROGRESS.md',
    cause: 'Progress file format is invalid or corrupted',
    solution: 'Verify PROGRESS.md follows expected markdown table format',
  },
  'ERR-STA-03': {
    message: 'Invalid state transition',
    cause: 'PROGRESS.md contains invalid or conflicting state markers',
    solution: 'Check state markers (IN PROGRESS, IN REVIEW, COMPLETE, etc.)',
  },

  // Execution Errors (ERR-EXE-*)
  'ERR-EXE-01': {
    message: 'Gate command failed',
    cause: 'One or more gate validation commands failed',
    solution: 'Fix lint/typecheck/test errors reported in output',
  },
  'ERR-EXE-02': {
    message: 'Copilot execution failed',
    cause: 'Copilot CLI command exited with error',
    solution: 'Check Copilot authentication and permissions',
  },
  'ERR-EXE-03': {
    message: 'Max iterations reached',
    cause: 'Loop reached maximum iteration limit',
    solution: 'Review progress and increase --max-iterations if needed',
  },
  'ERR-EXE-04': {
    message: 'Max fix attempts exceeded',
    cause: 'Gate validation failed after maximum fix attempts',
    solution: 'Review gate failures and fix issues manually',
  },
};

/**
 * Get error definition by code
 *
 * @param code - Error code (e.g., 'ERR-PRE-01')
 * @returns Error definition or undefined if code not found
 */
export function getErrorDefinition(code: string): ErrorDefinition | undefined {
  return ERROR_CODES[code];
}

/**
 * Format error message with code, cause, and solution
 *
 * @param code - Error code
 * @param context - Optional additional context
 * @returns Formatted error message
 */
export function formatError(code: string, context?: string): string {
  const def = getErrorDefinition(code);
  if (!def) {
    return `Unknown error code: ${code}`;
  }

  let message = `[${code}] ${def.message}`;
  if (context) {
    message += `\n  Context: ${context}`;
  }
  message += `\n  Cause: ${def.cause}`;
  message += `\n  Solution: ${def.solution}`;

  return message;
}

/**
 * Create error with structured code and message
 *
 * @param code - Error code
 * @param context - Optional additional context
 * @returns Error object with formatted message
 */
export function createError(code: string, context?: string): Error {
  const message = formatError(code, context);
  const error = new Error(message);
  error.name = code;
  return error;
}
