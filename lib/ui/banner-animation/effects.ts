/**
 * Banner Animation Effects Module
 *
 * Provides pure animation effect functions for banner rendering.
 * Each effect is a standalone function that transforms progress (0→1) into
 * an array of 6 ANSI-colored banner lines.
 *
 * Effects:
 * - Wave: Progressive left-to-right reveal with gradient
 * - Fade: Fade in from black to gradient colors
 * - Sweep: Threshold-based left-to-right reveal with gradient
 */

import { BANNER_ART } from '@/ui/banner.js';
import { HEX_COLORS } from '@/ui/palette.js';

/**
 * ANSI escape code constants for repeated sequences
 * Performance optimization: avoid recomputing ANSI codes
 */
const ANSI_RESET = '\x1b[0m';

/**
 * Gradient color cache for performance optimization
 * Pre-computed gradient colors to avoid recalculation during animation
 * Map key format: "line_col_startColor_endColor"
 */
const gradientCache = new Map<string, string>();

/**
 * Pre-allocated frame buffer for performance optimization
 * Reused across all frame renders to avoid repeated allocations
 */
const frameBuffer: string[] = new Array(6);

/**
 * Parse hex color string to RGB tuple
 *
 * @param hex - Hex color string (e.g., "#0ea5e9")
 * @returns RGB tuple [r, g, b] with values in [0, 255]
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
 * @param colorA - Start color (e.g., "#0ea5e9")
 * @param colorB - End color (e.g., "#0284c7")
 * @param t - Progress value [0, 1] where 0 = colorA, 1 = colorB
 * @returns Interpolated hex color string
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
 * @param hex - Hex color string (e.g., "#0ea5e9")
 * @returns ANSI escape sequence (e.g., "\x1b[38;2;14;165;233m")
 */
function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Get cached gradient color or compute and cache it
 * Performance optimization: reduces gradient computations from O(frames × chars) to O(chars)
 *
 * @param line - Line index (0-5)
 * @param col - Column index (0-lineLength)
 * @param positionRatio - Position ratio for gradient (0-1)
 * @param colorA - Start color
 * @param colorB - End color
 * @returns Cached or computed ANSI color code
 */
function getCachedGradientColor(
  line: number,
  col: number,
  positionRatio: number,
  colorA: string,
  colorB: string
): string {
  const cacheKey = `${line}_${col}_${colorA}_${colorB}`;

  let ansiColor = gradientCache.get(cacheKey);
  if (!ansiColor) {
    const color = lerpColor(colorA, colorB, positionRatio);
    ansiColor = hexToAnsi(color);
    gradientCache.set(cacheKey, ansiColor);
  }

  return ansiColor;
}

/**
 * Clear gradient cache to free memory
 * Should be called before each animation run
 */
export function clearGradientCache(): void {
  gradientCache.clear();
}

/**
 * Render single frame of wave reveal animation
 *
 * Generates banner frame with progressive left-to-right reveal and gradient coloring.
 * Characters are revealed based on progress (0→1), with Ice Blue gradient applied.
 *
 * @param progress - Animation progress [0.0, 1.0] where 0=hidden, 1=fully revealed
 * @returns Array of 6 ANSI-colored banner lines ready for terminal output
 */
export function renderWaveFrame(progress: number): string[] {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  try {
    let lineIndex = 0;
    for (const line of BANNER_ART) {
      const lineLength = line.length;
      const revealIndex = Math.floor(clampedProgress * lineLength);

      const chars: string[] = [];

      for (let i = 0; i < lineLength; i++) {
        const char = line[i];

        if (i < revealIndex) {
          const positionRatio = i / (lineLength - 1);

          const ansiColor = getCachedGradientColor(
            lineIndex,
            i,
            positionRatio,
            HEX_COLORS.sky200,
            HEX_COLORS.sky500
          );

          chars.push(ansiColor, char, ANSI_RESET);
        } else {
          chars.push(' ');
        }
      }

      frameBuffer[lineIndex] = chars.join('');
      lineIndex++;
    }
  } catch {
    return BANNER_ART.map((line) => line);
  }

  return [...frameBuffer];
}

/**
 * Render single frame of fade animation
 *
 * Generates banner frame with progressive fade-in effect from black to gradient colors.
 * All characters are visible, but fade from black (0) to target gradient (1).
 *
 * @param progress - Animation progress [0.0, 1.0] where 0=black, 1=fully colored
 * @returns Array of 6 ANSI-colored banner lines ready for terminal output
 */
export function renderFadeFrame(progress: number): string[] {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  try {
    let lineIndex = 0;
    for (const line of BANNER_ART) {
      const lineLength = line.length;

      const chars: string[] = [];

      for (let i = 0; i < lineLength; i++) {
        const char = line[i];

        const positionRatio = i / (lineLength - 1);
        const targetColor = lerpColor(
          HEX_COLORS.sky200,
          HEX_COLORS.sky500,
          positionRatio
        );

        const fadedColor = lerpColor('#000000', targetColor, clampedProgress);
        const ansiColor = hexToAnsi(fadedColor);

        chars.push(ansiColor, char, ANSI_RESET);
      }

      frameBuffer[lineIndex] = chars.join('');
      lineIndex++;
    }
  } catch {
    return BANNER_ART.map((line) => line);
  }

  return [...frameBuffer];
}

/**
 * Render single frame of sweep animation
 *
 * Generates banner frame with left-to-right progressive sweep reveal and gradient coloring.
 * Characters are revealed based on progress (0→1), similar to wave but with threshold-based reveal.
 *
 * @param progress - Animation progress [0.0, 1.0] where 0=hidden, 1=fully revealed
 * @returns Array of 6 ANSI-colored banner lines ready for terminal output
 */
export function renderSweepFrame(progress: number): string[] {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  try {
    let lineIndex = 0;
    for (const line of BANNER_ART) {
      const lineLength = line.length;
      const revealIndex = Math.floor(clampedProgress * lineLength);

      const chars: string[] = [];

      for (let i = 0; i < lineLength; i++) {
        const char = line[i];

        if (i < revealIndex) {
          const positionRatio = i / (lineLength - 1);

          const ansiColor = getCachedGradientColor(
            lineIndex,
            i,
            positionRatio,
            HEX_COLORS.sky200,
            HEX_COLORS.sky500
          );

          chars.push(ansiColor, char, ANSI_RESET);
        } else {
          chars.push(' ');
        }
      }

      frameBuffer[lineIndex] = chars.join('');
      lineIndex++;
    }
  } catch {
    return BANNER_ART.map((line) => line);
  }

  return [...frameBuffer];
}
