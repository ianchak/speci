/**
 * Init Command Module
 *
 * Provides a project setup for new Speci users.
 * Creates speci.config.json, directory structure, and initial files.
 */

import { join, relative } from 'node:path';
import {
  getDefaults,
  getAgentsTemplatePath,
  getConfigTemplatePath,
  GITHUB_AGENTS_DIR,
  type SpeciConfig,
} from '@/config.js';
import { CONFIG_FILENAME } from '@/constants.js';
import { createError } from '@/errors.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import { handleCommandError } from '@/utils/error-handler.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  verbose?: boolean; // Show detailed output
  updateAgents?: boolean; // Force update agent files even if they exist
}

/**
 * Check which files already exist
 * @param config - Config to check
 * @param context - Command context for filesystem operations
 * @returns Object with existence flags
 */
function checkExistingFiles(
  config: SpeciConfig,
  context: CommandContext
): {
  configExists: boolean;
  tasksExists: boolean;
  logsExists: boolean;
  agentsExist: boolean;
} {
  return {
    configExists: context.fs.existsSync(CONFIG_FILENAME),
    tasksExists: context.fs.existsSync(config.paths.tasks),
    logsExists: context.fs.existsSync(config.paths.logs),
    agentsExist: context.fs.existsSync(GITHUB_AGENTS_DIR),
  };
}

/**
 * Display summary of actions to be taken
 * @param config - Config to display
 * @param existing - Existing files flags
 * @param updateAgents - Whether to force update agent files
 * @param context - Command context for logging
 */
function displayActionSummary(
  config: SpeciConfig,
  existing: ReturnType<typeof checkExistingFiles>,
  updateAgents: boolean = false,
  context: CommandContext
): void {
  if (existing.configExists) {
    context.logger.warn(`  ${CONFIG_FILENAME} already exists (will skip)`);
  } else {
    context.logger.success(`    ${CONFIG_FILENAME} will be created`);
  }

  if (existing.tasksExists) {
    context.logger.warn(`  ${config.paths.tasks}/ already exists (will skip)`);
  } else {
    context.logger.success(
      `    ${config.paths.tasks}/ directory will be created`
    );
  }

  if (existing.logsExists) {
    context.logger.warn(`  ${config.paths.logs}/ already exists (will skip)`);
  } else {
    context.logger.success(
      `    ${config.paths.logs}/ directory will be created`
    );
  }

  if (existing.agentsExist) {
    if (updateAgents) {
      context.logger.success(
        `    ${GITHUB_AGENTS_DIR}/ directory will be updated`
      );
    } else {
      context.logger.warn(
        `  ${GITHUB_AGENTS_DIR}/ already exists (will skip, use --update-agents to overwrite)`
      );
    }
  } else {
    context.logger.success(
      `    ${GITHUB_AGENTS_DIR}/ directory will be updated`
    );
  }

  context.logger.raw(''); // Blank line for spacing
}

/**
 * Create required directories
 * @param config - Config with paths
 * @param existing - Existing files flags
 * @param context - Command context for filesystem and logging
 */
async function createDirectories(
  config: SpeciConfig,
  existing: ReturnType<typeof checkExistingFiles>,
  context: CommandContext
): Promise<void> {
  const dirs: Array<{ path: string; skip: boolean }> = [
    { path: config.paths.tasks, skip: existing.tasksExists },
    { path: config.paths.logs, skip: existing.logsExists },
  ];

  await Promise.all(
    dirs.map(async ({ path, skip }) => {
      if (skip) {
        context.logger.debug(
          `Skipping directory creation: ${path} (already exists)`
        );
        return;
      }

      try {
        context.fs.mkdirSync(path, { recursive: true });
        context.logger.debug(`Created directory: ${path}`);
      } catch (error) {
        throw createError(
          'ERR-EXE-05',
          JSON.stringify({
            path,
            reason: error instanceof Error ? error.message : String(error),
          })
        );
      }
    })
  );
}

/**
 * Create required files
 * @param existing - Existing files flags
 * @param context - Command context for filesystem and logging
 */
