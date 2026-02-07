/**
 * Box Drawing Module
 *
 * Provides utilities for drawing bordered boxes around content in the terminal.
 * Supports both Unicode box drawing characters and ASCII fallback.
 */

import { supportsUnicode } from '@/ui/glyphs.js';
import { colorize, visibleLength } from '@/ui/colors.js';
import type { ColorName } from '@/ui/colors.js';

/**
 * Unicode box drawing characters (double-line style)
 */
export const BOX_CHARS = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
  // Single-line variants for nested boxes
  singleTopLeft: '┌',
  singleTopRight: '┐',
  singleBottomLeft: '└',
  singleBottomRight: '┘',
  singleHorizontal: '─',
  singleVertical: '│',
} as const;

/**
 * ASCII fallback for terminals without Unicode
 */
export const ASCII_BOX_CHARS = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  singleTopLeft: '+',
  singleTopRight: '+',
  singleBottomLeft: '+',
  singleBottomRight: '+',
  singleHorizontal: '-',
  singleVertical: '|',
} as const;

/**
 * Options for box drawing
 */
export interface BoxOptions {
  /** Optional title for the box header */
  title?: string;
  /** Padding lines above and below content (default: 1) */
  padding?: number;
  /** Maximum box width (default: 60) */
  width?: number;
  /** Box style: double or single line (default: 'double') */
  style?: 'double' | 'single';
  /** Border color name from palette (default: 'sky400') */
  borderColor?: ColorName;
}

/**
 * Draw a box around content
 * @param content - String or array of strings to box
 * @param options - Box styling options
 * @returns Formatted box string
 */
export function drawBox(
  content: string | string[],
  options: BoxOptions = {}
): string {
  const { title, padding = 1, width = 60, borderColor = 'sky400' } = options;

  const useUnicode = supportsUnicode();
  const chars = useUnicode ? BOX_CHARS : ASCII_BOX_CHARS;
  const lines = Array.isArray(content) ? content : content.split('\n');

  // Calculate content width
  const maxContentWidth = Math.max(
    ...lines.map((l) => visibleLength(l)),
    title ? visibleLength(title) : 0,
    0
  );
  const innerWidth = Math.min(width - 4, Math.max(maxContentWidth, 0));

  // Build box
  const result: string[] = [];

  // Top border with optional title
  if (title) {
    const titleLength = visibleLength(title);
    const remainingWidth = Math.max(0, innerWidth - titleLength - 1);
    const topBorder = `${chars.topLeft}${chars.horizontal} ${title} ${chars.horizontal.repeat(remainingWidth)}${chars.topRight}`;
    result.push(colorize(topBorder, borderColor));
  } else {
    const topBorder = `${chars.topLeft}${chars.horizontal.repeat(innerWidth + 2)}${chars.topRight}`;
    result.push(colorize(topBorder, borderColor));
  }

  // Padding lines (top)
  for (let i = 0; i < padding; i++) {
    result.push(
      colorize(
        `${chars.vertical}${' '.repeat(innerWidth + 2)}${chars.vertical}`,
        borderColor
      )
    );
  }

  // Content lines
  for (const line of lines) {
    const lineLength = visibleLength(line);
    const paddingNeeded = Math.max(0, innerWidth - lineLength);
    const paddedLine = line + ' '.repeat(paddingNeeded);
    result.push(
      colorize(chars.vertical, borderColor) +
        ` ${paddedLine} ` +
        colorize(chars.vertical, borderColor)
    );
  }

  // Padding lines (bottom)
  for (let i = 0; i < padding; i++) {
    result.push(
      colorize(
        `${chars.vertical}${' '.repeat(innerWidth + 2)}${chars.vertical}`,
        borderColor
      )
    );
  }

  // Bottom border
  result.push(
    colorize(
      `${chars.bottomLeft}${chars.horizontal.repeat(innerWidth + 2)}${chars.bottomRight}`,
      borderColor
    )
  );

  return result.join('\n');
}

/**
 * Render an information box with key-value pairs
 * @param title - Box title
 * @param lines - Content lines or key-value pairs
 * @returns Formatted info box string
 */
export function infoBox(
  title: string,
  lines: string[] | Record<string, string>
): string {
  const content = Array.isArray(lines)
    ? lines
    : Object.entries(lines).map(([k, v]) => `${k}: ${v}`);

  return drawBox(content, { title, borderColor: 'sky400' });
}
