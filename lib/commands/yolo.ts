import { resolve } from 'node:path';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { SpeciConfig } from '@/config.js';
import { createError, formatError } from '@/errors.js';
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
import { PathValidator } from '@/validation/path-validator.js';

/**
 * Options accepted by yolo command.
 * Mirrors PlanOptions fields (cannot extend due to Commander.js limitations).
 */
export interface YoloOptions {
  /** Initial prompt for plan generation */
  prompt?: string;
  /** Input files to include as context (design docs, specs, etc.) */
  input?: string[];
  /** Output file path for plan (defaults to docs/plan.md) */
  output?: string;
  /** Custom agent path override */
  agent?: string;
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

async function formatLockConflictError(config: SpeciConfig): Promise<string> {
  const lockInfo = await getLockInfo(config);
  const pid =
    typeof lockInfo.pid === 'number' && Number.isInteger(lockInfo.pid)
      ? lockInfo.pid
      : 'unknown';
  const elapsed = lockInfo.elapsed ?? 'unknown';
  return formatError('ERR-STA-01', JSON.stringify({ pid, elapsed }));
}

/**
 * Yolo command skeleton: validates user paths before loading config, runs preflight checks, and returns a placeholder success response.
 * Security note: input/output/agent paths are normalized with path.resolve() and validated to remain inside the project root before any config or pipeline work runs.
 *
 * @param options - Command options
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to placeholder success result until pipeline phases are implemented
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

  if (options.agent) {
    options.agent = validateAndResolvePath(options.agent, projectRoot);
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
      requireProgress: true,
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

    context.logger.info('━'.repeat(60));
    context.logger.info('Phase 1/3: Generating implementation plan...');
    const planOutputPath = options.output ?? 'docs/plan.md';
    const planResult = await plan(
      {
        prompt: normalizedPrompt,
        input: options.input,
        output: planOutputPath,
        agent: options.agent,
        verbose: options.verbose,
      },
      context,
      loadedConfig
    );
    if (!planResult.success) {
      return planResult;
    }
    context.logger.success('Plan generation complete');

    context.logger.info('Phase 2/3: Generating task list...');
    const taskResult = await task(
      {
        plan: planOutputPath,
        agent: options.agent,
        verbose: options.verbose,
      },
      context,
      loadedConfig
    );
    if (!taskResult.success) {
      return taskResult;
    }
    context.logger.success('Task generation complete');

    context.logger.info('Phase 3/3: Running implementation loop...');
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
      return runResult;
    }
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
