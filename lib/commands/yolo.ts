import { resolve } from 'node:path';
import type { SpeciConfig } from '@/types.js';
import { createError } from '@/errors.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import { plan } from '@/commands/plan.js';
import { task } from '@/commands/task.js';
import { run } from '@/commands/run.js';
import {
  failResult,
  handleCommandError,
  toErrorMessage,
} from '@/utils/infrastructure/error-handler.js';
import { InputValidator, PathValidator } from '@/validation/index.js';

/**
 * Options accepted by yolo command.
 * Mirrors PlanOptions fields (cannot extend due to Commander.js limitations).
 */
export interface YoloOptions {
  /** Initial prompt for plan generation */
  prompt?: string;
  /** Input files to include as context (design docs, specs, etc.) */
  input?: string[];
  /** Output file path for plan (defaults to docs/plan-YYYYMMDD-HHmmss_implementation_plan.md) */
  output?: string;
  /** Override existing lock file */
  force?: boolean;
  /** Show detailed output */
  verbose?: boolean;
}

const PHASE_SEPARATOR = '━'.repeat(60);

function validateAndResolvePath(pathValue: string, cwd: string): string {
  const resolvedPath = resolve(cwd, pathValue);
  const result = new PathValidator(resolvedPath)
    .isWithinProject(cwd)
    .validate();
  if (!result.success) {
    throw createError('ERR-INP-07', JSON.stringify({ path: resolvedPath }));
  }
  return resolvedPath;
}

/**
 * Generates a timestamped plan output path so concurrent or successive yolo runs
 * never silently overwrite each other's plan files.
 * Format matches the plan agent's natural naming: docs/plan-YYYYMMDD-HHmmss_implementation_plan.md
 */
function generatePlanOutputPath(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .substring(0, 15);
  return `docs/plan-${ts}_implementation_plan.md`;
}

async function formatLockConflictError(
  config: SpeciConfig,
  context: CommandContext
): Promise<string> {
  const lockInfo = await context.lockManager.getInfo(config);
  const pid =
    typeof lockInfo.pid === 'number' && Number.isInteger(lockInfo.pid)
      ? lockInfo.pid
      : 'unknown';
  return `Another yolo command is already running (PID: ${pid}). Use --force to override.`;
}

async function runPhase<T extends CommandResult>(
  label: string,
  fn: () => Promise<T>,
  context: CommandContext
): Promise<T> {
  context.logger.info(PHASE_SEPARATOR);
  context.logger.info(label);
  const startTime = Date.now();
  const result = await fn();
  if (result.success) {
    const successMessage =
      label === 'Phase 1/3: Generating implementation plan...'
        ? 'Plan generation complete'
        : label === 'Phase 2/3: Generating task list...'
          ? 'Task generation complete'
          : 'Implementation complete';
    context.logger.debug(`Phase completed in ${Date.now() - startTime}ms`);
    context.logger.success(successMessage);
  }
  return result;
}

async function runYoloPipeline(
  planPath: string,
  options: YoloOptions,
  context: CommandContext,
  config: SpeciConfig
): Promise<CommandResult> {
  const planResult = await runPhase(
    'Phase 1/3: Generating implementation plan...',
    async () =>
      plan(
        {
          prompt: options.prompt?.trim(),
          input: options.input,
          output: planPath,
          verbose: options.verbose,
        },
        context,
        config
      ),
    context
  );
  if (!planResult.success) {
    return {
      ...planResult,
      error: `Yolo failed during plan phase: ${planResult.error ?? 'Unknown error'}`,
    };
  }

  const taskResult = await runPhase(
    'Phase 2/3: Generating task list...',
    async () =>
      task(
        {
          plan: planPath,
          verbose: options.verbose,
        },
        context,
        config
      ),
    context
  );
  if (!taskResult.success) {
    return {
      ...taskResult,
      error: `Yolo failed during task phase: ${taskResult.error ?? 'Unknown error'}`,
    };
  }

  const runResult = await runPhase(
    'Phase 3/3: Running implementation loop...',
    async () =>
      run(
        {
          yes: true,
          // force:true so run releases the yolo-held lock and acquires its own
          force: true,
          verbose: options.verbose,
        },
        context,
        config
      ),
    context
  );
  if (!runResult.success) {
    return {
      ...runResult,
      error: `Yolo failed during run phase: ${runResult.error ?? 'Unknown error'}`,
    };
  }

  return { success: true, exitCode: 0 };
}

/**
 * Executes the yolo command pipeline: plan → task → run.
 * Security note: input/output paths are normalized with path.resolve() and validated to remain inside the project root before any config or pipeline work runs.
 *
 * @param options - Command options (compatible with plan/task/run pipeline options)
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, falls back to context config loader)
 * @returns Command execution result with phase-aware error messages
 */
export async function yolo(
  options: YoloOptions,
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult> {
  const projectRoot = context.process.cwd();

  if (options.input) {
    options.input = options.input.map((inputPath) =>
      validateAndResolvePath(inputPath, projectRoot)
    );
  }

  if (options.output) {
    options.output = validateAndResolvePath(options.output, projectRoot);
  }

  const config = preloadedConfig ?? (await context.configLoader.load());

  const normalizedPrompt = options.prompt?.trim();
  const inputValidation = new InputValidator(context.fs)
    .requireInput(options.input, normalizedPrompt)
    .validate();
  if (!inputValidation.success) {
    context.logger.error(inputValidation.error.message);
    return failResult(inputValidation.error.message);
  }

  await context.preflight.run(
    config,
    {
      requireCopilot: true,
      requireConfig: true,
      requireProgress: false,
    },
    context.process
  );

  const lockCleanup = async () => {
    await context.lockManager.release(config);
  };
  context.signalManager.registerCleanup(lockCleanup);
  context.signalManager.install(context.process);

  try {
    try {
      await context.lockManager.acquire(config, context.process, 'yolo', {
        state: 'yolo:pipeline',
        iteration: 0,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'ERR-STA-01') {
        throw error;
      }

      if (!options.force) {
        return failResult(await formatLockConflictError(config, context));
      }

      await context.lockManager.release(config);
      await context.lockManager.acquire(config, context.process, 'yolo', {
        state: 'yolo:pipeline',
        iteration: 0,
      });
    }

    const planOutputPath = options.output ?? generatePlanOutputPath();
    const pipelineOptions = { ...options, prompt: normalizedPrompt };
    return await runYoloPipeline(
      planOutputPath,
      pipelineOptions,
      context,
      config
    );
  } catch (error) {
    return handleCommandError(error, 'Yolo', context.logger);
  } finally {
    try {
      await context.lockManager.release(config);
    } catch (error) {
      const message = toErrorMessage(error);
      context.logger.warn(`Failed to release lock file: ${message}`);
    }
    context.signalManager.unregisterCleanup(lockCleanup);
    context.signalManager.remove();
  }
}

export default yolo;
