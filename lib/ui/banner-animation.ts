/**
 * Banner Animation Module
 *
 * Provides animated rendering of the SPECI ASCII art banner.
 * Only runs when speci is invoked without arguments (no-args case).
 *
 * Respects terminal capabilities and environment settings:
 * - NO_COLOR environment variable
 * - SPECI_NO_ANIMATION environment variable
 * - TTY detection
 * - Color support detection
 * - Terminal dimensions
 */

// These imports will be used in future tasks
// @ts-expect-error - Will be used in TASK_002 and later
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BANNER_ART } from './banner.js';
// @ts-expect-error - Will be used in TASK_004 and later
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { terminalState } from './terminal.js';
import { supportsColor } from './colors.js';
// @ts-expect-error - Will be used in TASK_019
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { registerCleanup, unregisterCleanup } from '../utils/signals.js';

/**
 * Total animation duration in milliseconds
 */
export const DURATION = 2000;

/**
 * Frame interval in milliseconds (~60fps target)
 */
export const FRAME_INTERVAL = 16;

/**
 * Target frames per second
 */
export const FPS_TARGET = 60;

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
 * Banner requires:
 * - 6 lines: ASCII art (BANNER_ART)
 * - 1 line: Version number
 * - 3 lines: Padding (top/bottom clearance)
 *
 * @returns true if terminal height >= 10 lines, false otherwise
 * @remarks Returns false if process.stdout.rows is undefined (non-TTY)
 */
export function hasMinimumHeight(): boolean {
  return (process.stdout.rows ?? 0) >= MIN_TERMINAL_HEIGHT;
}

/**
 * Parse hex color string to RGB tuple
 *
 * Extracts 6 hex digits from color string (e.g., "#0ea5e9" → [14, 165, 233])
 * Used for color interpolation in gradient computation.
 *
 * Input colors are sourced from hardcoded HEX_COLORS constant.
 * RGB output values guaranteed in range [0, 255] by hex format.
 *
 * @param hex - Hex color string (e.g., "#0ea5e9")
 * @returns RGB tuple [r, g, b] with values in [0, 255]
 *
 * @example
 * parseHex("#0ea5e9") // [14, 165, 233]
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Linearly interpolate between two hex colors
 *
 * Computes intermediate color between colorA and colorB based on progress parameter.
 * Returns hex color string for further processing.
 * Used in wave effect to create smooth color transitions per character.
 *
 * @param colorA - Start color (e.g., "#0ea5e9")
 * @param colorB - End color (e.g., "#0284c7")
 * @param t - Progress value [0, 1] where 0 = colorA, 1 = colorB
 * @returns Interpolated hex color string
 *
 * @example
 * lerpColor("#0ea5e9", "#0284c7", 0.5) // Intermediate color
 */
