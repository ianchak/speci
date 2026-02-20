import { join, resolve, sep } from 'node:path';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { SpeciConfig } from '@/config.js';
import { formatError } from '@/errors.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
import { handleCommandError } from '@/utils/error-handler.js';

export interface CleanOptions {
  verbose?: boolean;
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
      return {
        success: false,
        exitCode: 1,
        error:
          'Cannot clean while speci is running. Wait for the active run to complete or remove the lock file.',
      };
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
      return {
        success: false,
        exitCode: 1,
        error: `Configured path resolves outside the project root: ${!isWithinProject(resolvedTasksPath) ? resolvedTasksPath : resolvedProgressPath}`,
      };
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
        return {
          success: false,
          exitCode: 1,
          error: formatError(
            'ERR-EXE-09',
            JSON.stringify({ path: config.paths.tasks })
          ),
        };
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
      return {
        success: false,
        exitCode: 1,
        error: formatError(
          'ERR-EXE-10',
          JSON.stringify({ path: errors.join(', ') })
        ),
      };
    }

    return { success: true, exitCode: 0 };
  } catch {
    return {
      success: false,
      exitCode: 1,
      error: formatError('ERR-EXE-10', JSON.stringify({ path: 'unexpected' })),
    };
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
    return cleanFiles(loadedConfig, context);
  } catch (error) {
    return handleCommandError(error, 'Clean', context.logger);
  }
}

export default clean;
