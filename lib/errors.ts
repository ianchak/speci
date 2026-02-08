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
 * Context object for error interpolation
 */
export type ErrorContext = Record<string, string | number | undefined>;

/**
 * All error codes used by speci CLI
 *
 * Error codes are grouped by category:
 * - ERR-PRE-* : Prerequisite errors (missing dependencies, environment issues)
 * - ERR-INP-* : Input errors (invalid arguments, missing files)
 * - ERR-STA-* : State errors (lock conflicts, state parsing)
 * - ERR-EXE-* : Execution errors (command failures, timeouts)
 * - ERR-UI-*  : UI errors (rendering, color parsing)
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
  'ERR-PRE-06': {
    message: 'No PROGRESS.md found in run command',
    cause: 'Run command requires PROGRESS.md to track implementation state',
    solution: 'Run speci init to initialize project structure',
  },

  // Input Errors (ERR-INP-*)
  'ERR-INP-01': {
    message: 'Required argument missing',
    cause: 'A required command argument was not provided',
    solution: 'Check command usage with --help',
  },
  'ERR-INP-02': {
    message: 'Agent file not found: {{path}}',
    cause: 'Specified agent file does not exist at the given path',
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
  'ERR-INP-06': {
    message: 'Config version {{version}} is not compatible',
    cause: 'Configuration file uses an incompatible version format',
    solution: 'Update config to version 1.x or regenerate with speci init',
  },
  'ERR-INP-07': {
    message: 'Path {{path}} attempts to escape project directory',
    cause: 'Configuration path contains directory traversal (../) sequences',
    solution: 'Use relative paths within the project directory only',
  },
  'ERR-INP-08': {
    message: 'Invalid copilot.permissions value',
    cause: 'Permission value must be one of: allow-all, yolo, strict, none',
    solution: 'Update copilot.permissions in config to a valid value',
  },
  'ERR-INP-09': {
    message: 'Invalid gate.maxFixAttempts value',
    cause: 'maxFixAttempts must be at least 1',
    solution: 'Set gate.maxFixAttempts to a positive integer in config',
  },
  'ERR-INP-10': {
    message: 'Invalid loop.maxIterations value',
    cause: 'maxIterations must be at least 1',
    solution: 'Set loop.maxIterations to a positive integer in config',
  },
  'ERR-INP-11': {
    message: 'Subagent prompt not found: {{subagent}}',
    cause: 'Bundled agent template file is missing from installation',
    solution: 'Reinstall speci package or use custom agent path in config',
  },

  // State Errors (ERR-STA-*)
  'ERR-STA-01': {
    message:
      'Another speci instance is running (PID: {{pid}}, started: {{elapsed}} ago)',
    cause: 'Lock file exists indicating another instance may be running',
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
  'ERR-EXE-05': {
    message: 'Failed to create directory: {{path}}',
    cause: 'Directory creation failed due to permissions or filesystem error',
    solution: 'Check directory permissions and available disk space',
  },
  'ERR-EXE-06': {
    message: 'Failed to write file: {{path}}',
    cause: 'File write operation failed due to permissions or filesystem error',
    solution: 'Check file permissions and available disk space',
  },
  'ERR-EXE-07': {
    message: 'Agent templates directory not found: {{path}}',
    cause: 'Bundled agent templates are missing from installation',
    solution: 'Reinstall speci package to restore bundled agent templates',
  },
  'ERR-EXE-08': {
    message: 'Failed to copy agent files',
    cause: 'Agent file copy operation failed',
    solution: 'Check filesystem permissions and available disk space',
  },

  // UI Errors (ERR-UI-*)
  'ERR-UI-01': {
    message: 'Invalid hex color: {{hex}}',
    cause: 'Color value does not match hex color format (#RRGGBB)',
    solution: 'Use valid 6-digit hex color code (e.g., #FF5733)',
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
 * Interpolate context variables in a template string
 *
 * @param template - Template string with {{variable}} placeholders
 * @param context - Context object with variable values
 * @returns Interpolated string
 */
function interpolateContext(template: string, context: ErrorContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Format error message with code, cause, and solution
 *
 * @param code - Error code
 * @param contextJson - Optional JSON string containing context variables for interpolation
 * @returns Formatted error message
 */
export function formatError(code: string, contextJson?: string): string {
  const def = getErrorDefinition(code);
  if (!def) {
    return `Unknown error code: ${code}`;
  }

  // Parse context if provided
  let context: ErrorContext = {};
  if (contextJson) {
    try {
      context = JSON.parse(contextJson);
    } catch {
      // If parsing fails, include the raw context as a string
      context = { raw: contextJson };
    }
  }

  // Interpolate context variables in message, cause, and solution
  const message = interpolateContext(def.message, context);
  const cause = interpolateContext(def.cause, context);
  const solution = interpolateContext(def.solution, context);

  let formatted = `[${code}] ${message}`;
  if (contextJson && Object.keys(context).length > 0) {
    formatted += `\n  Context: ${contextJson}`;
  }
  formatted += `\n  Cause: ${cause}`;
  formatted += `\n  Solution: ${solution}`;

  return formatted;
}

/**
 * Create error with structured code and message
 *
 * @param code - Error code
 * @param contextJson - Optional JSON string containing context variables for interpolation
 * @returns Error object with formatted message
 */
export function createError(code: string, contextJson?: string): Error {
  const message = formatError(code, contextJson);
  const error = new Error(message);
  error.name = code;
  return error;
}
