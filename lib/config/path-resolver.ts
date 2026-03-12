import { existsSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_FILENAME,
  getAgentFilename,
  GITHUB_AGENTS_DIR as AGENTS_DIR,
} from '@/constants.js';
import { createError } from '@/errors.js';
import type { IProcess } from '@/interfaces/index.js';
import { log } from '@/utils/infrastructure/logger.js';

/**
 * GitHub Copilot agents directory path (relative to project root)
 * @deprecated Import from '@/constants.js' instead
 */
export const GITHUB_AGENTS_DIR = AGENTS_DIR;

export type AgentName =
  | 'plan'
  | 'task'
  | 'refactor'
  | 'impl'
  | 'review'
  | 'fix'
  | 'tidy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to bundled templates (relative to compiled lib/ directory)
const TEMPLATES_DIR_CANDIDATES = [
  join(__dirname, '..', '..', 'templates'),
  join(__dirname, '..', '..', '..', 'templates'),
];

let cachedTemplatesDir: string | null = null;

export function resolveTemplatesDir(): string {
  if (cachedTemplatesDir) {
    return cachedTemplatesDir;
  }

  for (const candidate of TEMPLATES_DIR_CANDIDATES) {
    if (existsSync(candidate)) {
      cachedTemplatesDir = candidate;
      return candidate;
    }
  }

  cachedTemplatesDir = TEMPLATES_DIR_CANDIDATES[0];
  return cachedTemplatesDir;
}

/**
 * Resolve a configured path against a project root with a default fallback.
 *
 * @param configuredPath - User-configured path value
 * @param root - Project root to resolve relative paths against
 * @param defaultPath - Default value used when configuredPath is empty
 * @returns Normalized absolute path
 */
export function resolveConfigPath(
  configuredPath: string,
  root: string,
  defaultPath: string
): string {
  const candidate = configuredPath.trim() === '' ? defaultPath : configuredPath;
  return isAbsolute(candidate)
    ? normalize(candidate)
    : resolve(root, candidate);
}

/**
 * Clears the cached templates directory.
 * This function should only be used in tests to reset state between test cases.
 */
export function resetTemplatesCache(): void {
  cachedTemplatesDir = null;
}

/**
 * Resolve agent path in .github/agents directory
 *
 * Agents must exist in .github/agents/ (created by `speci init`).
 *
 * @param agentName - Name of agent to resolve (e.g., 'impl', 'review')
 * @param proc - Optional IProcess instance for testing (defaults to global process)
 * @returns Absolute path to agent file in .github/agents/
 *
 * @example
 * ```typescript
 * const implPath = resolveAgentPath('impl');
 * // Returns: '/project/.github/agents/speci-impl.agent.md'
 * ```
 */
export function resolveAgentPath(
  agentName: AgentName,
  proc: IProcess = process
): string {
  const filename = `${getAgentFilename(agentName)}.agent.md`;
  const agentPath = join(proc.cwd(), GITHUB_AGENTS_DIR, filename);

  log.debug(`Using agent: ${agentPath}`);
  return agentPath;
}

/**
 * Resolve subagent prompt path - always bundled, no custom override
 * @param subagentName - Subagent name (e.g., 'task_generator', 'plan_requirements_deep_dive')
 * @returns Absolute path to subagent prompt file
 * @throws Error if subagent prompt not found
 */
export function resolveSubagentPath(subagentName: string): string {
  const bundledPath = join(
    resolveTemplatesDir(),
    'agents',
    'subagents',
    `${subagentName}.prompt.md`
  );

  if (!existsSync(bundledPath)) {
    throw createError(
      'ERR-INP-11',
      JSON.stringify({ subagent: `${subagentName}.prompt.md` })
    );
  }

  return bundledPath;
}

/**
 * Get path to config template for init command
 * @returns Absolute path to config template
 */
export function getConfigTemplatePath(): string {
  return join(resolveTemplatesDir(), CONFIG_FILENAME);
}

/**
 * Get path to agents template directory for init command
 * @returns Absolute path to agents template directory
 */
export function getAgentsTemplatePath(): string {
  return join(resolveTemplatesDir(), 'agents');
}

/**
 * Get path to subagents template directory
 * @returns Absolute path to subagents template directory
 */
export function getSubagentsTemplatePath(): string {
  return join(resolveTemplatesDir(), 'agents', 'subagents');
}
