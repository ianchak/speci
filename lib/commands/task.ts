/**
 * Task Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for task generation from a plan file.
 * The command validates the plan file exists and is readable before invoking Copilot.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 */

import { relative, resolve } from 'node:path';
import { renderBanner } from '@/ui/banner.js';
import { infoBox } from '@/ui/box.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import { initializeCommand } from '@/utils/command-helpers.js';
import { handleCommandError } from '@/utils/error-handler.js';
import { executeCopilotCommand } from '@/utils/copilot-helper.js';
import { PathValidator } from '@/validation/path-validator.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
import type { SpeciConfig } from '@/config.js';

/**
 * Options for the task command
 */
export interface TaskOptions {
  /** Path to plan file */
  plan?: string;
  /** Custom agent path override */
  agent?: string;
  /** Show detailed output */
  verbose?: boolean;
}

/**
 * Validate that plan file exists and is readable
 *
 * @param planPath - Absolute path to plan file
 * @param context - Command context for filesystem and logging
 * @returns CommandResult with error if validation fails, null if successful
 */
function validatePlanFile(
  planPath: string,
  context: CommandContext
): CommandResult | null {
  const result = new PathValidator(planPath).exists().isReadable().validate();

  if (!result.success) {
    context.logger.error(result.error.message);
    result.error.suggestions?.forEach((s) => context.logger.info(s));
    return {
      success: false,
      exitCode: 1,
      error: result.error.message,
    };
  }

  return null;
}

/**
 * Task command handler
 * Initializes one-shot Copilot session for task generation
 *
 * @param options - Command options with defaults
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to command result
 * @sideEffects Spawns GitHub Copilot CLI process; reads plan file
 */
export async function task(
  options: TaskOptions = {} as TaskOptions,
  context: CommandContext = createProductionContext(),
  config?: SpeciConfig
): Promise<CommandResult> {
  try {
    // Display banner
    renderBanner();

    // Validate required option (must come before initialization)
    if (!options.plan) {
      context.logger.error('Missing required input');
      context.logger.info('Required option:');
      context.logger.muted('  --plan <path>  Path to plan file');
      context.logger.raw('');
      context.logger.info('Examples:');
      context.logger.muted('  speci task --plan docs/plan.md');
      context.logger.muted('  speci t -p docs/plan.md');
      return {
        success: false,
        exitCode: 1,
        error: 'Missing required input',
      };
    }

    // Resolve and validate plan file (must come before initialization)
    const planPath = resolve(context.process.cwd(), options.plan);
    const validationError = validatePlanFile(planPath, context);
    if (validationError) {
      return validationError;
    }

    // Initialize command (config + preflight + agent validation)
    // Note: skipBanner=true because we already rendered it above
    const { config: loadedConfig, agentName } = await initializeCommand({
      commandName: 'task',
      agentOverride: options.agent,
      config, // Pass pre-loaded config if provided
      skipBanner: true,
      context,
    });

    // Display command info
    const displayPlanPath =
      relative(context.process.cwd(), planPath) || planPath;
    console.log(
      infoBox('Task Generation', {
        Plan: displayPlanPath,
        Agent: `${agentName}.agent.md`,
        Mode: 'One-shot',
      })
    );
    console.log();

    // Build Copilot args for one-shot mode with plan context
    const args = context.copilotRunner.buildArgs(loadedConfig, {
      prompt: `Read the plan file at ${planPath} and generate implementation tasks.`,
      agent: agentName,
      shouldAllowAll: true,
      command: 'task',
    });

    // Execute copilot command with standard pattern
    return await executeCopilotCommand(context, args);
  } catch (error) {
    // Special handling for agent file not found
    if (
      error instanceof Error &&
      error.message.includes('Agent file not found')
    ) {
      context.logger.error(error.message);
      context.logger.info(
        'Run "speci init" to create agents or provide --agent <filename>'
      );
      return {
        success: false,
        exitCode: 1,
        error: error.message,
      };
    }
    return handleCommandError(error, 'Task', context.logger);
  }
}

export default task;
