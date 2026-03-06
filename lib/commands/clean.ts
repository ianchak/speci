import { join, normalize, resolve, sep } from 'node:path';
import type { SpeciConfig } from '@/types.js';
import { formatError } from '@/errors.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import {
  failResult,
  handleCommandError,
} from '@/utils/infrastructure/error-handler.js';
import { isYesAnswer, promptUser } from '@/utils/helpers/prompt.js';

export interface CleanOptions {
  verbose?: boolean;
  yes?: boolean;
  prompt?: (question: string) => Promise<string>;
}

function enumerateCleanTargets(
  config: SpeciConfig,
  context: CommandContext
): string[] {
  const filesToDelete: string[] = [];

  if (context.fs.existsSync(config.paths.tasks)) {
    const entries = context.fs.readdirSync(config.paths.tasks);
    for (const entry of entries) {
      filesToDelete.push(normalize(join(config.paths.tasks, entry)));
    }
  }

  if (context.fs.existsSync(config.paths.progress)) {
    filesToDelete.push(normalize(config.paths.progress));
  }

  return filesToDelete;
}

async function confirmClean(
  filesToDelete: string[],
  context: CommandContext,
  promptFn?: (question: string) => Promise<string>
): Promise<boolean> {
  for (const filePath of filesToDelete) {
    context.logger.info(filePath);
  }
  context.logger.raw('');

  const question = `Delete ${filesToDelete.length} file(s)? [y/N] `;
  const answer = await promptUser(question, promptFn, context.process);
  return isYesAnswer(answer);
}

function validateCleanPreconditions(
  config: SpeciConfig,
  context: CommandContext
): CommandResult | null {
  if (context.fs.existsSync(config.paths.lock)) {
    context.logger.warn(
      'Cannot clean while speci is running. Wait for the active run to complete or remove the lock file.'
    );
    return failResult(
      'Cannot clean while speci is running. Wait for the active run to complete or remove the lock file.'
    );
  }

  const cwd = context.process.cwd();
  const cwdPrefix = cwd.endsWith(sep) ? cwd : `${cwd}${sep}`;
  const resolvedTasksPath = resolve(cwd, config.paths.tasks);
  const resolvedProgressPath = resolve(cwd, config.paths.progress);
  const isWithinProject = (targetPath: string): boolean =>
    targetPath === cwd || targetPath.startsWith(cwdPrefix);

  if (
    !isWithinProject(resolvedTasksPath) ||
    !isWithinProject(resolvedProgressPath)
  ) {
    return failResult(
      `Configured path resolves outside the project root: ${!isWithinProject(resolvedTasksPath) ? resolvedTasksPath : resolvedProgressPath}`
    );
  }

  return null;
}

/**
 * Remove task files and progress file with safe guards and idempotent behavior.
 *
 * This function never throws: all error paths are converted to CommandResult.
 *
 * @param config - Loaded project configuration
 * @param context - Injected command context
 * @returns CommandResult indicating cleanup success/failure
 */
export function cleanFiles(
  config: SpeciConfig,
  context: CommandContext
): CommandResult {
  try {
    const preconditionFailure = validateCleanPreconditions(config, context);
    if (preconditionFailure !== null) return preconditionFailure;

    const tasksExists = context.fs.existsSync(config.paths.tasks);
    const progressExists = context.fs.existsSync(config.paths.progress);

    if (tasksExists) {
      context.logger.warn(
        `Will delete contents of: ${normalize(config.paths.tasks)}`
      );
    }
    if (progressExists) {
      context.logger.warn(`Will delete: ${normalize(config.paths.progress)}`);
    }

    const errors: string[] = [];
    let deletedCount = 0;

    if (tasksExists) {
      let entries: string[];
      try {
        entries = context.fs.readdirSync(config.paths.tasks);
      } catch {
        return failResult(
          formatError(
            'ERR-EXE-09',
            JSON.stringify({ path: config.paths.tasks })
          )
        );
      }

      for (const entry of entries) {
        const entryPath = normalize(join(config.paths.tasks, entry));
        try {
          context.fs.rmSync(entryPath, { recursive: true, force: true });
          context.logger.debug(`Deleted ${entryPath}`);
          deletedCount++;
        } catch {
          errors.push(entryPath);
          context.logger.warn(`Failed to delete: ${entryPath}`);
        }
      }
    }

    if (progressExists) {
      try {
        context.fs.unlinkSync(config.paths.progress);
        context.logger.debug(`Deleted ${normalize(config.paths.progress)}`);
        deletedCount++;
      } catch {
        errors.push(normalize(config.paths.progress));
        context.logger.warn(
          `Failed to delete: ${normalize(config.paths.progress)}`
        );
      }
    }

    context.logger.raw('');
    if (deletedCount === 0 && errors.length === 0) {
      context.logger.info('Nothing to clean.');
    } else if (errors.length === 0) {
      context.logger.success(`Cleaned ${deletedCount} file(s).`);
    }

    if (errors.length > 0) {
      return failResult(
        formatError('ERR-EXE-10', JSON.stringify({ path: errors.join(', ') }))
      );
    }

    return { success: true, exitCode: 0 };
  } catch {
    return failResult(
      formatError('ERR-EXE-10', JSON.stringify({ path: 'unexpected' }))
    );
  }
}

/**
 * Clean command handler.
 *
 * @param options - Command options
 * @param context - Injected command context
 * @param config - Optional pre-loaded configuration
 * @returns Promise resolving to command result
 */
export async function clean(
  options: CleanOptions,
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult> {
  try {
    const config = preloadedConfig ?? (await context.configLoader.load());
    if (options.verbose) {
      context.logger.setVerbose(true);
    }

    const preconditionFailure = validateCleanPreconditions(config, context);
    if (preconditionFailure !== null) return preconditionFailure;

    const filesToDelete = enumerateCleanTargets(config, context);
    if (filesToDelete.length === 0 || options.yes) {
      return cleanFiles(config, context);
    }

    const { stdin } = context.process;
    if (!stdin.isTTY && !options.prompt) {
      context.logger.info(
        'Clean cancelled: non-interactive terminal. Use --yes to skip confirmation.'
      );
      return { success: true, exitCode: 0 };
    }

    const confirmed = await confirmClean(
      filesToDelete,
      context,
      options.prompt
    );
    if (!confirmed) {
      context.logger.raw('');
      context.logger.info('Clean cancelled.');
      return { success: true, exitCode: 0 };
    }

    return cleanFiles(config, context);
  } catch (error) {
    return handleCommandError(error, 'Clean', context.logger);
  }
}

export default clean;
