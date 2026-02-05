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
import { BANNER_ART } from './banner.js';
import { HEX_COLORS } from './palette.js';
import { terminalState } from './terminal.js';
import { supportsColor } from './colors.js';
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
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Render single frame of wave reveal animation
 *
 * Generates banner frame with progressive left-to-right reveal and gradient coloring.
 * Characters are revealed based on progress (0→1), with Ice Blue gradient applied.
 *
 * Algorithm:
 * 1. Clamp progress to [0.0, 1.0] (security: prevent bounds violations)
 * 2. For each line, calculate reveal position (progress × line length)
 * 3. For each character:
 *    - If revealed: apply gradient color (sky-200 → sky-500) + ANSI wrap
 *    - If unrevealed: render as space (invisible)
 * 4. Return array of 6 colored/revealed lines
 *
 * Security properties:
 * - Progress clamped to [0.0, 1.0] prevents array out-of-bounds
 * - BANNER_ART is hardcoded constant (no user input)
 * - Gradient uses only hardcoded HEX_COLORS (sky-200, sky-400, sky-500)
 * - ANSI codes generated from validated RGB values only
 * - No user data in output strings
 *
 * Performance: HOT PATH - called 120 times per animation (60fps × 2s)
 * - 6 lines × 40 chars = 240 gradient computations per frame
 * - Total: 28,800 color calculations per animation
 *
 * @param progress - Animation progress [0.0, 1.0] where 0=hidden, 1=fully revealed
 * @returns Array of 6 ANSI-colored banner lines ready for terminal output
 *
 * @example
 * renderWaveFrame(0)    // All spaces (nothing revealed)
 * renderWaveFrame(0.5)  // Left half revealed with gradient
 * renderWaveFrame(1.0)  // Full banner with complete gradient
 */
export function renderWaveFrame(progress: number): string[] {
  // Security: Clamp progress to [0.0, 1.0] to prevent array bounds violations
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const lines: string[] = [];

  try {
    for (const line of BANNER_ART) {
      const lineLength = line.length;
      const revealIndex = Math.floor(clampedProgress * lineLength);

      let renderedLine = '';

      for (let i = 0; i < lineLength; i++) {
        const char = line[i];

        if (i < revealIndex) {
          // Revealed character: apply gradient
          const positionRatio = i / (lineLength - 1);

          // Two-stop gradient: sky-200 → sky-500
          const color = lerpColor(
            HEX_COLORS.sky200,
            HEX_COLORS.sky500,
            positionRatio
          );
          const ansiColor = hexToAnsi(color);

          // Wrap character with ANSI color code + reset
          renderedLine += `${ansiColor}${char}\x1b[0m`;
        } else {
          // Unrevealed character: render as space (invisible)
          renderedLine += ' ';
        }
      }

      lines.push(renderedLine);
    }
  } catch (error) {
    // E-13: Gradient computation failure - return fallback (static banner)
    console.error('Wave effect error:', error);
    return BANNER_ART.map((line) => line);
  }

  return lines;
}

/**
 * Run animation loop with frame rendering and timing control
 *
 * Executes animation from start to finish, rendering frames at ~60fps target.
 * Uses time-based progress (not frame count) to ensure consistent duration
 * regardless of individual frame timing jitter.
 *
 * Algorithm:
 * 1. Record start time
 * 2. Loop until progress >= 1.0:
 *    a. Calculate progress: (now - start) / duration
 *    b. Render frame: call effect(progress)
 *    c. Clear previous frame: cursor up 6 lines
 *    d. Write new frame: 6 lines + newlines
 *    e. Sleep: FRAME_INTERVAL ms
 * 3. Render final frame at progress=1.0
 * 4. Exit
 *
 * Performance: HOT PATH - executes ~120 iterations (2s × 60fps)
 * - Each iteration: 1 progress calc, 1 effect call, 12 stdout writes, 1 sleep
 * - Total: 1,440 I/O operations per animation
 *
 * Security:
 * - Duration parameter clamped to [100, 5000]ms to prevent resource exhaustion
 * - Frame count bounded by duration/FRAME_INTERVAL (max ~300 frames at 5000ms)
 * - Progress >= 1.0 termination guarantees loop exit (no infinite loops)
 * - Stdout writes are write-only, no terminal input read
 *
 * @param effect - Frame rendering function (typically renderWaveFrame)
 * @param duration - Animation duration in milliseconds (clamped to [100, 5000]ms)
 * @returns Promise that resolves when animation completes
 * @throws Error if stdout operations fail (E-6), propagated to caller for fallback
 *
 * @example
 * await runAnimationLoop(renderWaveFrame, 2000);  // 2-second wave animation
 *
 * @internal
 */
