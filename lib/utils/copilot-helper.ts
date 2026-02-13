/**
 * Copilot command execution utilities
 *
 * Centralized copilot invocation pattern used by plan, task, and refactor commands.
 */

import type { CommandResult } from '../interfaces.js';
import type { CommandContext } from '../interfaces.js';
import {
  formatCopilotCommand,
  renderCopilotCommandBox,
} from './copilot-command-display.js';

/**
 * Execute copilot command with standard pattern
 *
 * This function encapsulates the common pattern of:
 * 1. Logging debug message with args
 * 2. Spawning copilot process with stdio:inherit
 * 3. Returning structured result based on exit code
 *
 * @param context - Command context with dependencies
 * @param args - Pre-built copilot CLI arguments
 * @returns Promise resolving to command result
 */
export async function executeCopilotCommand(
  context: CommandContext,
  args: string[]
): Promise<CommandResult> {
  context.logger.infoPlain(renderCopilotCommandBox(args));

  // Log debug message
  context.logger.debug(`Spawning: ${formatCopilotCommand(args)}`);

  // Spawn copilot process with stdio:inherit
  const exitCode = await context.copilotRunner.spawn(args, { inherit: true });

  // Return structured result
  if (exitCode === 0) {
    return { success: true, exitCode: 0 };
  } else {
    return { success: false, exitCode };
  }
}
