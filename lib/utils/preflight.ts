/**
 * Preflight Checks Module
 *
 * Validates the environment before command execution. These checks ensure that
 * prerequisites like the Copilot CLI, configuration files, and git repository
 * are present before attempting operations that depend on them.
 *
 * All checks complete quickly (<100ms total) to avoid impacting CLI startup time.
 * Failed checks exit with code 2 (usage error) and provide actionable remediation steps.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { log } from '@/utils/logger.js';
import type { SpeciConfig } from '@/config.js';
import { getAgentsTemplatePath, GITHUB_AGENTS_DIR } from '@/config.js';
import { CONFIG_FILENAME } from '@/constants.js';
import type { IProcess } from '@/interfaces.js';
import { PathValidator } from '@/validation/path-validator.js';

/**
 * Options for customizing which preflight checks to run
 */
export interface PreflightOptions {
  /** Check if Copilot CLI is installed (default: true) */
  requireCopilot?: boolean;
  /** Check if speci.config.json exists (default: true) */
  requireConfig?: boolean;
  /** Check if PROGRESS.md exists (default: false) */
  requireProgress?: boolean;
  /** Check if in git repository (default: true) */
  requireGit?: boolean;
  /** Check if agent files are present and up-to-date (default: true) */
  requireAgents?: boolean;
}

/**
 * Default preflight options
 */
const DEFAULT_OPTIONS: PreflightOptions = {
  requireCopilot: true,
  requireConfig: true,
  requireProgress: false,
  requireGit: true,
  requireAgents: true,
};

/**
 * Custom error class for preflight check failures
 */
export class PreflightError extends Error {
  public readonly exitCode = 2;
  public readonly remediation: string[];

  constructor(
    public readonly check: string,
    message: string,
    remediation: string[]
  ) {
    super(message);
    this.name = 'PreflightError';
    this.remediation = remediation;
  }
}

/**
 * Check if Copilot CLI is installed and available in PATH
 *
 * @param processParam - IProcess instance (defaults to global process)
 * @throws {PreflightError} If copilot command is not found
 */
export async function checkCopilotInstalled(
  processParam?: IProcess
): Promise<void> {
  const proc = processParam || process;
  const isWindows = proc.platform === 'win32';
  const command = isWindows ? 'where copilot' : 'which copilot';

  try {
    execSync(command, { stdio: 'pipe', encoding: 'utf8' });
  } catch {
    throw new PreflightError(
      'Copilot CLI not found',
      'GitHub Copilot CLI is not installed or not in PATH.',
      [
        'Install via npm: npm install -g @github/copilot',
        'Or via WinGet (Windows): winget install GitHub.Copilot',
        'Or via Homebrew (macOS/Linux): brew install copilot-cli',
        'Verify installation: copilot --version',
      ]
    );
  }
}

/**
 * Check if speci.config.json exists in current directory or any parent
 *
 * @param processParam - IProcess instance (defaults to global process)
 * @throws {PreflightError} If config file is not found
 */
export async function checkConfigExists(
  processParam?: IProcess
): Promise<void> {
  const proc = processParam || process;
  let currentDir = proc.cwd();
  let parentDir = '';

  // Walk up directory tree
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const configPath = join(currentDir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return; // Found it
    }

    parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root without finding config
      throw new PreflightError(
        'Configuration not found',
        `No ${CONFIG_FILENAME} found in current directory or any parent.`,
        [
          'Run `speci init` to create a new configuration',
          `Or create ${CONFIG_FILENAME} manually`,
        ]
      );
    }
    currentDir = parentDir;
  }
}

/**
 * Check if PROGRESS.md exists at configured path
 *
 * @param config - Speci configuration with paths.progress
 * @throws {PreflightError} If progress file is not found
 */
export async function checkProgressExists(config: SpeciConfig): Promise<void> {
  const progressPath = config.paths.progress;

  const result = new PathValidator(progressPath).exists().validate();

  if (!result.success) {
    throw new PreflightError(
      'Progress file not found',
      `PROGRESS.md not found at: ${progressPath}`,
      [
        'Run `speci init` to create progress tracking file',
        `Or create ${progressPath} manually with task table`,
      ]
    );
  }
}

/**
 * Check if current directory is within a git repository
 *
 * @param processParam - IProcess instance (defaults to global process)
 * @throws {PreflightError} If not in a git repository
 */
