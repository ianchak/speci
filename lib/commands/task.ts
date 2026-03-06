/**
 * Task Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for task generation from a plan file.
 * The command validates the plan file exists and is readable before invoking Copilot.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 */

import { relative, resolve } from 'node:path';
import { infoBox } from '@/ui/box.js';
import { initializeCommand } from '@/utils/helpers/command-helpers.js';
import {
  failResult,
  failValidation,
  handleCommandError,
} from '@/utils/infrastructure/error-handler.js';
import { executeCopilotCommand } from '@/utils/helpers/copilot-helper.js';
import { cleanFiles } from '@/commands/clean.js';
import { InputValidator, PathValidator } from '@/validation/index.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';

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
  /** Clean task files and progress before generating */
  clean?: boolean;
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
    return failValidation(result.error, context.logger);
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
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult> {
  try {
    // Validate required option (must come before initialization)
    const inputValidation = new InputValidator(context.fs)
      .required('plan', options.plan, '--plan <path> is required')
      .validate();
    if (!inputValidation.success) {
      context.logger.error(inputValidation.error.message);
      return failResult(inputValidation.error.message);
    }
    const planOption = options.plan;
    if (planOption === undefined || planOption === null || planOption === '') {
      context.logger.error('--plan <path> is required');
      return failResult('--plan <path> is required');
    }

    // Resolve and validate plan file (must come before initialization)
    const planPath = resolve(context.process.cwd(), planOption);
    const validationError = validatePlanFile(planPath, context);
    if (validationError) {
      return validationError;
    }

    if (options.clean) {
      if (options.verbose) {
        context.logger.setVerbose(true);
      }
      const config = preloadedConfig ?? (await context.configLoader.load());
      const cleanResult = cleanFiles(config, context);
      if (!cleanResult.success) {
        return cleanResult;
      }
      preloadedConfig = config;
      context.logger.raw('');
    }

    // Initialize command (config + preflight + agent validation)
    const { config, agentName } = await initializeCommand({
      commandName: 'task',
      config: preloadedConfig, // Pass pre-loaded config if provided
      context,
    });

    // Display command info
    const displayPlanPath =
      relative(context.process.cwd(), planPath) || planPath;
    context.logger.raw(
      infoBox('Task Generation', {
        Plan: displayPlanPath,
        Agent: `${agentName}.agent.md`,
      })
    );
    context.logger.raw('');

    // Build Copilot args for one-shot mode with plan context
    const args = context.copilotRunner.buildArgs(config, {
      prompt: `Read the plan file at ${planPath} and generate implementation tasks.`,
      agent: agentName,
      allowAll: true,
      command: 'task',
    });

    // Execute copilot command with standard pattern
    return await executeCopilotCommand(context, args);
  } catch (error) {
    return handleCommandError(error, 'Task', context.logger);
  }
}

export default task;
