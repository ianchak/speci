/**
 * Progress Bar Module
 *
 * Provides a decorative iteration/progress display for terminal output.
 * Renders a colored progress bar with iteration counter, label, and
 * horizontal rule borders using the Ice Blue theme palette.
 *
 * Supports both Unicode and ASCII fallback rendering.
 */

import { colorize, visibleLength } from '@/ui/colors.js';
import { getGlyph, supportsUnicode } from '@/ui/glyphs.js';
import type { ColorName } from '@/ui/colors.js';

/**
 * Unicode block characters for progress bar
 */
const BAR_CHARS = {
  filled: '\u2588', // █
  empty: '\u2591', // ░
  border: '\u2500', // ─
} as const;

/**
 * ASCII fallback characters for progress bar
 */
const ASCII_BAR_CHARS = {
  filled: '#',
  empty: '.',
  border: '-',
} as const;

/**
 * Options for rendering a progress bar
 */
export interface ProgressBarOptions {
  /** Current iteration (1-based) */
  current: number;
  /** Total iterations */
  total: number;
  /** Width of the progress bar in characters (default: 20) */
  barWidth?: number;
  /** Width of the horizontal border (default: 36) */
  borderWidth?: number;
  /** Label text (default: 'Iteration') */
  label?: string;
  /** Color for the filled portion (default: 'sky400') */
  fillColor?: ColorName;
  /** Color for the empty portion (default: 'gray') */
  emptyColor?: ColorName;
  /** Color for the label text (default: 'sky200') */
  labelColor?: ColorName;
  /** Color for the current count (default: 'sky400') */
  currentColor?: ColorName;
  /** Color for the total count (default: 'sky200') */
  totalColor?: ColorName;
  /** Color for separator and empty bar (default: 'gray') */
  separatorColor?: ColorName;
  /** Color for the border lines (default: 'sky500') */
  borderColor?: ColorName;
}

/**
 * Get the bar character set based on Unicode support
 *
 * @returns Unicode or ASCII bar characters
 */
function getBarChars(): typeof BAR_CHARS | typeof ASCII_BAR_CHARS {
  return supportsUnicode() ? BAR_CHARS : ASCII_BAR_CHARS;
}

/**
 * Render a progress bar string (just the bar, no border or label)
 *
 * @param current - Current progress value
 * @param total - Maximum progress value
 * @param barWidth - Width of the bar in characters
 * @param fillColor - Color for filled portion
 * @param emptyColor - Color for empty portion
 * @returns Colorized progress bar string
 */
export function renderBar(
  current: number,
  total: number,
  barWidth: number = 20,
  fillColor: ColorName = 'sky400',
  emptyColor: ColorName = 'gray'
): string {
  const chars = getBarChars();
  const clamped = Math.max(0, Math.min(current, total));
  const progress = total > 0 ? clamped / total : 0;
  const filled = Math.round(progress * barWidth);
  const empty = barWidth - filled;

  return (
    colorize(chars.filled.repeat(filled), fillColor) +
    colorize(chars.empty.repeat(empty), emptyColor)
  );
}

/**
 * Format an iteration counter display (e.g., "▸ Iteration 2/5")
 *
 * @param options - Progress bar options
 * @returns Formatted iteration label with colored counter
 */
export function formatIterationLabel(options: ProgressBarOptions): string {
  const {
    current,
    total,
    label = 'Iteration',
    labelColor = 'sky200',
    currentColor = 'sky400',
    totalColor = 'sky200',
    separatorColor = 'gray',
  } = options;

  const pointer = getGlyph('pointer') as string;
  const labelStr = colorize(`${pointer} ${label}`, labelColor);
  const counterStr =
    colorize(`${current}`, currentColor) +
    colorize('/', separatorColor) +
    colorize(`${total}`, totalColor);

  return `${labelStr} ${counterStr}`;
}

/**
 * Render a horizontal border line
 *
 * @param width - Width of the border in characters
 * @param borderColor - Color for the border
 * @returns Colorized border string
 */
export function renderBorder(
  width: number = 36,
  borderColor: ColorName = 'sky500'
): string {
  const chars = getBarChars();
  return colorize(chars.border.repeat(width), borderColor);
}

/**
 * Render a complete decorative iteration display
 *
 * Produces a three-line block:
 * ```
 * ────────────────────────────────────
 *   ▸ Iteration 2/5  ████████░░░░░░░░░░░░
 * ────────────────────────────────────
 * ```
 *
 * @param options - Progress bar display options
 * @returns Array of three formatted lines (top border, content, bottom border)
 */
export function renderIterationDisplay(options: ProgressBarOptions): string[] {
  const {
    current,
    total,
    barWidth = 20,
    borderWidth = 36,
    fillColor = 'sky400',
    emptyColor = 'gray',
    borderColor = 'sky500',
  } = options;

  const label = formatIterationLabel(options);
  const bar = renderBar(current, total, barWidth, fillColor, emptyColor);
  const content = `  ${label}  ${bar}`;

  const contentWidth = visibleLength(content);
  const actualBorderWidth = Math.max(borderWidth, contentWidth);
  const border = renderBorder(actualBorderWidth, borderColor);

  return [border, content, border];
}
