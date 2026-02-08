/**
 * Banner Animation Terminal Module
 *
 * Handles terminal state detection, TTY capabilities, and cursor control.
 * Provides utilities to determine if banner animation should run based on
 * terminal capabilities and environment settings.
 */

import { supportsColor } from '@/ui/colors.js';
import { ENV } from '@/constants.js';

/**
 * Minimum terminal height required for banner animation
 *
 * Banner requires:
 * - 6 lines: ASCII art (BANNER_ART)
 * - 1 line: Version number
 * - 3 lines: Padding (top/bottom clearance)
 *
 * Total: 10 lines minimum
 */
export const MIN_TERMINAL_HEIGHT = 10;

/**
 * Check if terminal height is sufficient for banner animation
 *
 * @returns true if terminal height >= 10 lines, false otherwise
 */
export function hasMinimumHeight(): boolean {
  return (process.stdout.rows ?? 0) >= MIN_TERMINAL_HEIGHT;
}

/**
 * Options for shouldAnimate() detection
 */
export interface AnimateOptions {
  /** Whether color output is enabled (from --no-color flag) */
  color?: boolean;
}

/**
 * Determine if banner animation should run based on terminal capabilities
 *
 * Animation requires:
 * - Color support (via supportsColor())
 * - TTY environment (process.stdout.isTTY)
 * - NO_COLOR not set (respects user preference)
 * - SPECI_NO_ANIMATION not set (CLI-specific disable)
 * - --no-color flag not set (CLI flag)
 * - Terminal width >= 40 characters (minimum banner width)
 * - Terminal height >= 10 lines (minimum for animation display)
 *
 * @param options - Optional configuration for animation detection
 * @returns true if animation should run, false for static banner fallback
 */
export function shouldAnimate(options?: AnimateOptions): boolean {
  if (options?.color === false) {
    return false;
  }

  if (!supportsColor()) {
    return false;
  }

  if (!process.stdout.isTTY) {
    return false;
  }

  if (process.env[ENV.NO_COLOR]) {
    return false;
  }

  if (process.env.SPECI_NO_ANIMATION) {
    return false;
  }

  const width = process.stdout.columns ?? 80;
  if (width < 40) {
    return false;
  }

  const height = process.stdout.rows ?? 24;
  if (height < 10) {
    return false;
  }

  return true;
}
