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
// @ts-expect-error - Will be used in TASK_005 and later
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// Placeholder for future implementation
// Future tasks will add:
// - Internal gradient utilities (TASK_002)
// - Animation state types (TASK_003)
// - shouldAnimate() function (TASK_004, TASK_005)
// - Animation effect functions (TASK_007, TASK_008)
// - animateBanner() orchestrator (TASK_009)
