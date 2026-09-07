/**
 * Copilot command execution utilities
 *
 * Centralized copilot invocation pattern used by plan, task, and refactor commands.
 */

import type { CommandResult, CommandContext } from '@/interfaces/index.js';
import type { CommandName, SpeciConfig } from '@/types.js';
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
 * @param config - Speci configuration (forwarded so local model env vars can be injected)
 * @param command - Speci command role used for local model resolution
 * @returns Promise resolving to command result
 */
export async function executeCopilotCommand(
  context: CommandContext,
  args: string[],
  config?: SpeciConfig,
  command?: CommandName
): Promise<CommandResult> {
  context.logger.infoPlain(renderCopilotCommandBox(args));

  // Log debug message
  context.logger.debug(`Spawning: ${formatCopilotCommand(args)}`);

  // Spawn copilot process with stdio:inherit
  const exitCode = await context.copilotRunner.spawn(args, {
    inherit: true,
    config,
    command,
  });

  // Return structured result
  if (exitCode === 0) {
    return { success: true, exitCode: 0 };
  } else {
    return { success: false, exitCode };
  }
}
