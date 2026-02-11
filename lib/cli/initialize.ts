/**
 * CLI Initialization Module
 *
 * Handles banner display and environment setup for the CLI.
 * Extracted from bin/speci.ts to improve separation of concerns.
 */

import { renderBanner } from '../ui/banner.js';
import { animateBanner, shouldAnimate } from '../ui/banner-animation/index.js';

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
 * Falls back to static banner when animation is disabled or validation will fail.
 * Returns a Promise when animation is enabled, or void when displaying static banner.
 *
 * @param options - Optional configuration for banner display
 */
export function displayBanner(options?: {
  color?: boolean;
  args?: string[];
}): Promise<void> | void {
  // Use static banner if command will fail early validation (avoid animation delay)
  if (options?.args && willFailValidation(options.args)) {
    displayStaticBanner();
    return;
  }

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

/**
 * Check if a command will fail early validation
 *
 * Performs lightweight pre-validation to detect missing required inputs
 * before displaying the banner. This prevents banner animation when
 * the command will immediately fail with a validation error.
 *
 * @param args - Command line arguments (without node and script path)
 * @returns true if command will fail validation, false otherwise
 */
export function willFailValidation(args: string[]): boolean {
  if (args.length === 0) return false;

  const command = args[0];

  // Plan command requires --prompt or --input
  if (command === 'plan' || command === 'p') {
    const hasPrompt = args.includes('-p') || args.includes('--prompt');
    const hasInput = args.includes('-i') || args.includes('--input');
    return !hasPrompt && !hasInput;
  }

  // Task command requires --plan
  if (command === 'task' || command === 't') {
    const hasPlan = args.includes('-p') || args.includes('--plan');
    return !hasPlan;
  }

  return false;
}