async function createFiles(
  existing: ReturnType<typeof checkExistingFiles>,
  context: CommandContext
): Promise<void> {
  // Create speci.config.json by copying the bundled template verbatim
  if (!existing.configExists) {
    try {
      const templateContent = context.fs.readFileSync(
        getConfigTemplatePath(),
        'utf8'
      );
      context.fs.writeFileSync(CONFIG_FILENAME, templateContent, 'utf8');
      context.logger.success(`Created ${CONFIG_FILENAME}`);
    } catch (error) {
      throw createError(
        'ERR-EXE-06',
        JSON.stringify({
          path: CONFIG_FILENAME,
          reason: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }
}

/**
 * Recursively copy a directory
 * @param src - Source directory path
 * @param dest - Destination directory path
 * @param context - Command context for filesystem and logging
 * @returns Number of files copied
 */
function copyDirectoryRecursive(
  src: string,
  dest: string,
  context: CommandContext
): number {
  let fileCount = 0;

  // Create destination directory
  context.fs.mkdirSync(dest, { recursive: true });

  // Read source directory contents
  const entries = context.fs.readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = context.fs.statSync(srcPath);

    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      fileCount += copyDirectoryRecursive(srcPath, destPath, context);
    } else if (stat.isFile()) {
      // Copy file
      context.fs.copyFileSync(srcPath, destPath);
      const relativePath = relative(getAgentsTemplatePath(), srcPath);
      context.logger.debug(`Copied: ${relativePath}`);
      fileCount++;
    }
  }

  return fileCount;
}

/**
 * Copy agent files to .github/copilot/agents/
 * This allows copilot CLI to use --agent flag with agent names
 * Recursively copies entire agents template directory including subagents
 * @param existing - Existing files flags
 * @param forceUpdate - Force update even if agents exist
 * @param context - Command context for filesystem and logging
 */
async function copyAgentFiles(
  existing: ReturnType<typeof checkExistingFiles>,
  forceUpdate: boolean = false,
  context: CommandContext
): Promise<void> {
  if (existing.agentsExist && !forceUpdate) {
    context.logger.debug(
      `Skipping agent files copy: ${GITHUB_AGENTS_DIR} already exists`
    );
    return;
  }

  try {
    const templateDir = getAgentsTemplatePath();

    if (!context.fs.existsSync(templateDir)) {
      throw createError('ERR-EXE-07', JSON.stringify({ path: templateDir }));
    }

    // Recursively copy entire agents directory
    const fileCount = copyDirectoryRecursive(
      templateDir,
      GITHUB_AGENTS_DIR,
      context
    );

    const action = existing.agentsExist ? 'Updated' : 'Copied';
    context.logger.success(
      `${action} ${fileCount} agent files inside ${GITHUB_AGENTS_DIR}/`
    );
  } catch (error) {
    throw createError(
      'ERR-EXE-08',
      JSON.stringify({
        reason: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/**
 * Display success message and next steps
 * @param context - Command context for logging
 */
function displaySuccess(context: CommandContext): void {
  context.logger.raw('');
  context.logger.info('Next steps:');
  context.logger.muted('  1. Generate your plan with: speci plan');
  context.logger.muted(
    '  2. Generate your tasks and PROGRESS.md with: speci tasks'
  );
  context.logger.muted(
    '  3. After a manual check start the implementation loop: speci run'
  );
  context.logger.raw('');
}

/**
 * Init command handler
 * Initializes Speci in the current directory
 * @param options - Command options
 * @param context - Dependency injection context (defaults to production)
 * @param _config - Optional config override (unused, for API consistency)
 * @returns Promise resolving to command result
 * @sideEffects Creates speci.config.json, docs/ directory, .speci-logs/ directory, and copies agent files to .github/copilot/agents/
 */
export async function init(
  options: InitOptions = {},
  context: CommandContext = createProductionContext(),
  _config?: SpeciConfig
): Promise<CommandResult> {
  try {
    // Display welcome message
    context.logger.raw('');
    context.logger.infoPlain('Initializing Speci in current directory...');
    context.logger.raw('');

    // Use default configuration
    const config = getDefaults();

    // Check existing files
    const existing = checkExistingFiles(config, context);

    // Display action summary
    displayActionSummary(config, existing, options.updateAgents, context);

    // Create directories
    await createDirectories(config, existing, context);

    // Create files
    await createFiles(existing, context);

    // Copy agent files to .github/copilot/agents/
    await copyAgentFiles(existing, options.updateAgents, context);

    // Display success and next steps
    displaySuccess(context);

    return { success: true, exitCode: 0 };
  } catch (error) {
    return handleCommandError(error, 'Initialization', context.logger);
  }
}

export default init;
