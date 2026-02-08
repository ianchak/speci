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

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { log } from '@/utils/logger.js';
import type { SpeciConfig } from '@/config.js';
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
}

/**
 * Default preflight options
 */
const DEFAULT_OPTIONS: PreflightOptions = {
  requireCopilot: true,
  requireConfig: true,
  requireProgress: false,
  requireGit: true,
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

  log.debug('All preflight checks passed');
}