// @ts-expect-error - Will be used in TASK_007 and later
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function lerpColor(colorA: string, colorB: string, t: number): string {
  const [r1, g1, b1] = parseHex(colorA);
  const [r2, g2, b2] = parseHex(colorB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Convert hex color to ANSI 24-bit RGB escape sequence
 *
 * Generates terminal escape code for 256-color ANSI display.
 * Returns string prefixed to each character for color application.
 * Part of character rendering pipeline: color → ANSI string → terminal output
 *
 * Security: ANSI code is hardcoded template literal with validated RGB values.
 * No string interpolation with external data.
 *
 * @param hex - Hex color string (e.g., "#0ea5e9")
 * @returns ANSI escape sequence (e.g., "\x1b[38;2;14;165;233m")
 *
 * @example
 * hexToAnsi("#0ea5e9") // "\x1b[38;2;14;165;233m"
 */
// @ts-expect-error - Will be used in TASK_007 and later
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Animation timing and behavior configuration.
 *
 * Passed to animateBanner() to customize animation behavior.
 * All fields are optional with sensible defaults applied internally.
 */
export interface AnimationOptions {
  /** Total animation duration in milliseconds (default: 2000ms) */
  duration?: number;

  /** Target frames per second for animation smoothness (default: 60fps = 16ms per frame) */
  fps?: number;

  /** Whether to display version number after animation completes (default: true) */
  showVersion?: boolean;

  /** Specific animation effect to use (default: random selection from available effects) */
  effect?: 'wave' | 'fade' | 'sweep';
}

/**
 * Internal animation state tracking.
 *
 * Manages animation lifecycle, timing, and cleanup during execution.
 * Local to animateBanner() function scope, not shared globally.
 */
export interface AnimationState {
  /** Indicates if animation is currently executing */
  isRunning: boolean;

  /** Animation start timestamp from Date.now() for progress calculation */
  startTime: number;

  /** Total animation duration in milliseconds (from options or default) */
  duration: number;

  /** Target milliseconds per frame for timing loop (calculated from fps) */
  frameInterval: number;

  /** Frame counter incremented each iteration (for debugging/logging) */
  currentFrame: number;

  /** Timer handle from setTimeout/setInterval for cleanup on interruption */
  timerId: NodeJS.Timeout | null;

  /** Registered cleanup function reference for unregistering on completion */
  cleanupFn: CleanupFn | null;
}

/**
 * Frame rendering output structure.
 *
 * Returned by effect functions (wave, fade, sweep) and consumed by animation loop.
 * Contains ready-to-write terminal output with positioning metadata.
 */
export interface FrameData {
  /** Banner lines for this frame with ANSI color codes applied (array of 6 strings) */
  lines: string[];

  /** Animation progress ratio from 0.0 (start) to 1.0 (complete) */
  progress: number;

  /** Terminal cursor row position to write from (for proper positioning) */
  cursorRow: number;
}

/**
 * Animation effect function signature.
 *
 * Effect functions implement visual animation logic (wave reveal, fade in, sweep).
 * Receives progress ratio, returns array of formatted banner lines.
 *
 * @param progress - Animation progress from 0.0 to 1.0
 * @returns Array of 6 banner lines with ANSI color codes applied for current progress
 */
export type AnimationEffect = (progress: number) => string[];

/**
 * Cleanup function type for signal handler registration.
 *
 * Registered via registerCleanup() to handle Ctrl+C and process termination.
 * Must restore terminal state and clear any active timers.
 */
export type CleanupFn = () => void;

/**
 * Determine if banner animation should run based on terminal capabilities
 *
 * Animation requires:
 * - Color support (via supportsColor())
 * - TTY environment (process.stdout.isTTY)
 * - NO_COLOR not set (respects user preference)
 * - SPECI_NO_ANIMATION not set (CLI-specific disable)
 * - Terminal width >= 40 characters (minimum banner width)
 * - Terminal height >= 10 lines (minimum for animation display)
 *
 * If any condition fails, returns false to trigger static banner fallback.
 *
 * @returns true if animation should run, false for static banner fallback
 */
export function shouldAnimate(): boolean {
  // E-2: Check color support
  if (!supportsColor()) {
    return false;
  }

  // E-1: Check TTY (must be interactive terminal, not pipe/redirect)
  if (!process.stdout.isTTY) {
    return false;
  }

  // E-3: Check NO_COLOR environment variable (universal color disable)
  if (process.env.NO_COLOR) {
    return false;
  }

  // Check SPECI_NO_ANIMATION (CLI-specific animation disable)
  if (process.env.SPECI_NO_ANIMATION) {
    return false;
  }

  // E-4: Check terminal width (banner requires 40 columns minimum)
  const width = process.stdout.columns ?? 80;
  if (width < 40) {
    return false;
  }

  // E-5: Check terminal height (animation requires 10 rows minimum)
  const height = process.stdout.rows ?? 24;
  if (height < 10) {
    return false;
  }

  // All checks passed - animation eligible
  return true;
}

/**
 * Async sleep utility for animation frame delays
 *
 * Wraps setTimeout in a Promise to enable async/await syntax for frame timing.
 * Used exclusively in animation loop for frame rate control (~60fps target).
 *
 * Timing accuracy depends on Node.js event loop scheduling. Actual delay may
 * be slightly longer than requested due to event loop latency. Tests should
 * use tolerance ranges (e.g., ms ± 10ms) rather than exact timing assertions.
 *
 * @param ms - Delay duration in milliseconds (typically FRAME_INTERVAL = 16ms)
 * @returns Promise that resolves after delay completes
 *
 * @example
 * // In animation loop
 * await sleep(FRAME_INTERVAL);  // Wait ~16ms before next frame
 *
 * @internal
 */
// Used in TASK_008, currently unused but needed for future animation loop
// @ts-expect-error - TS6133: Will be used in TASK_008
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Placeholder for future implementation
// Future tasks will add:
// - Animation effect functions (TASK_007, TASK_008)
// - animateBanner() orchestrator (TASK_009)
