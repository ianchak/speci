/**
 * Init Command Module
 *
 * Provides a project setup for new Speci users.
 * Creates speci.config.json, directory structure, and initial files.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import {
  getDefaults,
  getAgentsTemplatePath,
  getConfigTemplatePath,
} from '@/config/index.js';
import type { SpeciConfig } from '@/types.js';
import { CONFIG_FILENAME, GITHUB_AGENTS_DIR } from '@/constants.js';
import { createError } from '@/errors.js';
import { listCopilotModels } from '@/copilot.js';
import { selectModelsForInit } from '@/utils/helpers/model-selection.js';
import {
  handleCommandError,
  toErrorMessage,
} from '@/utils/infrastructure/error-handler.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  verbose?: boolean; // Show detailed output
  updateAgents?: boolean; // Force update agent files even if they exist
  reconfigureModels?: boolean; // Update copilot.models in an existing speci.config.json
  updateOpenspec?: boolean; // Force update OpenSpec skills/agent files even if they exist
  prompt?: (question: string) => Promise<string>;
  openSpecTools?: string;
  openSpecInitRunner?: (
    cwd: string,
    tools: string,
    copilotCloud?: boolean
  ) => {
    status: number | null;
    error?: Error;
  };
  openSpecUpdateRunner?: (cwd: string) => {
    status: number | null;
    error?: Error;
  };
  openSpecConfigRunner?: (
    config: SpeciConfig,
    prompt: string,
    proc: CommandContext['process']
  ) => Promise<number>;
}

const OPENSPEC_CONFIG_PATH = join('openspec', 'config.yaml');
const OPENSPEC_SPECS_PATH = join('openspec', 'specs');
const OPENSPEC_CHANGES_PATH = join('openspec', 'changes');
const SPECI_COPILOT_PROMPT_KEY = 'speciCopilotPrompt';
const SPECI_COPILOT_PROMPT = [
  'Prefer OpenSpec CLI commands over direct OpenSpec slash/skill calls.',
  'Use one OpenSpec change per Speci task file.',
  'Archive each task-linked OpenSpec change after the task is reviewed and complete.',
];

const OPENSPEC_CONFIG_GENERATION_PROMPT = `You are initializing OpenSpec for this repository.
Inspect the repository context, including README files, package manifests, TypeScript or other language configuration, source layout, test setup, and existing contribution guidance.
Create or replace openspec/config.yaml with valid YAML for the spec-driven OpenSpec workflow.
Include a concise context section describing this repository's technology stack, architecture, conventions, validation commands, and domain when those details are supported by the repository.
Preserve the required schema: spec-driven setting and any existing OpenSpec-specific settings that are still valid.
Do not modify source code or any other files. Write the config file directly and do not return a Markdown code fence or explanatory prose.`;

function ensureSpeciOpenSpecPrompt(context: CommandContext): void {
  const configPath = OPENSPEC_CONFIG_PATH;
  const yamlBlock = [
    `${SPECI_COPILOT_PROMPT_KEY}: |`,
    ...SPECI_COPILOT_PROMPT.map((line) => `  ${line}`),
    '',
  ].join('\n');

  if (!context.fs.existsSync(configPath)) {
    context.fs.mkdirSync(dirname(configPath), { recursive: true });
    context.fs.writeFileSync(
      configPath,
      ['schema: spec-driven', '', yamlBlock].join('\n'),
      'utf8'
    );
    context.logger.success(`Created ${configPath}`);
    return;
  }

  const content = context.fs.readFileSync(configPath, 'utf8');
  if (content.includes(`${SPECI_COPILOT_PROMPT_KEY}:`)) {
    return;
  }

  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  context.fs.writeFileSync(configPath, `${normalized}${yamlBlock}`, 'utf8');
  context.logger.success(`Updated ${configPath} with Speci Copilot guidance`);
}

function initializeOpenSpec(
  context: CommandContext,
  runInit: (
    cwd: string,
    tools: string,
    copilotCloud?: boolean
  ) => { status: number | null; error?: Error },
  runUpdate: (cwd: string) => { status: number | null; error?: Error },
  tools: string,
  copilotCloud: boolean,
  updateOpenSpec: boolean,
  config: SpeciConfig,
  runConfig: InitOptions['openSpecConfigRunner']
): Promise<void> {
  const hasConfig = context.fs.existsSync(OPENSPEC_CONFIG_PATH);
  const hasWorkspaceDirs =
    context.fs.existsSync(OPENSPEC_SPECS_PATH) &&
    context.fs.existsSync(OPENSPEC_CHANGES_PATH);

  if (hasConfig && hasWorkspaceDirs) {
    if (updateOpenSpec) {
      context.logger.info(
        'Updating OpenSpec skills and agent files for this repository...'
      );
      const updateResult = runUpdate(context.process.cwd());

      if (updateResult.error) {
        context.logger.warn(
          `OpenSpec CLI update skipped (${toErrorMessage(updateResult.error)}).`
        );
      } else if (updateResult.status !== 0) {
        context.logger.warn(
          `OpenSpec CLI update exited with code ${String(updateResult.status)}.`
        );
      } else {
        context.logger.success('Updated OpenSpec skills and agent files');
      }
    } else {
      context.logger.debug('Skipping OpenSpec init: openspec/ already exists');
    }
    ensureSpeciOpenSpecPrompt(context);
    return Promise.resolve();
  }

  context.logger.info(
    hasConfig
      ? 'Completing OpenSpec workspace initialization for this repository...'
      : 'Initializing OpenSpec for this repository...'
  );
  const result = runInit(context.process.cwd(), tools, copilotCloud);

  if (result.error) {
    context.logger.warn(
      `OpenSpec CLI init skipped (${toErrorMessage(result.error)}). Creating fallback openspec/config.yaml.`
    );
  } else if (result.status !== 0) {
    context.logger.warn(
      `OpenSpec CLI init exited with code ${String(result.status)}. Creating fallback openspec/config.yaml.`
    );
  }

  return generateOpenSpecConfig(context, config, !hasConfig, runConfig).then(
    () => {
      ensureSpeciOpenSpecPrompt(context);
    }
  );
}

async function generateOpenSpecConfig(
  context: CommandContext,
  config: SpeciConfig,
  wasMissing: boolean,
  runConfig: InitOptions['openSpecConfigRunner']
): Promise<void> {
  const generate =
    runConfig ??
    context.copilotRunner.generateOpenSpecConfig?.bind(context.copilotRunner);
  if (!wasMissing || !generate) {
    return;
  }

  try {
    const exitCode = await generate(
      config,
      OPENSPEC_CONFIG_GENERATION_PROMPT,
      context.process
    );
    if (exitCode !== 0) {
      context.logger.warn(
        `Copilot config generation exited with code ${String(exitCode)}. Using fallback OpenSpec config.`
      );
    }
  } catch (error) {
    context.logger.warn(
      `Copilot config generation skipped (${toErrorMessage(error)}). Using fallback OpenSpec config.`
    );
  }
}

function runOpenSpecInit(cwd: string, tools: string, copilotCloud = true) {
  const args = ['init', '.', '--tools', tools, '--no-animation'];
  if (
    tools
      .split(',')
      .map((tool) => tool.trim())
      .includes('github-copilot')
  ) {
    args.push(copilotCloud ? '--copilot-cloud' : '--no-copilot-cloud');
  }

  // On Windows, global npm bins are .cmd shims; libuv's spawn doesn't
  // resolve them without a shell, so ENOENT would occur otherwise.
  return spawnSync('openspec', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30_000,
    shell: process.platform === 'win32',
  });
}

function runOpenSpecUpdate(cwd: string) {
  return spawnSync('openspec', ['update', '--force'], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30_000,
    shell: process.platform === 'win32',
  });
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
  openSpecExists: boolean;
} {
  return {
    configExists: context.fs.existsSync(CONFIG_FILENAME),
    tasksExists: context.fs.existsSync(config.paths.tasks),
    logsExists: context.fs.existsSync(config.paths.logs),
    agentsExist: context.fs.existsSync(GITHUB_AGENTS_DIR),
    openSpecExists:
      context.fs.existsSync(OPENSPEC_CONFIG_PATH) &&
      context.fs.existsSync(OPENSPEC_SPECS_PATH) &&
      context.fs.existsSync(OPENSPEC_CHANGES_PATH),
  };
}

/**
 * Display summary of actions to be taken
 * @param config - Config to display
 * @param existing - Existing files flags
 * @param updateAgents - Whether to force update agent files
 * @param updateOpenSpec - Whether to force update OpenSpec skills/agent files
 * @param context - Command context for logging
 */
