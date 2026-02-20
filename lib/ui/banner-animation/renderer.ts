/**
 * Banner Animation Renderer Module
 *
 * Handles frame rendering, animation loop timing, and version animation.
 * Coordinates the display of animated banner frames at target frame rate.
 */

import { BANNER_ART } from '@/ui/banner.js';
import { HEX_COLORS } from '@/ui/palette.js';
import {
  renderWaveFrame,
  renderFadeFrame,
  renderSweepFrame,
} from './effects.js';

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

  let isFirstFrame = true;

  while (true) {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1.0, elapsed / duration);

    const lockedCount = Math.floor(progress * versionText.length);

    let displayText = '';
    for (let i = 0; i < versionText.length; i++) {
      if (i < lockedCount) {
        displayText += versionText[i];
      } else if (i === lockedCount && progress < 1.0) {
        const randomChar =
          matrixChars[Math.floor(Math.random() * matrixChars.length)];
        displayText += randomChar;
      } else {
        const randomChar =
          matrixChars[Math.floor(Math.random() * matrixChars.length)];
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
