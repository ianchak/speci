/**
 * Task Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for task generation from a plan file.
 * The command validates the plan file exists and is readable before invoking Copilot.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 */

import { relative, resolve } from 'node:path';
import { infoBox } from '@/ui/box.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import { initializeCommand } from '@/utils/command-helpers.js';
import { failResult, handleCommandError } from '@/utils/error-handler.js';
import { executeCopilotCommand } from '@/utils/copilot-helper.js';
import { cleanFiles } from '@/commands/clean.js';
import { PathValidator } from '@/validation/index.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
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
    context.logger.error(result.error.message);
    result.error.suggestions?.forEach((s) => context.logger.info(s));
    return failResult(result.error.message);
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
    // Validate required option (must come before initialization)
    if (!options.plan) {
      context.logger.error('Missing required input');
      context.logger.info('Required option:');
      context.logger.muted('  --plan <path>  Path to plan file');
      context.logger.raw('');
      context.logger.info('Examples:');
      context.logger.muted('  speci task --plan docs/plan.md');
      context.logger.muted('  speci t -p docs/plan.md');
      return failResult('Missing required input');
    }

    // Resolve and validate plan file (must come before initialization)
    const planPath = resolve(context.process.cwd(), options.plan);
    const validationError = validatePlanFile(planPath, context);
    if (validationError) {
      return validationError;
    }

    if (options.clean) {
      if (options.verbose) {
        context.logger.setVerbose(true);
      }
      const loadedCfg = config ?? (await context.configLoader.load());
      const cleanResult = cleanFiles(loadedCfg, context);
      if (!cleanResult.success) {
        return cleanResult;
      }
      config = loadedCfg;
      context.logger.raw('');
    }

    // Initialize command (config + preflight + agent validation)
    const { config: loadedConfig, agentName } = await initializeCommand({
      commandName: 'task',
      config, // Pass pre-loaded config if provided
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
    const args = context.copilotRunner.buildArgs(loadedConfig, {
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
