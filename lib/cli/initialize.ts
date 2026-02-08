/**
 * CLI Initialization Module
 *
 * Handles banner display and environment setup for the CLI.
 * Extracted from bin/speci.ts to improve separation of concerns.
 */

import { renderBanner } from '../ui/banner.js';
import { animateBanner, shouldAnimate } from '../ui/banner-animation.js';

/**
 * Display the static (non-animated) banner
 */
export function displayStaticBanner(): void {
  console.log('\n' + renderBanner({ showVersion: true }) + '\n');
}

/**
 * Display the application banner with animation when appropriate
 *
 * Conditionally animates the banner when appropriate conditions are met.
 * Returns a Promise when animation is enabled, or void when displaying static banner.
 *
 * @param options - Optional configuration for banner display
 */
export function displayBanner(options?: {
  color?: boolean;
}): Promise<void> | void {
  if (shouldAnimate(options)) {
    console.log();
    return animateBanner().then(() => console.log());
  } else {
    displayStaticBanner();
  }
}

/**
 * Determine if banner should be shown based on CLI arguments
 *
 * @param args - Command line arguments (without node and script path)
 * @returns true if banner should be displayed, false otherwise
 */
export function shouldShowBanner(args: string[]): boolean {
  const isHelpOrVersion =
    args.includes('--help') ||
    args.includes('-h') ||
    args.includes('help') ||
    args.includes('--version') ||
    args.includes('-V');
  const isJsonOutput = args.includes('--json');
  const isStatusCommand = args.includes('status') || args.includes('s');

  return !isHelpOrVersion && !isJsonOutput && !isStatusCommand;
}
