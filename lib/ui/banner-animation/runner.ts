/**
 * Banner Animation Runner Module
 *
 * Consolidates terminal capability detection, animation loop timing, and the
 * animateBanner entry point into a single module.
 */

import { ENV } from '@/constants.js';
import { VERSION, BANNER_ART } from '@/ui/banner.js';
import { supportsColor } from '@/ui/colors.js';
import { HEX_COLORS } from '@/ui/palette.js';
import { terminalState } from '@/ui/terminal.js';
import { log } from '@/utils/logger.js';
import { registerCleanup, unregisterCleanup } from '@/utils/signals.js';
import {
  clearGradientCache,
  renderWaveFrame,
  renderFadeFrame,
  renderSweepFrame,
} from './effects.js';

/**
 * Minimum terminal height required for banner animation
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
  if (height < MIN_TERMINAL_HEIGHT) {
    return false;
  }

  return true;
}

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
 * Version animation duration in milliseconds
 */
export const VERSION_DURATION = 400;

/**
 * Version animation FPS (lower than banner for simpler effect)
 */
export const VERSION_FPS = 30;

/**
 * ANSI escape code constants
 */
const ANSI_CURSOR_HIDE = '\x1b[?25l';
const ANSI_CURSOR_SHOW = '\x1b[?25h';
const ANSI_CURSOR_UP_6 = '\x1b[6A';
const ANSI_RESET = '\x1b[0m';

/**
 * Cleanup function type for signal handler registration
 */
export type CleanupFn = () => void;

/**
 * Internal animation state tracking
 */
export interface AnimationState {
  isRunning: boolean;
  startTime: number;
  duration: number;
  frameInterval: number;
  currentFrame: number;
  timerId: NodeJS.Timeout | null;
  cleanupFn: CleanupFn | null;
}

/**
 * Animation effect function signature
 */
export type AnimationEffect = (progress: number) => string[];

/**
 * Available animation effects for random selection
 */
const ANIMATION_EFFECTS: AnimationEffect[] = [
  renderWaveFrame,
  renderFadeFrame,
  renderSweepFrame,
];

/**
 * Select a random animation effect
 *
 * @returns Randomly selected animation effect function
 */
export function selectRandomEffect(): AnimationEffect {
  const index = Math.floor(Math.random() * ANIMATION_EFFECTS.length);
  return ANIMATION_EFFECTS[index];
}

/**
 * Async sleep utility for animation frame delays
 *
 * @param ms - Delay duration in milliseconds
 * @param state - Optional animation state for timer tracking
 * @returns Promise that resolves after delay completes
 */
async function sleep(ms: number, state?: AnimationState): Promise<void> {
  return new Promise((resolve) => {
    const timerId = setTimeout(() => {
      if (state) {
        state.timerId = null;
      }
      resolve();
    }, ms);

    if (state) {
      state.timerId = timerId;
    }
  });
}

/**
 * Convert hex color to ANSI 24-bit RGB escape sequence
 *
 * @param hex - Hex color string (e.g., "#0ea5e9")
 * @returns ANSI escape sequence
 */
function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Run animation loop with frame rendering and timing control
 *
 * @param effect - Frame rendering function
 * @param duration - Animation duration in milliseconds
 * @param state - Animation state for timer tracking
 * @returns Promise that resolves when animation completes
 */
export async function runAnimationLoop(
  effect: (progress: number) => string[],
  duration: number,
  state: AnimationState
): Promise<void> {
  const clampedDuration = Math.max(100, Math.min(5000, duration));

  state.isRunning = true;
  state.startTime = Date.now();
  state.duration = clampedDuration;
  state.currentFrame = 0;

  const startTime = state.startTime;
  let isFirstFrame = true;

  try {
    while (true) {
      if (!state.isRunning) {
        break;
      }

      const elapsed = Date.now() - startTime;
      const progress = elapsed / clampedDuration;

      if (progress >= 1.0) {
        const finalFrame = effect(1.0);

        if (!isFirstFrame) {
          process.stdout.write(ANSI_CURSOR_UP_6);
        }

        process.stdout.write(finalFrame.join('\n') + '\n');

        state.isRunning = false;
        break;
      }

      const frame = effect(progress);

      if (!isFirstFrame) {
        process.stdout.write(ANSI_CURSOR_UP_6);
      } else {
        isFirstFrame = false;
      }

      process.stdout.write(frame.join('\n') + '\n');

      state.currentFrame++;

      await sleep(FRAME_INTERVAL, state);
    }
  } catch (error) {
    state.isRunning = false;
    throw error;
  }
}

