/**
 * Color Palette Module
 *
 * Defines the foundational color palette using Ice Blue brand colors and semantic colors.
 * Exports both hex values (for reference) and ANSI escape codes (for terminal output).
 *
 * Respects NO_COLOR and FORCE_COLOR environment variables per terminal standards.
 */

import { createError } from '@/errors.js';

/**
 * Hex color values for reference and documentation
 */
export const HEX_COLORS = {
  // Ice Blue Brand Palette (Tailwind sky scale)
  sky200: '#bae6fd',
  sky400: '#38bdf8',
  sky500: '#0ea5e9',

  // Semantic Colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',

  // Neutrals
  white: '#ffffff',
  gray: '#6b7280',
  dim: '#9ca3af',
} as const;

/**
 * Type for the color palette interface
 */
export interface ColorPalette {
  readonly sky200: string;
  readonly sky400: string;
  readonly sky500: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly reset: string;
  readonly dim: string;
  readonly white: string;
  readonly gray: string;
}

/**
 * Convert hex color to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw createError('ERR-UI-01', JSON.stringify({ hex }));
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert hex color to ANSI true color escape code
 */
function hexToAnsi(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * ANSI escape codes for terminal output
 */
export const ANSI: ColorPalette = {
  // Ice Blue Brand Palette
  sky200: hexToAnsi(HEX_COLORS.sky200),
  sky400: hexToAnsi(HEX_COLORS.sky400),
  sky500: hexToAnsi(HEX_COLORS.sky500),

  // Semantic Colors
  success: hexToAnsi(HEX_COLORS.success),
  warning: hexToAnsi(HEX_COLORS.warning),
  error: hexToAnsi(HEX_COLORS.error),

  // Neutrals
  white: hexToAnsi(HEX_COLORS.white),
  gray: hexToAnsi(HEX_COLORS.gray),
  dim: hexToAnsi(HEX_COLORS.dim),

  // Reset code
  reset: '\x1b[0m',
};
