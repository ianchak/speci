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

import { terminalState } from '@/ui/terminal.js';
import { registerCleanup, unregisterCleanup } from '@/utils/signals.js';
import {
  clearGradientCache,
  renderWaveFrame,
  renderFadeFrame,
  renderSweepFrame,
} from './effects.js';
import {
  shouldAnimate,
  hasMinimumHeight,
  MIN_TERMINAL_HEIGHT,
  type AnimateOptions,
} from './terminal.js';
import {
  runAnimationLoop,
  animateVersion,
  selectRandomEffect,
  DURATION,
  FRAME_INTERVAL,
  FPS_TARGET,
  VERSION_DURATION,
  VERSION_FPS,
  type AnimationEffect,
  type AnimationState,
  type CleanupFn,
} from './renderer.js';
import { VERSION } from '@/ui/banner.js';

/**
 * Re-export public API
 */
export {
  shouldAnimate,
  hasMinimumHeight,
  MIN_TERMINAL_HEIGHT,
  DURATION,
  FRAME_INTERVAL,
  FPS_TARGET,
  VERSION_DURATION,
  VERSION_FPS,
  renderWaveFrame,
  renderFadeFrame,
  renderSweepFrame,
  selectRandomEffect,
  runAnimationLoop,
  animateVersion,
  type AnimateOptions,
  type AnimationEffect,
  type AnimationState,
  type CleanupFn,
};

/**
 * ANSI escape code constants
 */
const ANSI_CURSOR_HIDE = '\x1b[?25l';
const ANSI_CURSOR_SHOW = '\x1b[?25h';
const ANSI_CURSOR_UP_6 = '\x1b[6A';

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
 * Main public API for banner animation. Coordinates animation execution with
 * comprehensive error handling and graceful degradation to static banner.
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
    duration: duration,
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
      console.error('Cleanup error:', error);
    }
  };

  animState.cleanupFn = cleanup;

  try {
    try {
      terminalSnapshot = terminalState.capture();
    } catch {
      console.log('\n' + renderBanner({ showVersion: true }) + '\n');
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
      console.log('\n' + renderBanner({ showVersion: true }) + '\n');
    }
  } finally {
    cleanup();
  }
}
