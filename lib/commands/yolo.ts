import { resolve } from 'node:path';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { SpeciConfig } from '@/config.js';
import { createError } from '@/errors.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
import { plan } from '@/commands/plan.js';
import { task } from '@/commands/task.js';
import { run } from '@/commands/run.js';
import { handleCommandError } from '@/utils/error-handler.js';
import { acquireLock, getLockInfo, releaseLock } from '@/utils/lock.js';
import { preflight } from '@/utils/preflight.js';
import {
  installSignalHandlers,
  registerCleanup,
  removeSignalHandlers,
  unregisterCleanup,
} from '@/utils/signals.js';
import { PathValidator } from '@/validation/index.js';

/**
 * Options accepted by yolo command.
 * Mirrors PlanOptions fields (cannot extend due to Commander.js limitations).
 */
export interface YoloOptions {
  /** Initial prompt for plan generation */
  prompt?: string;
  /** Input files to include as context (design docs, specs, etc.) */
  input?: string[];
  /** Output file path for plan (defaults to docs/plan-YYYYMMDD-HHmmss.md) */
  output?: string;
  /** Override existing lock file */
  force?: boolean;
  /** Show detailed output */
  verbose?: boolean;
}

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
 * Format: docs/plan-YYYYMMDD-HHmmss.md
 */
function generatePlanOutputPath(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .substring(0, 15);
  return `docs/plan-${ts}.md`;
}

async function formatLockConflictError(config: SpeciConfig): Promise<string> {
  const lockInfo = await getLockInfo(config);
  const pid =
    typeof lockInfo.pid === 'number' && Number.isInteger(lockInfo.pid)
      ? lockInfo.pid
      : 'unknown';
  return `Another yolo command is already running (PID: ${pid}). Use --force to override.`;
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
  context: CommandContext = createProductionContext(),
  config?: SpeciConfig
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

  const loadedConfig = config ?? (await context.configLoader.load());

  const normalizedPrompt = options.prompt?.trim();
  if (!normalizedPrompt && (!options.input || options.input.length === 0)) {
    context.logger.error('Missing required input');
    return {
      success: false,
      exitCode: 1,
      error: 'Missing required input',
    };
  }

  await preflight(
    loadedConfig,
    {
      requireCopilot: true,
      requireConfig: true,
      requireProgress: false,
    },
    context.process
  );

  const lockCleanup = async () => {
    await releaseLock(loadedConfig);
  };
  registerCleanup(lockCleanup);
  installSignalHandlers();

  try {
    try {
      await acquireLock(loadedConfig, context.process, 'yolo', {
        state: 'yolo:pipeline',
        iteration: 0,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'ERR-STA-01') {
        throw error;
      }

      if (!options.force) {
        return {
          success: false,
          exitCode: 1,
          error: await formatLockConflictError(loadedConfig),
        };
      }

      await releaseLock(loadedConfig);
      await acquireLock(loadedConfig, context.process, 'yolo', {
        state: 'yolo:pipeline',
        iteration: 0,
      });
    }

    const phaseSeparator = '━'.repeat(60);

    context.logger.info(phaseSeparator);
    context.logger.info('Phase 1/3: Generating implementation plan...');
    const planStartTime = Date.now();
    const planOutputPath = options.output ?? generatePlanOutputPath();
    const planResult = await plan(
      {
        prompt: normalizedPrompt,
        input: options.input,
        output: planOutputPath,
        verbose: options.verbose,
      },
      context,
      loadedConfig
    );
    if (!planResult.success) {
      return {
        ...planResult,
        error: `Yolo failed during plan phase: ${planResult.error ?? 'Unknown error'}`,
      };
    }
    context.logger.debug(`Phase completed in ${Date.now() - planStartTime}ms`);
    context.logger.success('Plan generation complete');

    context.logger.info(phaseSeparator);
    context.logger.info('Phase 2/3: Generating task list...');
    const taskStartTime = Date.now();
    const taskResult = await task(
      {
        plan: planOutputPath,
        verbose: options.verbose,
      },
      context,
      loadedConfig
    );
    if (!taskResult.success) {
      return {
        ...taskResult,
        error: `Yolo failed during task phase: ${taskResult.error ?? 'Unknown error'}`,
      };
    }
    context.logger.debug(`Phase completed in ${Date.now() - taskStartTime}ms`);
    context.logger.success('Task generation complete');

    context.logger.info(phaseSeparator);
    context.logger.info('Phase 3/3: Running implementation loop...');
    const runStartTime = Date.now();
    const runResult = await run(
      {
        yes: true,
        force: false,
        verbose: options.verbose,
      },
      context,
      loadedConfig
    );
    if (!runResult.success) {
      return {
        ...runResult,
        error: `Yolo failed during run phase: ${runResult.error ?? 'Unknown error'}`,
      };
    }
    context.logger.debug(`Phase completed in ${Date.now() - runStartTime}ms`);
    context.logger.success('Implementation complete');

    return { success: true, exitCode: 0 };
  } catch (error) {
    return handleCommandError(error, 'Yolo', context.logger);
  } finally {
    try {
      await releaseLock(loadedConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.logger.warn(`Failed to release lock file: ${message}`);
    }
    unregisterCleanup(lockCleanup);
    removeSignalHandlers();
  }
}

export default yolo;
