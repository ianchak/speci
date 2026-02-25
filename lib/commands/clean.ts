import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { SpeciConfig } from '@/types.js';
import { formatError } from '@/errors.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
import { failResult, handleCommandError } from '@/utils/error-handler.js';

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
      filesToDelete.push(join(config.paths.tasks, entry));
    }
  }

  if (context.fs.existsSync(config.paths.progress)) {
    filesToDelete.push(config.paths.progress);
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

  const question = `Delete ${filesToDelete.length} file(s)? [y/N] `;
  const answer = promptFn
    ? await promptFn(question)
    : await new Promise<string>((resolveAnswer) => {
        const rl = createInterface({
          input: context.process.stdin,
          output: context.process.stdout,
        });
        rl.question(question, (input) => {
          rl.close();
          resolveAnswer(input);
        });
      });

  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
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

    const tasksExists = context.fs.existsSync(config.paths.tasks);
    const progressExists = context.fs.existsSync(config.paths.progress);

    if (tasksExists) {
      context.logger.warn(`Will delete contents of: ${config.paths.tasks}`);
    }
    if (progressExists) {
      context.logger.warn(`Will delete: ${config.paths.progress}`);
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
        const entryPath = join(config.paths.tasks, entry);
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
        context.logger.debug(`Deleted ${config.paths.progress}`);
        deletedCount++;
      } catch {
        errors.push(config.paths.progress);
        context.logger.warn(`Failed to delete: ${config.paths.progress}`);
      }
    }

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
  context: CommandContext = createProductionContext(),
  config?: SpeciConfig
): Promise<CommandResult> {
  try {
    const loadedConfig = config ?? (await context.configLoader.load());
    if (options.verbose) {
      context.logger.setVerbose(true);
    }

    if (context.fs.existsSync(loadedConfig.paths.lock)) {
      context.logger.warn(
        'Cannot clean while speci is running. Wait for the active run to complete or remove the lock file.'
      );
      return failResult(
        'Cannot clean while speci is running. Wait for the active run to complete or remove the lock file.'
      );
    }

    const cwd = context.process.cwd();
    const cwdPrefix = cwd.endsWith(sep) ? cwd : `${cwd}${sep}`;
    const resolvedTasksPath = resolve(cwd, loadedConfig.paths.tasks);
    const resolvedProgressPath = resolve(cwd, loadedConfig.paths.progress);
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

    const filesToDelete = enumerateCleanTargets(loadedConfig, context);
    if (filesToDelete.length === 0 || options.yes) {
      return cleanFiles(loadedConfig, context);
    }

    if (!context.process.stdin.isTTY && !options.prompt) {
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
      context.logger.info('Clean cancelled.');
      return { success: true, exitCode: 0 };
    }

    return cleanFiles(loadedConfig, context);
  } catch (error) {
    return handleCommandError(error, 'Clean', context.logger);
  }
}

export default clean;