export async function checkGitRepository(
  processParam?: IProcess
): Promise<void> {
  const proc = processParam || process;
  let currentDir = proc.cwd();
  let parentDir = '';

  // Walk up directory tree
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitPath = join(currentDir, '.git');
    if (existsSync(gitPath)) {
      return; // Found it
    }

    parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root without finding .git
      throw new PreflightError(
        'Git repository not found',
        'Current directory is not within a git repository.',
        [
          'Initialize a git repository: git init',
          'Or navigate to an existing git repository',
        ]
      );
    }
    currentDir = parentDir;
  }
}

/**
 * Recursively list all files in a directory, returning paths relative to the base directory
 *
 * @param dir - Directory to list
 * @param baseDir - Base directory for relative paths
 * @returns Array of relative file paths
 */
function listFilesRecursive(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, baseDir));
    } else if (stat.isFile()) {
      // Use forward slashes for consistent cross-platform paths
      const relativePath = fullPath
        .slice(baseDir.length + 1)
        .replace(/\\/g, '/');
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Check if agent template files are present in the project and up-to-date
 * with the bundled templates.
 *
 * Missing agents throw a PreflightError. Outdated agents log a warning
 * but do not block execution.
 *
 * @param processParam - IProcess instance (defaults to global process)
 * @throws {PreflightError} If agent files directory or agent files are missing
 */
export async function checkAgentTemplates(
  processParam?: IProcess
): Promise<void> {
  const proc = processParam || process;
  const projectAgentsDir = join(proc.cwd(), GITHUB_AGENTS_DIR);

  // Check if agents directory exists at all
  if (!existsSync(projectAgentsDir)) {
    throw new PreflightError(
      'Agent files not found',
      `Agent files directory not found at: ${GITHUB_AGENTS_DIR}`,
      [
        'Run `speci init` to copy agent templates to your project',
        'Or run `speci init --update-agents` to refresh agent files',
      ]
    );
  }

  // Get the bundled templates directory
  const templatesDir = getAgentsTemplatePath();
  if (!existsSync(templatesDir)) {
    // Bundled templates missing — installation issue, skip check
    log.debug(
      'Bundled agent templates directory not found, skipping agent check'
    );
    return;
  }

  // List all files in the templates directory
  const templateFiles = listFilesRecursive(templatesDir, templatesDir);
  const missing: string[] = [];
  const outdated: string[] = [];

  for (const relPath of templateFiles) {
    const projectFile = join(projectAgentsDir, relPath);
    const templateFile = join(templatesDir, relPath);

    if (!existsSync(projectFile)) {
      missing.push(relPath);
    } else {
      // Compare contents
      const projectContent = readFileSync(projectFile, 'utf8');
      const templateContent = readFileSync(templateFile, 'utf8');

      if (projectContent !== templateContent) {
        outdated.push(relPath);
      }
    }
  }

  // Missing agents are a hard error
  if (missing.length > 0) {
    throw new PreflightError(
      'Agent files missing',
      `${missing.length} agent file(s) missing from ${GITHUB_AGENTS_DIR}: ${missing.join(', ')}`,
      [
        'Run `speci init --update-agents` to copy missing agent files',
        'Missing files: ' + missing.join(', '),
      ]
    );
  }

  // Outdated agents are a warning (don't block)
  if (outdated.length > 0) {
    log.warn(
      `${outdated.length} agent file(s) differ from bundled templates: ${outdated.join(', ')}`
    );
    log.warn(
      'Run `speci init --update-agents` to update agent files to latest versions'
    );
  }
}

/**
 * Run all configured preflight checks
 *
 * Checks run in parallel where independent. If any check fails, throws
 * PreflightError with remediation steps for the caller to handle.
 *
 * @param config - Speci configuration
 * @param options - Options to customize which checks run
 * @param processParam - IProcess instance (defaults to global process)
 * @throws {PreflightError} If any check fails
 */
export async function preflight(
  config: SpeciConfig,
  options: PreflightOptions = {},
  processParam?: IProcess
): Promise<void> {
  const proc = processParam || process;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const checks: Promise<void>[] = [];

  // Build list of checks to run (independent checks can run in parallel)
  if (opts.requireCopilot) {
    checks.push(checkCopilotInstalled(proc));
  }
  if (opts.requireConfig) {
    checks.push(checkConfigExists(proc));
  }
  if (opts.requireGit) {
    checks.push(checkGitRepository(proc));
  }

  // Run independent checks in parallel
  await Promise.all(checks);

  // Progress check depends on config being loaded
  if (opts.requireProgress) {
    await checkProgressExists(config);
  }

  // Agent template check runs after independent checks
  if (opts.requireAgents) {
    await checkAgentTemplates(proc);
  }

  log.debug('All preflight checks passed');
}