/**
 * Animate version number with fade-in effect
 *
 * @param version - Version string to animate (e.g., "v0.2.0")
 * @param duration - Animation duration in milliseconds
 * @returns Promise that resolves when animation completes
 */
export async function animateVersion(
  version: string,
  duration: number
): Promise<void> {
  const frameInterval = Math.floor(1000 / VERSION_FPS);
  const startTime = Date.now();

  const bannerWidth = BANNER_ART[0].length;
  const versionText = `v${version}`;
  const padding = Math.floor((bannerWidth - versionText.length) / 2);
  const centeredPrefix = ' '.repeat(padding);

  const matrixChars = '0123456789abcdef!@#$%^&*()+-=[]{}|;:,.<>?~';
  const matrixCharsLen = matrixChars.length;

  let isFirstFrame = true;

  while (true) {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1.0, elapsed / duration);

    const lockedCount = Math.floor(progress * versionText.length);

    let displayText = '';
    for (let i = 0; i < versionText.length; i++) {
      if (i < lockedCount) {
        displayText += versionText[i];
      } else {
        const randomChar =
          matrixChars[Math.floor(Math.random() * matrixCharsLen)];
        displayText += randomChar;
      }
    }

    const ansiColor = hexToAnsi(HEX_COLORS.dim);
    const versionLine = centeredPrefix + ansiColor + displayText + ANSI_RESET;

    if (!isFirstFrame) {
      process.stdout.write('\x1b[1A');
    } else {
      isFirstFrame = false;
    }

    process.stdout.write(versionLine + '\n');

    if (progress >= 1.0) {
      break;
    }

    await sleep(frameInterval);
  }
}

/**
 * Animation timing and behavior configuration
 */
export interface AnimationOptions {
  duration?: number;
  fps?: number;
  showVersion?: boolean;
  effect?: 'wave' | 'fade' | 'sweep';
}

/**
 * Animate the SPECI banner with random or specified effect
 *
 * @param options - Optional animation configuration
 * @returns Promise that resolves when animation completes or fallback renders
 */
export async function animateBanner(options?: AnimationOptions): Promise<void> {
  const { renderBanner } = await import('@/ui/banner.js');

  clearGradientCache();

  const duration = Math.max(100, Math.min(5000, options?.duration ?? DURATION));

  let selectedEffect: AnimationEffect;
  if (options?.effect) {
    switch (options.effect) {
      case 'wave':
        selectedEffect = renderWaveFrame;
        break;
      case 'fade':
        selectedEffect = renderFadeFrame;
        break;
      case 'sweep':
        selectedEffect = renderSweepFrame;
        break;
      default:
        selectedEffect = selectRandomEffect();
        break;
    }
  } else {
    selectedEffect = selectRandomEffect();
  }

  let terminalSnapshot: ReturnType<typeof terminalState.capture> | null = null;
  let cleanupRegistered = false;

  const animState: AnimationState = {
    isRunning: false,
    startTime: 0,
    duration,
    frameInterval: FRAME_INTERVAL,
    currentFrame: 0,
    timerId: null,
    cleanupFn: null,
  };

  const cleanup = () => {
    try {
      if (animState.timerId !== null) {
        clearTimeout(animState.timerId);
        animState.timerId = null;
      }

      animState.isRunning = false;

      process.stdout.write(ANSI_CURSOR_SHOW);

      if (terminalSnapshot) {
        terminalState.restore(terminalSnapshot);
        terminalSnapshot = null;
      }

      if (cleanupRegistered) {
        unregisterCleanup(cleanup);
        cleanupRegistered = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Cleanup error: ${message}`);
    }
  };

  animState.cleanupFn = cleanup;

  try {
    try {
      terminalSnapshot = terminalState.capture();
    } catch {
      log.raw('\n' + renderBanner({ showVersion: true }) + '\n');
      return;
    }

    try {
      process.stdout.write(ANSI_CURSOR_HIDE);
    } catch {
      // Continue silently
    }

    try {
      registerCleanup(cleanup);
      cleanupRegistered = true;
    } catch {
      // Continue silently
    }

    try {
      await runAnimationLoop(selectedEffect, duration, animState);

      const showVersion = options?.showVersion ?? true;
      if (showVersion) {
        await animateVersion(VERSION, VERSION_DURATION);
      }
    } catch {
      process.stdout.write(ANSI_CURSOR_UP_6);
      log.raw('\n' + renderBanner({ showVersion: true }) + '\n');
    }
  } finally {
    cleanup();
  }
}
