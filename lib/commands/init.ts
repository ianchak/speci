/**
 * Init Command Module
 *
 * Provides a project setup for new Speci users.
 * Creates speci.config.json, directory structure, and initial files.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { log } from '@/utils/logger.js';
import { renderBanner } from '@/ui/banner.js';
import { colorize } from '@/ui/colors.js';
import {
  getDefaults,
  getAgentsTemplatePath,
  GITHUB_AGENTS_DIR,
  type SpeciConfig,
} from '@/config.js';
import { CONFIG_FILENAME } from '@/constants.js';

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
 * @returns Object with existence flags
 */
function checkExistingFiles(config: SpeciConfig): {
  configExists: boolean;
  tasksExists: boolean;
  logsExists: boolean;
  agentsExist: boolean;
} {
  return {
    configExists: existsSync(CONFIG_FILENAME),
    tasksExists: existsSync(config.paths.tasks),
    logsExists: existsSync(config.paths.logs),
    agentsExist: existsSync(GITHUB_AGENTS_DIR),
  };
}

/**
 * Display summary of actions to be taken
 * @param config - Config to display
 * @param existing - Existing files flags
 * @param updateAgents - Whether to force update agent files
 */
function displayActionSummary(
  config: SpeciConfig,
  existing: ReturnType<typeof checkExistingFiles>,
  updateAgents: boolean = false
): void {
  if (existing.configExists) {
    log.warn(`  ${CONFIG_FILENAME} already exists (will skip)`);
  } else {
    console.log(colorize(`    ${CONFIG_FILENAME} will be created`, 'success'));
  }

  if (existing.tasksExists) {
    log.warn(`  ${config.paths.tasks}/ already exists (will skip)`);
  } else {
    console.log(
      colorize(
        `    ${config.paths.tasks}/ directory will be created`,
        'success'
      )
    );
  }

  if (existing.logsExists) {
    log.warn(`  ${config.paths.logs}/ already exists (will skip)`);
  } else {
    console.log(
      colorize(`    ${config.paths.logs}/ directory will be created`, 'success')
    );
  }

  if (existing.agentsExist) {
    if (updateAgents) {
      console.log(
        colorize(
          `    ${GITHUB_AGENTS_DIR}/ directory will be updated`,
          'success'
        )
      );
    } else {
      log.warn(
        `  ${GITHUB_AGENTS_DIR}/ already exists (will skip, use --update-agents to overwrite)`
      );
    }
  } else {
    console.log(
      colorize(`    ${GITHUB_AGENTS_DIR}/ directory will be updated`, 'success')
    );
  }

  console.log();
}

/**
 * Create required directories
 * @param config - Config with paths
 * @param existing - Existing files flags
 */
async function createDirectories(
  config: SpeciConfig,
  existing: ReturnType<typeof checkExistingFiles>
): Promise<void> {
  const dirs: Array<{ path: string; skip: boolean }> = [
    { path: config.paths.tasks, skip: existing.tasksExists },
    { path: config.paths.logs, skip: existing.logsExists },
  ];

  await Promise.all(
    dirs.map(async ({ path, skip }) => {
      if (skip) {
        log.debug(`Skipping directory creation: ${path} (already exists)`);
        return;
      }

      try {
        mkdirSync(path, { recursive: true, mode: 0o755 });
        log.debug(`Created directory: ${path}`);
      } catch (error) {
        throw new Error(
          `Failed to create directory: ${path}. ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}

/**
 * Create required files
 * @param config - Config to write
 * @param existing - Existing files flags
 */
async function createFiles(
  config: SpeciConfig,
  existing: ReturnType<typeof checkExistingFiles>
): Promise<void> {
  // Create speci.config.json
  if (!existing.configExists) {
    try {
      const configContent = JSON.stringify(config, null, 2) + '\n';
      writeFileSync(CONFIG_FILENAME, configContent, {
        mode: 0o644,
        encoding: 'utf8',
      });
      log.success(`Created ${CONFIG_FILENAME}`);
    } catch (error) {
      throw new Error(
        `Failed to write file: ${CONFIG_FILENAME}. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Recursively copy a directory
 * @param src - Source directory path
 * @param dest - Destination directory path
 * @returns Number of files copied
 */
function copyDirectoryRecursive(src: string, dest: string): number {
  let fileCount = 0;

  // Create destination directory
  mkdirSync(dest, { recursive: true, mode: 0o755 });

  // Read source directory contents
  const entries = readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      fileCount += copyDirectoryRecursive(srcPath, destPath);
    } else if (stat.isFile()) {
      // Copy file
      copyFileSync(srcPath, destPath);
      const relativePath = relative(getAgentsTemplatePath(), srcPath);
      log.debug(`Copied: ${relativePath}`);
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
 */
async function copyAgentFiles(
  existing: ReturnType<typeof checkExistingFiles>,
  forceUpdate: boolean = false
): Promise<void> {
  if (existing.agentsExist && !forceUpdate) {
    log.debug(`Skipping agent files copy: ${GITHUB_AGENTS_DIR} already exists`);
    return;
  }

  try {
    const templateDir = getAgentsTemplatePath();

    if (!existsSync(templateDir)) {
      throw new Error(`Agent templates directory not found: ${templateDir}`);
    }

    // Recursively copy entire agents directory
    const fileCount = copyDirectoryRecursive(templateDir, GITHUB_AGENTS_DIR);

    const action = existing.agentsExist ? 'Updated' : 'Copied';
    log.success(
      `${action} ${fileCount} agent files inside ${GITHUB_AGENTS_DIR}/`
    );
  } catch (error) {
    throw new Error(
      `Failed to copy agent files: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Display success message and next steps
 */
function displaySuccess(): void {
  console.log();
  log.info('Next steps:');
  console.log(colorize('  1. Generate your plan with: speci plan', 'dim'));
  console.log(
    colorize(
      '  2. Generate your tasks and PROGRESS.md with: speci tasks',
      'dim'
    )
  );
  console.log(
    colorize(
      '  3. After a manual check start the implementation loop: speci run',
      'dim'
    )
  );
  console.log();
}

/**
 * Init command handler
 * Initializes Speci in the current directory
 * @param options - Command options
 */
export async function init(options: InitOptions = {}): Promise<void> {
  try {
    // Display welcome banner
    renderBanner();
    console.log();
    log.info('Initializing Speci in current directory...');
    console.log();

    // Use default configuration
    const config = getDefaults();

    // Check existing files
    const existing = checkExistingFiles(config);

    // Display action summary
    displayActionSummary(config, existing, options.updateAgents);

    // Create directories
    await createDirectories(config, existing);

    // Create files
    await createFiles(config, existing);

    // Copy agent files to .github/copilot/agents/
    await copyAgentFiles(existing, options.updateAgents);

    // Display success and next steps
    displaySuccess();
  } catch (error) {
    if (error instanceof Error) {
      log.error(`Initialization failed: ${error.message}`);
    } else {
      log.error(`Initialization failed: ${String(error)}`);
    }
    throw error;
  }
}

export default init;
