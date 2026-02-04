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
import { ANSI } from './palette.js';
import { colorize, supportsColor } from './colors.js';

// Use createRequire for reliable JSON imports in ESM (works in both runtime and tests)
const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

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
 * Apply horizontal gradient to a line of text
 * Divides line into thirds: sky200 | sky400 | sky500
 *
 * @param line - Text line to apply gradient to
 * @returns Gradient-colored line (or plain text if colors disabled)
 */
function applyGradient(line: string): string {
  if (!supportsColor()) {
    return line;
  }

  const len = line.length;
  const third = Math.floor(len / 3);

  const left = line.slice(0, third);
  const middle = line.slice(third, third * 2);
  const right = line.slice(third * 2);

  return (
    `${ANSI.sky200}${left}` +
    `${ANSI.sky400}${middle}` +
    `${ANSI.sky500}${right}${ANSI.reset}`
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