function displayActionSummary(
  config: SpeciConfig,
  existing: ReturnType<typeof checkExistingFiles>,
  updateAgents: boolean = false,
  updateOpenSpec: boolean = false,
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

  if (existing.openSpecExists) {
    if (updateOpenSpec) {
      context.logger.success('    openspec/ skills and agents will be updated');
    } else {
      context.logger.warn('  openspec/ already exists (will skip)');
    }
  } else {
    context.logger.success('    openspec/ will be initialized');
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
            reason: toErrorMessage(error),
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
  options: InitOptions,
  models: SpeciConfig['copilot']['models'],
  context: CommandContext
): Promise<void> {
  // Create speci.config.json from the bundled template, then apply the selected copilot.models
  if (!existing.configExists) {
    try {
      const templateContent = JSON.parse(
        context.fs.readFileSync(getConfigTemplatePath(), 'utf8')
      ) as SpeciConfig;
      templateContent.copilot.models = models;
      context.fs.writeFileSync(
        CONFIG_FILENAME,
        `${JSON.stringify(templateContent, null, 2)}\n`,
        'utf8'
      );
      context.logger.success(`Created ${CONFIG_FILENAME}`);
    } catch (error) {
      throw createError(
        'ERR-EXE-06',
        JSON.stringify({
          path: CONFIG_FILENAME,
          reason: toErrorMessage(error),
        })
      );
    }
    return;
  }

  if (!options.reconfigureModels) {
    return;
  }

  try {
    const configContent = JSON.parse(
      context.fs.readFileSync(CONFIG_FILENAME, 'utf8')
    ) as SpeciConfig;
    configContent.copilot.models = models;
    context.fs.writeFileSync(
      CONFIG_FILENAME,
      `${JSON.stringify(configContent, null, 2)}\n`,
      'utf8'
    );
    context.logger.success(`Updated model configuration in ${CONFIG_FILENAME}`);
  } catch (error) {
    throw createError(
      'ERR-EXE-06',
      JSON.stringify({
        path: CONFIG_FILENAME,
        reason: toErrorMessage(error),
      })
    );
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
 * Copy agent files to .github/agents/
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
        reason: toErrorMessage(error),
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
  context.logger.muted(
    '  1. (Optional) Inspect OpenSpec setup with: openspec status --json'
  );
  context.logger.muted('  2. Generate your plan with: speci plan');
  context.logger.muted(
    '  3. Generate your tasks and PROGRESS.md with: speci task'
  );
  context.logger.muted(
    '  4. After a manual check start the implementation loop: speci run'
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
 * @sideEffects Creates speci.config.json, docs/ directory, .speci-logs/ directory, and copies agent files to .github/agents/
 */
export async function init(
  options: InitOptions = {},
  context: CommandContext,
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

    let selectedModels = config.copilot.models;
    if (!existing.configExists || options.reconfigureModels) {
      const liveModels = await listCopilotModels(
        context.process,
        context.logger
      );
      const isReconfiguring =
        existing.configExists && Boolean(options.reconfigureModels);
      const existingConfig = isReconfiguring
        ? (JSON.parse(
            context.fs.readFileSync(CONFIG_FILENAME, 'utf8')
          ) as SpeciConfig)
        : undefined;
      const existingConfigModels = existingConfig?.copilot?.models;
      const fallbackModels = existingConfigModels ?? config.copilot.models;

      selectedModels = await selectModelsForInit({
        currentConfig: isReconfiguring ? fallbackModels : undefined,
        prompt: options.prompt,
        logger: context.logger,
        proc: context.process,
        liveModels,
        fallbackModels,
        localModel: existingConfig?.copilot?.localModel,
      });
    }

    // Display action summary
    displayActionSummary(
      config,
      existing,
      options.updateAgents,
      options.updateOpenspec,
      context
    );

    // Create directories
    await createDirectories(config, existing, context);

    // Create files
    await createFiles(existing, options, selectedModels, context);

    // Copy agent files to .github/agents/
    await copyAgentFiles(existing, options.updateAgents, context);

    // Read from disk so a config written earlier in this run is accounted for
    const configuredLocalModel = (() => {
      if (!context.fs.existsSync(CONFIG_FILENAME)) return false;
      try {
        const existingConfig = JSON.parse(
          context.fs.readFileSync(CONFIG_FILENAME, 'utf8')
        ) as SpeciConfig;
        return Boolean(existingConfig.copilot?.localModel);
      } catch {
        return false;
      }
    })();

    // Initialize OpenSpec and ensure Speci guidance is present
    await initializeOpenSpec(
      context,
      options.openSpecInitRunner ?? runOpenSpecInit,
      options.openSpecUpdateRunner ?? runOpenSpecUpdate,
      options.openSpecTools ?? 'github-copilot',
      !configuredLocalModel,
      Boolean(options.updateOpenspec),
      { ...config, copilot: { ...config.copilot, models: selectedModels } },
      options.openSpecConfigRunner
    );

    // Display success and next steps
    displaySuccess(context);

    return { success: true, exitCode: 0 };
  } catch (error) {
    return handleCommandError(error, 'Initialization', context.logger);
  }
}

export default init;
