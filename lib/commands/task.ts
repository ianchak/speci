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
  // Check existence
  if (!context.fs.existsSync(planPath)) {
    context.logger.error(`Plan file not found: ${planPath}`);
    return {
      success: false,
      exitCode: 1,
      error: `Plan file not found: ${planPath}`,
    };
  }

  // Check readability (in real filesystem, for mock tests this would be simulated)
  try {
    context.fs.readFileSync(planPath);
  } catch {
    context.logger.error(`Plan file not readable: ${planPath}`);
    context.logger.info('Check file permissions and try again.');
    return {
      success: false,
      exitCode: 1,
      error: `Plan file not readable: ${planPath}`,
    };
  }

  return null;
}

/**
 * Task command handler
 * Initializes one-shot Copilot session for task generation
 *
 * @param options - Command options
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to command result
 */
export async function task(
  options: TaskOptions,
  context: CommandContext = createProductionContext(),
  config?: SpeciConfig
): Promise<CommandResult> {
  try {
    // Display banner
    renderBanner();
    console.log();

    // Validate required option (must come before initialization)
    if (!options.plan) {
      context.logger.error('Missing required option: --plan <path>');
      context.logger.info('Usage: speci task --plan <path-to-plan.md>');
      return {
        success: false,
        exitCode: 2,
        error: 'Missing required option: --plan',
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

    // Spawn Copilot with stdio:inherit
    context.logger.debug(`Spawning: copilot ${args.join(' ')}`);
    const exitCode = await context.copilotRunner.spawn(args, { inherit: true });

    // Return result with exit code
    if (exitCode === 0) {
      return { success: true, exitCode: 0 };
    } else {
      return { success: false, exitCode };
    }
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
