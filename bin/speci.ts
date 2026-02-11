#!/usr/bin/env tsx
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

/**
 * Main CLI orchestration function
 *
 * Follows the pattern: parse arguments → display banner → route to command
 */
async function main(): Promise<void> {
  // Parse arguments (without node and script path)
  const args = process.argv.slice(2);

  // Create production context and load config once for all commands
  const context = createProductionContext();
  const config = await context.configLoader.load();

  // Create command registry
  const registry = new CommandRegistry(context, config);
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

// Execute main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
