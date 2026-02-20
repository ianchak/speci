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
 *
 * Public API: animateBanner, AnimationOptions, shouldAnimate
 * Implementation: see animate.ts
 * Submodules: renderer.ts, effects.ts, terminal.ts
 */

// Public API — primary entry point
export { animateBanner, type AnimationOptions } from './animate.js';

// Terminal capability helpers
export {
  shouldAnimate,
  hasMinimumHeight,
  MIN_TERMINAL_HEIGHT,
  type AnimateOptions,
} from './terminal.js';

// Renderer internals (re-exported for tests and advanced consumers)
export {
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

// Effect frame renderers (re-exported for tests and advanced consumers)
export {
  renderWaveFrame,
  renderFadeFrame,
  renderSweepFrame,
} from './effects.js';
