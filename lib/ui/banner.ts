/**
 * ASCII Banner Module
 *
 * Renders the SPECI CLI brand banner with horizontal gradient effect.
 * Uses Ice Blue color palette (sky-200 → sky-400 → sky-500) for visual appeal.
 *
 * The banner provides immediate brand recognition on CLI startup.
 * Respects NO_COLOR and FORCE_COLOR environment variables.
 */

import { createRequire } from 'node:module';
import { HEX_COLORS } from '@/ui/palette.js';
import { colorize, supportsColor } from '@/ui/colors.js';

// Use createRequire for reliable JSON imports in ESM (works in both runtime and tests)
const esmRequire = createRequire(import.meta.url);
const pkg = esmRequire('../../package.json') as { version: string };

/** Package version from package.json */
export const VERSION = pkg.version;

/**
 * ASCII art banner for SPECI CLI
 * 6 lines tall, 40 characters wide
 */
export const BANNER_ART = [
  '  ███████╗██████╗ ███████╗ ██████╗██╗',
  '  ██╔════╝██╔══██╗██╔════╝██╔════╝██║',
  '  ███████╗██████╔╝█████╗  ██║     ██║',
  '  ╚════██║██╔═══╝ ██╔══╝  ██║     ██║',
  '  ███████║██║     ███████╗╚██████╗██║',
  '  ╚══════╝╚═╝     ╚══════╝ ╚═════╝╚═╝',
] as const;

/**
 * Options for banner rendering
 */
export interface BannerOptions {
  /**
   * Include version number below banner
   * @default true
   */
  showVersion?: boolean;
}

/**
 * Parse hex color to RGB tuple
 */
function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Interpolate between two hex colors
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
 * Convert hex color to ANSI RGB escape code
 */
function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Apply horizontal gradient to a line of text
 * Interpolates colors per-character: sky200 → sky400 → sky500
 *
 * @param line - Text line to apply gradient to
 * @returns Gradient-colored line (or plain text if colors disabled)
 */
function applyGradient(line: string): string {
  if (!supportsColor()) {
    return line;
  }

  const chars = [...line];
  const width = chars.length;
  if (width === 0) return line;

  return (
    chars
      .map((char, i) => {
        // Skip coloring whitespace
        if (char.trim() === '') return char;

        const t = i / width;
        let color: string;

        if (t < 0.33) {
          // Interpolate sky200 → sky400
          const localT = t / 0.33;
          color = lerpColor(HEX_COLORS.sky200, HEX_COLORS.sky400, localT);
        } else if (t < 0.66) {
          // Hold at sky400
          color = HEX_COLORS.sky400;
        } else {
          // Interpolate sky400 → sky500
          const localT = (t - 0.66) / 0.34;
          color = lerpColor(HEX_COLORS.sky400, HEX_COLORS.sky500, localT);
        }

        return `${hexToAnsi(color)}${char}`;
      })
      .join('') + '\x1b[0m'
  );
}

/**
 * Render ASCII art banner with Ice Blue gradient
 *
 * Displays the SPECI logo with a horizontal gradient effect.
 * Optionally includes version number centered below the banner.
 *
 * @param options - Render options
 * @returns Formatted banner string ready for console output
 *
 * @example
 * ```typescript
 * // Render banner with version
 * console.log(renderBanner());
 *
 * // Render banner without version
 * console.log(renderBanner({ showVersion: false }));
 * ```
 */
export function renderBanner(options: BannerOptions = {}): string {
  const { showVersion = true } = options;

  // Apply gradient to each line
  const bannerLines = BANNER_ART.map((line) => applyGradient(line));

  // Join banner lines
  let output = bannerLines.join('\n');

  // Add version if requested
  if (showVersion) {
    const versionText = `v${pkg.version}`;
    const bannerWidth = BANNER_ART[0].length;
    const padding = Math.floor((bannerWidth - versionText.length) / 2);
    const centeredVersion = ' '.repeat(padding) + colorize(versionText, 'dim');
    output += '\n' + centeredVersion;
  }

  return output;
}
