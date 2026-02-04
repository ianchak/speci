/**
 * Init Command Module
 *
 * Provides interactive project setup for new Speci users.
 * Creates speci.config.json, directory structure, and initial files.
 * Uses Node.js readline for zero-dependency interactive prompts.
 */

import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { log } from '../utils/logger.js';
import { renderBanner } from '../ui/banner.js';
import { colorize } from '../ui/colors.js';
import { getDefaults, type SpeciConfig } from '../config.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  yes?: boolean; // Skip prompts, use defaults
  verbose?: boolean; // Show detailed output
}

/**
 * Prompt user for input with default value
 * @param question - Question to ask
 * @param defaultValue - Default value if no input provided
 * @returns User's answer or default value
 */
async function prompt(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const styled = `${colorize(question, 'sky400')} ${colorize(`(${defaultValue})`, 'dim')}: `;
    rl.question(styled, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Validate path to ensure it's safe (no path traversal outside project)
 * @param input - Path to validate
 * @returns Validated path
 * @throws Error if path attempts to escape project directory
 */
function validatePath(input: string): string {
  const normalized = resolve(process.cwd(), input);
  const projectRoot = process.cwd();

  // Check if normalized path starts with project root
  if (!normalized.startsWith(projectRoot)) {
    throw new Error(
      `Invalid path: ${input} attempts to escape project directory`
    );
  }

  return input;
}

/**
 * Gather configuration through interactive prompts
 * @returns Partial config with user answers
 */
async function gatherConfig(): Promise<Partial<SpeciConfig>> {
  // Project name is prompted but not used in config (for future enhancement)
  await prompt('Project name', basename(process.cwd()));

  const progressPath = validatePath(
    await prompt('Progress file path', 'docs/PROGRESS.md')
  );

  const tasksPath = validatePath(
    await prompt('Tasks directory path', 'docs/tasks')
  );

  const logsPath = validatePath(
    await prompt('Logs directory path', '.speci-logs')
  );

  const gateCommands = await prompt(
    'Gate commands (comma-separated)',
    'npm run lint, npm run typecheck, npm test'
  );

  return {
    paths: {
      progress: progressPath,
      tasks: tasksPath,
      logs: logsPath,
      lock: '.speci-lock',
    },
    gate: {
      commands: gateCommands.split(',').map((cmd) => cmd.trim()),
      maxFixAttempts: 3,
    },
  };
}

/**
 * Merge user config with defaults
 * @param userConfig - Partial config from user
 * @returns Full config merged with defaults
 */
function mergeWithDefaults(userConfig: Partial<SpeciConfig>): SpeciConfig {
  const defaults = getDefaults();

  return {
    ...defaults,
    paths: {
      ...defaults.paths,
      ...userConfig.paths,
    },
    gate: {
      ...defaults.gate,
      ...userConfig.gate,
    },
  };
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
} {
  return {
    configExists: existsSync('speci.config.json'),
    tasksExists: existsSync(config.paths.tasks),
    logsExists: existsSync(config.paths.logs),
  };
}

/**
 * Display summary of actions to be taken
 * @param config - Config to display
 * @param existing - Existing files flags
 */
function displayActionSummary(
  config: SpeciConfig,
  existing: ReturnType<typeof checkExistingFiles>
): void {
  console.log();
  log.info('The following actions will be performed:');
  console.log();

  if (existing.configExists) {
    log.warn('  speci.config.json already exists (will skip)');
  } else {
    console.log(colorize('  ✓ Create speci.config.json', 'success'));
  }

  if (existing.tasksExists) {
    log.warn(`  ${config.paths.tasks}/ already exists (will skip)`);
  } else {
    console.log(
      colorize(`  ✓ Create ${config.paths.tasks}/ directory`, 'success')
    );
  }

  if (existing.logsExists) {
    log.warn(`  ${config.paths.logs}/ already exists (will skip)`);
  } else {
    console.log(
      colorize(`  ✓ Create ${config.paths.logs}/ directory`, 'success')
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
      writeFileSync('speci.config.json', configContent, {
        mode: 0o644,
        encoding: 'utf8',
      });
      log.success('Created speci.config.json');
    } catch (error) {
      throw new Error(
        `Failed to write file: speci.config.json. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Display success message and next steps
 */
function displaySuccess(): void {
  console.log();
  log.success('Speci initialization complete!');
  console.log();
  log.info('Next steps:');
  console.log(colorize('  1. Add tasks to docs/tasks/', 'dim'));
  console.log(colorize('  2. Update docs/PROGRESS.md with your tasks', 'dim'));
  console.log(colorize('  3. Run: speci status', 'dim'));
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

    // Gather configuration (prompts or defaults)
    const userConfig = options.yes
      ? { paths: getDefaults().paths, gate: getDefaults().gate }
      : await gatherConfig();

    // Merge with defaults
    const config = mergeWithDefaults(userConfig);

    // Check existing files
    const existing = checkExistingFiles(config);

    // Display action summary
    displayActionSummary(config, existing);

    // Create directories
    await createDirectories(config, existing);

    // Create files
    await createFiles(config, existing);

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
