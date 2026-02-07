/**
 * Color Utilities Module
 *
 * Provides functions for applying colors to text, detecting terminal color support,
 * and handling ANSI escape codes. Builds upon the color palette to provide practical
 * color application throughout the CLI.
 *
 * Features:
 * - Terminal capability detection (TTY, NO_COLOR, FORCE_COLOR, CI)
 * - ANSI code stripping for accurate string length measurement
 * - High-level colorize() function respecting user preferences
 */

import { ANSI, HEX_COLORS } from '@/ui/palette.js';
import { ENV } from '@/constants.js';

/**
 * Type for valid color names from the palette
 */
export type ColorName = keyof typeof HEX_COLORS;

/**
 * ANSI escape sequence pattern (covers CSI sequences)
 * Matches SGR (Select Graphic Rendition) codes used for colors
 */
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Check if terminal supports color output
 *
 * Priority: NO_COLOR > FORCE_COLOR > CI detection > TTY check
 *
 * Environment variables:
 * - NO_COLOR: When set (to any value), disables colors (takes precedence)
 * - FORCE_COLOR: When set (to any value), enables colors even in non-TTY
 * - CI: When set, assumes non-interactive environment
 * - CONTINUOUS_INTEGRATION: When set, assumes non-interactive environment
 *
 * @returns true if colors should be used, false otherwise
 * @see https://no-color.org/
 */
export function supportsColor(): boolean {
  // NO_COLOR takes absolute precedence (https://no-color.org/)
  if (process.env[ENV.NO_COLOR] !== undefined) {
    return false;
  }

  // FORCE_COLOR overrides TTY detection
  if (process.env[ENV.FORCE_COLOR] !== undefined) {
    return true;
  }

  // CI environments typically don't support interactive colors
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    return false;
  }

  // Fallback to TTY detection
  return process.stdout.isTTY ?? false;
}

/**
 * Strip ANSI escape codes from string
 *
 * Removes all ANSI escape sequences to get plain text.
 * Handles nested and multiple escape codes.
 *
 * @param str - String with potential ANSI codes
 * @returns Plain text string
 */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Get visible length of string (excluding ANSI codes)
 *
 * Uses stripAnsi() internally for accurate measurement.
 * Essential for text alignment and box drawing calculations.
 *
 * @param str - String to measure
 * @returns Visible character count
 */
export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Apply color to text string
 *
 * Returns ANSI-wrapped text when colors are supported,
 * plain text when colors are disabled (NO_COLOR).
 * Automatically appends reset code after color application.
 *
 * @param text - Text to colorize
 * @param color - Color name from palette (sky200, sky400, sky500, success, warning, error, etc.)
 * @returns ANSI-wrapped text or plain text if NO_COLOR
 */
export function colorize(text: string, color: ColorName): string {
  if (!supportsColor()) {
    return text;
  }

  const ansiCode = ANSI[color];
  if (!ansiCode) {
    return text;
  }

  return `${ansiCode}${text}${ANSI.reset}`;
}
