#!/usr/bin/env node
/**
 * Speci CLI Entry Point
 *
 * Main entry point for the speci CLI tool.
 * Orchestrates: argument parsing → banner display → command execution
 */

import { createProductionContext } from '../lib/adapters/context-factory.js';
import { CommandRegistry } from '../lib/cli/command-registry.js';
import {
  displayBanner,
  displayStaticBanner,
  shouldShowBanner,
} from '../lib/cli/initialize.js';
import { EXIT_CODE } from '../lib/constants.js';
import { exitWithCleanup } from '../lib/utils/infrastructure/exit.js';
import { log } from '../lib/utils/infrastructure/logger.js';

/**
 * Main CLI orchestration function
 *
 * Follows the pattern: parse arguments → display banner → route to command
 */
async function main(): Promise<void> {
  // Parse arguments (without node and script path)
  const args = process.argv.slice(2);

  // Create production context
  const context = createProductionContext();

  // Create command registry
  const registry = new CommandRegistry(context);
  const program = registry.getProgram();

  // Handle special cases for banner display
  const isHelpRequest =
    args.includes('-h') || args.includes('--help') || args[0] === 'help';
  const isVersionRequest = args.includes('-V') || args.includes('--version');

  if (args.length === 0) {
    // No arguments: show animated banner + help
    const result = displayBanner({ color: program.opts().color });
    if (result instanceof Promise) {
      await result;
    }
    program.help();
  } else if (isHelpRequest) {
    // Help request: show static banner + help
    displayStaticBanner();
    await registry.execute(args);
  } else if (isVersionRequest) {
    // Version request: just show version (no banner)
    await registry.execute(args);
  } else {
    // Regular command: show banner if appropriate, then execute
    if (shouldShowBanner(args)) {
      const result = displayBanner({ color: program.opts().color, args });
      if (result instanceof Promise) {
        await result;
      }
    }
    await registry.execute(args);
  }
}

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  log.error(`Unhandled rejection: ${message}`);
  void exitWithCleanup(EXIT_CODE.ERROR);
});

// Execute main function
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(`Fatal error: ${message}`);
  void exitWithCleanup(EXIT_CODE.ERROR);
});