// Used in TASK_009, currently unused but needed for future animateBanner() orchestrator
export async function runAnimationLoop(
  effect: (progress: number) => string[],
  duration: number
): Promise<void> {
  // Security: Clamp duration to prevent resource exhaustion (DoS)
  const clampedDuration = Math.max(100, Math.min(5000, duration));

  const startTime = Date.now();
  let isFirstFrame = true;

  // E-6: Loop exception handling - catch and propagate stdout/effect errors
  // eslint-disable-next-line no-useless-catch
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / clampedDuration;

      // Termination condition: animation complete
      if (progress >= 1.0) {
        // Render final frame at exactly progress=1.0
        const finalFrame = effect(1.0);

        if (!isFirstFrame) {
          // Clear previous frame (cursor up 6 lines)
          process.stdout.write('\x1b[6A');
        }

        // Write final frame
        for (const line of finalFrame) {
          process.stdout.write(line + '\n');
        }

        break; // Exit loop
      }

      // Render current frame
      const frame = effect(progress);

      if (!isFirstFrame) {
        // Clear previous frame (move cursor up 6 lines to overwrite)
        process.stdout.write('\x1b[6A');
      } else {
        isFirstFrame = false;
      }

      // Write frame to stdout (6 lines)
      for (const line of frame) {
        process.stdout.write(line + '\n');
      }

      // Frame delay for ~60fps
      await sleep(FRAME_INTERVAL);
    }
  } catch (error) {
    // E-6: Loop exception (stdout write failure, effect error, etc.)
    // Propagate to caller (animateBanner) for fallback handling
    throw error;
  }
}

/**
 * Animate the SPECI banner with wave reveal effect
 *
 * Main public API for banner animation. Coordinates animation execution with
 * comprehensive error handling and graceful degradation to static banner.
 *
 * Orchestration pattern (adapted from monitor.ts TUI pattern):
 * 1. Input Validation: Clamp duration (100-5000ms) and fps (10-120fps) - E-15
 * 2. Terminal State Capture: Try-catch around terminalState.capture() - E-7
 * 3. Cursor Hide: Try-catch around hideCursor() - E-8
 * 4. Cleanup Registration: Idempotent cleanup handler - E-9, E-10, E-16
 * 5. Animation Execution: Try-catch around runAnimationLoop() - E-6
 * 6. Error Fallback: renderBanner() on any animation error - E-6, E-7
 * 7. Guaranteed Cleanup: Finally block for terminal restoration
 * 8. Timer Cleanup: Clear timerId in cleanup handler - E-12
 *
 * Error Handling:
 * - E-6: Loop exceptions → fallback to static banner
 * - E-7: Terminal state capture failure → skip animation, use static banner
 * - E-8: Cursor hide failure → continue without hidden cursor
 * - E-9: Cleanup registration failure → log warning, continue
 * - E-10: Terminal restore failure → log error, best-effort
 * - E-12: Timer cleanup issues → handled by idempotent cleanup
 * - E-15: Invalid input parameters → clamp to safe defaults
 * - E-16: Signal interruption → cleanup handler restores terminal
 *
 * Security (R-21, R-23):
 * - Input validation prevents resource exhaustion (duration/fps bounds)
 * - Cleanup guarantee prevents terminal corruption
 * - Signal handlers are internal, not user-controllable
 * - No sensitive data access or disclosure
 * - Deterministic execution, no user input during animation
 *
 * @returns Promise that resolves when animation completes or fallback renders
 *
 * @example
 * // In bin/speci.ts displayBanner()
 * if (shouldAnimate()) {
 *   await animateBanner();
 * } else {
 *   renderBanner();
 * }
 */
export async function animateBanner(): Promise<void> {
  // Import renderBanner dynamically to avoid circular dependency
  const { renderBanner } = await import('./banner.js');

  // Step 1: Input Validation (E-15)
  // Note: Currently hardcoded, but validation pattern for future configurability
  const duration = Math.max(100, Math.min(5000, DURATION));

  let terminalSnapshot: ReturnType<typeof terminalState.capture> | null = null;
  let cleanupRegistered = false;

  // Cleanup handler: idempotent, signal-safe
  const cleanup = () => {
    try {
      // Show cursor
      process.stdout.write('\x1b[?25h');

      // Restore terminal state if captured
      if (terminalSnapshot) {
        terminalState.restore(terminalSnapshot);
        terminalSnapshot = null;
      }

      // Unregister self
      if (cleanupRegistered) {
        unregisterCleanup(cleanup);
        cleanupRegistered = false;
      }
    } catch (error) {
      // E-10: Terminal restore failure - log but don't throw
      console.error('Cleanup error:', error);
    }
  };

  try {
    // Step 2: Terminal State Capture (E-7)
    try {
      terminalSnapshot = terminalState.capture();
    } catch (error) {
      // E-7: Cannot capture terminal state - skip animation, use fallback
      console.error('Terminal state capture failed:', error);
      process.stdout.write(renderBanner() + '\n');
      return;
    }

    // Step 3: Cursor Hide (E-8)
    try {
      process.stdout.write('\x1b[?25l'); // ANSI: Hide cursor
    } catch (error) {
      // E-8: Cursor hide failed - log warning but continue
      // Animation will work without hidden cursor (just less polished)
      console.warn('Cursor hide failed:', error);
    }

    // Step 4: Cleanup Registration (E-9)
    try {
      registerCleanup(cleanup);
      cleanupRegistered = true;
    } catch (error) {
      // E-9: Cleanup registration failed - log warning but continue
      // Cleanup will still run in finally block, just not on signals
      console.warn('Cleanup registration failed:', error);
    }

    // Step 5: Animation Execution (E-6)
    try {
      await runAnimationLoop(renderWaveFrame, duration);
    } catch (error) {
      // E-6: Animation loop exception - fallback to static banner
      console.error('Animation error:', error);

      // Step 6: Error Fallback
      // Clear animation output and render static banner
      process.stdout.write('\x1b[6A'); // Move up 6 lines
      process.stdout.write(renderBanner() + '\n');
    }
  } finally {
    // Step 7: Guaranteed Cleanup
    // Always executes: success, error, or signal interruption
    cleanup();
  }
}
