/**
 * Logger Module
 *
 * Provides styled console output with semantic coloring (info, error, warn, success, debug).
 * Supports verbose mode via the SPECI_DEBUG environment variable or setVerbose() function.
 */

import type { WriteStream } from 'node:fs';
import { colorize } from '@/ui/colors.js';
import { getGlyph } from '@/ui/glyphs.js';
import { drawBox } from '@/ui/box.js';
import { ENV } from '@/constants.js';
import type { ILogger, IProcess } from '@/interfaces/index.js';

function isDebugMode(proc: IProcess): boolean {
  return (
    proc.env[ENV.SPECI_DEBUG] === '1' || proc.env[ENV.SPECI_DEBUG] === 'true'
  );
}

/**
 * Get timestamp for debug messages
 * @returns Time string in HH:MM:SS format
 */
function getTimestamp(): string {
  return new Date().toISOString().split('T')[1].split('.')[0];
}

type LoggerWithVerbose = ILogger & {
  isVerbose(): boolean;
};

/**
 * Create a logger instance bound to a process object.
 */
export function createLogger(proc: IProcess): LoggerWithVerbose {
  let verboseMode = false;

  const isVerbose = (): boolean => verboseMode || isDebugMode(proc);

  return {
    /**
     * Log informational message (blue styled)
     * @param message - Message to log
     */
    info(message: string): void {
      console.log(colorize(`${getGlyph('bullet')} ${message}`, 'sky400'));
    },

    /**
     * Log error message with error glyph (red styled)
     * @param message - Error message to log
     */
    error(message: string): void {
      console.error(colorize(`${getGlyph('error')} ${message}`, 'error'));
    },

    /**
     * Log warning message with warning glyph (yellow/amber styled)
     * @param message - Warning message to log
     */
    warn(message: string): void {
      console.warn(colorize(`${getGlyph('warning')} ${message}`, 'warning'));
    },

    /**
     * Log success message with success glyph (green styled)
     * @param message - Success message to log
     */
    success(message: string): void {
      console.log(colorize(`${getGlyph('success')} ${message}`, 'success'));
    },

    /**
     * Log debug message (only when verbose mode or SPECI_DEBUG is enabled)
     * Includes timestamp in output
     *
     * @param message - Debug message to log
     */
    debug(message: string): void {
      if (isVerbose()) {
        console.log(colorize(`[${getTimestamp()}] DEBUG: ${message}`, 'dim'));
      }
    },

    /**
     * Log muted message (dim styled, for less important info)
     * @param message - Message to log in muted style
     */
    muted(message: string): void {
      console.log(colorize(message, 'dim'));
    },

    /**
     * Log raw message without any formatting or glyphs
     * @param message - Message to log as-is
     */
    raw(message: string): void {
      console.log(message);
    },

    /**
     * Log informational message without glyph prefix (blue styled)
     * Use for multi-line or formatted messages where prefix would look awkward
     * @param message - Message to log
     */
    infoPlain(message: string): void {
      console.log(colorize(message, 'sky400'));
    },

    /**
     * Log warning message without glyph prefix (yellow/amber styled)
     * Use for multi-line or formatted messages where prefix would look awkward
     * @param message - Message to log
     */
    warnPlain(message: string): void {
      console.warn(colorize(message, 'warning'));
    },

    /**
     * Log error message without glyph prefix (red styled)
     * Use for multi-line or formatted messages where prefix would look awkward
     * @param message - Message to log
     */
    errorPlain(message: string): void {
      console.error(colorize(message, 'error'));
    },

    /**
     * Log success message without glyph prefix (green styled)
     * Use for multi-line or formatted messages where prefix would look awkward
     * @param message - Message to log
     */
    successPlain(message: string): void {
      console.log(colorize(message, 'success'));
    },

    setVerbose(enabled: boolean): void {
      verboseMode = enabled;
    },

    isVerbose,
  };
}

/**
 * Styled logging object with semantic methods.
 */
export const log = createLogger(process);

/**
 * Enable or disable verbose mode on the module-level logger.
 *
 * @param enabled - Whether to enable verbose mode
 */
export function setVerbose(enabled: boolean): void {
  log.setVerbose(enabled);
}

/**
 * Check if verbose mode is enabled for the module-level logger.
 */
export function isVerbose(): boolean {
  return log.isVerbose();
}

/**
 * Log debug message with optional data (only in verbose mode)
 *
 * @param message - Debug message to log
 * @param data - Optional data to stringify and log
 */
export function debug(message: string, data?: unknown): void {
  if (!isVerbose()) return;

  const prefix = colorize('[DEBUG]', 'dim');
  console.error(`${prefix} ${message}`);

  if (data !== undefined) {
    console.error(colorize(JSON.stringify(data, null, 2), 'dim'));
  }
}

/**
 * Log error with optional stack trace (verbose shows full trace)
 *
 * @param error - Error object to log
 * @param context - Optional context description
 */
export function logError(error: Error, context?: string): void {
  const message = context ? `${context}: ${error.message}` : error.message;

  log.error(message);

  if (isVerbose() && error.stack) {
    console.error('\n' + colorize('Stack trace:', 'dim'));
    console.error(colorize(error.stack, 'dim'));
  }
}

/**
 * Log a section header with decorative box
 * @param title - Section title
 * @param subtitle - Optional subtitle (displayed in dimmed text)
 */
export function logSection(title: string, subtitle?: string): void {
  const content = subtitle ? [title, colorize(subtitle, 'dim')] : [title];
  console.log(drawBox(content, { borderColor: 'sky500', padding: 0 }));
}

/**
 * Close a log file stream gracefully
 *
 * @param logFile - WriteStream to close
 * @returns Promise that resolves when the log file is closed
 */
export async function closeLogFile(logFile: WriteStream): Promise<void> {
  return new Promise<void>((resolve) => {
    logFile.end(() => {
      resolve();
    });
  });
}
