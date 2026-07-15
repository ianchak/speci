/**
 * Task Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for task generation from a plan file.
 * The command validates the plan file exists and is readable before invoking Copilot.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 *
 * After each Copilot run, the command checks whether generation is complete by
 * inspecting GENERATION_STATE.md (if present). If incomplete entries remain or
 * PROGRESS.md is still absent, the agent is re-invoked to resume — up to
 * MAX_RESUME_ATTEMPTS times.
 */

import { join, relative, resolve } from 'node:path';
import { infoBox } from '@/ui/box.js';
import { initializeCommand } from '@/utils/helpers/command-helpers.js';
import {
  failResult,
  failValidation,
  handleCommandError,
} from '@/utils/infrastructure/error-handler.js';
import { executeCopilotCommand } from '@/utils/helpers/copilot-helper.js';
import { cleanFiles } from '@/commands/clean.js';
import { DEFAULT_PATHS } from '@/constants.js';
import { InputValidator, PathValidator } from '@/validation/index.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';

/**
 * Options for the task command
 */
export interface TaskOptions {
  /** Path to plan file */
  plan?: string;
  /** Show detailed output */
  verbose?: boolean;
  /** Clean task files and progress before generating */
  clean?: boolean;
}

/**
 * Maximum number of automatic resume attempts after generation cuts off.
 */
const MAX_RESUME_ATTEMPTS = 3;

/**
 * Build the initial task-generation prompt.
 *
 * The prompt explicitly requires task artifacts first and defers PROGRESS.md
 * until task generation is complete.
 */
function buildInitialTaskPrompt(planPath: string): string {
  return (
    `Read the implementation plan at ${planPath}. ` +
    `Generate implementation task files and update ${DEFAULT_PATHS.GENERATION_STATE} as needed. ` +
    `Do not create PROGRESS.md yet; only create it after all tasks are generated and complete.`
  );
}

/**
 * Build a resume prompt tailored to the current incomplete-generation reason.
 */
function buildResumeTaskPrompt(
  reason: string | undefined,
  progressPath: string
): string {
  const reasonText = reason ?? 'unknown reason';
  const basePrompt =
    `Read ${DEFAULT_PATHS.GENERATION_STATE} to find incomplete entries and resume task generation. ` +
    `Current incomplete reason: ${reasonText}. `;

  if (reason?.includes('PROGRESS.md not found')) {
    return (
      basePrompt +
      `Do not create PROGRESS.md yet. First finish generating all tasks and make sure ${DEFAULT_PATHS.GENERATION_STATE} has no incomplete entries. Then create PROGRESS.md at ${progressPath} from the finalized task set.`
    );
  }

  return (
    basePrompt +
    `Continue from where generation left off and complete remaining entries.`
  );
}

/**
 * Parse GENERATION_STATE.md content and return Task IDs whose Gen Status ≠ COMPLETE.
 *
 * Detects the "Gen Status" column dynamically from the header row so the check
 * is robust to column reordering.
 *
 * @param content - Raw GENERATION_STATE.md file content
 * @returns Array of Task ID strings that are not yet COMPLETE
 */
function findIncompleteGenerationEntries(content: string): string[] {
  const lines = content.split('\n');

  // Find header row containing "Gen Status"
  const headerIndex = lines.findIndex(
    (line) => line.includes('|') && line.toLowerCase().includes('gen status')
  );
  if (headerIndex === -1) return [];

  const headerCells = lines[headerIndex]
    .split('|')
    .map((c) => c.trim().toLowerCase());
  const genStatusCol = headerCells.findIndex((c) => c === 'gen status');
  const taskIdCol = headerCells.findIndex(
    (c) => c === 'task id' || c === 'task'
  );
  if (genStatusCol === -1 || taskIdCol === -1) return [];

  const incomplete: string[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    // Skip separator rows (e.g. |---|---|)
    if (/^\|[\s|:-]+\|$/.test(line)) continue;

    const cells = line.split('|').map((c) => c.trim());
    const genStatus = cells[genStatusCol] ?? '';
    const taskId = cells[taskIdCol] ?? '';

    if (taskId && genStatus.toUpperCase() !== 'COMPLETE') {
      incomplete.push(taskId);
    }
  }

  return incomplete;
}

/**
 * Determine whether task generation is complete.
 *
 * Checks two conditions in order:
 * 1. If GENERATION_STATE.md exists — all entries must have Gen Status COMPLETE.
 * 2. PROGRESS.md must exist at config.paths.progress.
 *
 * @param config - Speci configuration
 * @param context - Command context for filesystem access
 * @param cwd - Current working directory
 * @returns Object with `complete` flag and optional human-readable `reason` when incomplete
 */
function checkGenerationComplete(
  config: SpeciConfig,
  context: CommandContext,
  cwd: string
): { complete: boolean; reason?: string } {
  const statePath = join(cwd, DEFAULT_PATHS.GENERATION_STATE);
  const progressPath = resolve(cwd, config.paths.progress);

  if (context.fs.existsSync(statePath)) {
    const content = context.fs.readFileSync(statePath, 'utf8');
    const incomplete = findIncompleteGenerationEntries(content);
    if (incomplete.length > 0) {
      return {
        complete: false,
        reason: `${incomplete.length} generation ${incomplete.length === 1 ? 'entry' : 'entries'} not yet COMPLETE: ${incomplete.slice(0, 5).join(', ')}${incomplete.length > 5 ? '…' : ''}`,
      };
    }
  }

  if (!context.fs.existsSync(progressPath)) {
    return {
      complete: false,
      reason: `PROGRESS.md not found at ${progressPath}`,
    };
  }

  return { complete: true };
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
    const planOption = options.plan as string;

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
    const progressPath = resolve(context.process.cwd(), config.paths.progress);
    const args = context.copilotRunner.buildArgs(config, {
      prompt: buildInitialTaskPrompt(planPath),
      agent: agentName,
      command: 'task',
    });

    // Execute initial generation
    const initialResult = await executeCopilotCommand(context, args);
    if (!initialResult.success) {
      return initialResult;
    }

    // Resume loop: re-invoke if generation is incomplete (e.g. context window cut off)
    const cwd = context.process.cwd();
    let check = checkGenerationComplete(config, context, cwd);

    for (
      let attempt = 1;
      attempt <= MAX_RESUME_ATTEMPTS && !check.complete;
      attempt++
    ) {
      context.logger.warn(
        `Generation incomplete: ${check.reason ?? 'unknown reason'}. Resuming (attempt ${attempt}/${MAX_RESUME_ATTEMPTS})…`
      );
      context.logger.raw('');

      const resumeArgs = context.copilotRunner.buildArgs(config, {
        prompt: buildResumeTaskPrompt(check.reason, progressPath),
        agent: agentName,
        command: 'task',
      });

      const resumeResult = await executeCopilotCommand(context, resumeArgs);
      if (!resumeResult.success) {
        return resumeResult;
      }

      check = checkGenerationComplete(config, context, cwd);
    }

    if (!check.complete) {
      context.logger.error(
        `Task generation incomplete after ${MAX_RESUME_ATTEMPTS} resume attempts: ${check.reason ?? 'unknown reason'}`
      );
      return failResult(
        `Task generation incomplete after ${MAX_RESUME_ATTEMPTS} resume attempts. Re-run: speci task --plan ${planOption}`
      );
    }

    return { success: true, exitCode: 0 };
  } catch (error) {
    return handleCommandError(error, 'Task', context.logger);
  }
}

export default task;
