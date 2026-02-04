/**
 * Configuration Loader Module
 *
 * Handles loading, validating, and merging configuration from speci.config.json.
 * Supports priority-based merge: defaults → config file → env vars.
 * Walks up directories to find config file (similar to ESLint/Prettier).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './utils/logger.js';

// Get the directory of the compiled output
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to bundled templates (relative to compiled lib/ directory)
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

/**
 * Speci configuration interface
 */
export interface SpeciConfig {
  version: string;
  paths: {
    progress: string;
    tasks: string;
    logs: string;
    lock: string;
  };
  agents: {
    plan: string | null;
    task: string | null;
    refactor: string | null;
    impl: string | null;
    review: string | null;
    fix: string | null;
    tidy: string | null;
  };
  copilot: {
    permissions: 'allow-all' | 'yolo' | 'strict' | 'none';
    model: string | null;
    extraFlags: string[];
  };
  gate: {
    commands: string[];
    maxFixAttempts: number;
  };
  loop: {
    maxIterations: number;
  };
}

type AgentName =
  | 'plan'
  | 'task'
  | 'refactor'
  | 'impl'
  | 'review'
  | 'fix'
  | 'tidy';

/**
 * Get hardcoded default configuration
 *
 * @returns Default SpeciConfig object with all standard paths and settings
 *
 * @example
 * ```typescript
 * const defaults = getDefaults();
 * console.log(defaults.paths.progress); // 'docs/PROGRESS.md'
 * ```
 */
export function getDefaults(): SpeciConfig {
  return {
    version: '1.0.0',
    paths: {
      progress: 'docs/PROGRESS.md',
      tasks: 'docs/tasks',
      logs: '.speci-logs',
      lock: '.speci-lock',
    },
    agents: {
      plan: null,
      task: null,
      refactor: null,
      impl: null,
      review: null,
      fix: null,
      tidy: null,
    },
    copilot: {
      permissions: 'allow-all',
      model: null,
      extraFlags: [],
    },
    gate: {
      commands: ['npm run lint', 'npm run typecheck', 'npm test'],
      maxFixAttempts: 5,
    },
    loop: {
      maxIterations: 100,
    },
  };
}

/**
 * Find config file by walking up directory tree
 * @param startDir - Starting directory
 * @returns Path to config file or null if not found
 */
function findConfigFile(startDir: string): string | null {
  let currentDir = startDir;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const configPath = join(currentDir, 'speci.config.json');
    if (existsSync(configPath)) {
      log.debug(`Found config file at ${configPath}`);
      return configPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      log.debug('No config file found, using defaults');
      return null;
    }
    currentDir = parentDir;
  }
}

/**
 * Deep merge two objects
 * @param target - Target object
 * @param source - Source object
 * @returns Merged object
 */
function deepMerge(
  target: SpeciConfig,
  source: Partial<SpeciConfig>
): SpeciConfig {
  const result = { ...target };

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

    const sourceValue = source[key as keyof SpeciConfig];
    const targetValue = result[key as keyof SpeciConfig];

    if (
      sourceValue !== null &&
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      (result as Record<string, unknown>)[key] = {
        ...targetValue,
        ...sourceValue,
      };
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Check if path contains directory traversal attempts
 * @param path - Path to check
 * @returns true if path is safe
 */
function isSafePath(path: string): boolean {
  // Check for explicit .. in path components
  const parts = path.split(/[/\\]/);
  if (parts.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Validate config against schema
 *
 * Merges raw config with defaults and validates all required fields
 * and value constraints.
 *
 * @param rawConfig - Raw config object to validate
 * @returns Validated config with defaults merged
 * @throws {Error} ERR-INP-04 if config is invalid
 *
 * @example
 * ```typescript
 * const validated = validateConfig({ paths: { progress: 'custom.md' } });
 * ```
 */
export function validateConfig(rawConfig: Partial<SpeciConfig>): SpeciConfig {
  const defaults = getDefaults();
  const config = deepMerge(defaults, rawConfig);

  // Validate version
  if (config.version && !config.version.startsWith('1.')) {
    throw new Error(
      `Config version '${config.version}' is not compatible. Expected: 1.x`
    );
  }

  // Validate paths for directory traversal
  if (config.paths) {
    for (const value of Object.values(config.paths)) {
      if (value && !isSafePath(value)) {
        throw new Error(`Path '${value}' attempts to escape project directory`);
      }
    }
  }

  // Validate copilot permissions
  const validPermissions = ['allow-all', 'yolo', 'strict', 'none'];
  if (
    config.copilot.permissions &&
    !validPermissions.includes(config.copilot.permissions)
  ) {
    throw new Error(
      `Invalid config value for 'copilot.permissions': must be one of ${validPermissions.join(', ')}`
    );
  }

  // Validate maxFixAttempts
  if (config.gate.maxFixAttempts < 1) {
    throw new Error(
      `Invalid config value for 'gate.maxFixAttempts': must be at least 1`
    );
  }

  // Validate maxIterations
  if (config.loop.maxIterations < 1) {
    throw new Error(
      `Invalid config value for 'loop.maxIterations': must be at least 1`
    );
  }

  return config;
}

/**
 * Environment variable mapping configuration
 */
interface EnvMapping {
  envVar: string;
  configPath: string[];
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
}

/**
 * Environment variable to config path mappings
 */
const ENV_MAPPINGS: EnvMapping[] = [
  // Path overrides
  { envVar: 'SPECI_LOG_PATH', configPath: ['paths', 'logs'], type: 'string' },
  { envVar: 'SPECI_LOGS_PATH', configPath: ['paths', 'logs'], type: 'string' },
  {
    envVar: 'SPECI_PROGRESS_PATH',
    configPath: ['paths', 'progress'],
    type: 'string',
  },
  { envVar: 'SPECI_LOCK_PATH', configPath: ['paths', 'lock'], type: 'string' },
  {
    envVar: 'SPECI_TASKS_PATH',
    configPath: ['paths', 'tasks'],
    type: 'string',
  },

  // Numeric overrides
  {
    envVar: 'SPECI_MAX_ITERATIONS',
    configPath: ['loop', 'maxIterations'],
    type: 'number',
  },
  {
    envVar: 'SPECI_MAX_FIX_ATTEMPTS',
    configPath: ['gate', 'maxFixAttempts'],
    type: 'number',
  },

  // String overrides
  {
    envVar: 'SPECI_COPILOT_MODEL',
    configPath: ['copilot', 'model'],
    type: 'string',
  },
  {
    envVar: 'SPECI_MODEL',
    configPath: ['copilot', 'model'],
    type: 'string',
  },

  // Enum overrides
  {
    envVar: 'SPECI_COPILOT_PERMISSIONS',
    configPath: ['copilot', 'permissions'],
    type: 'enum',
    enumValues: ['allow-all', 'yolo', 'strict', 'none'],
  },
];

/**
 * Valid SPECI_* environment variable names
 */
const VALID_ENV_VARS = ENV_MAPPINGS.map((m) => m.envVar);

/**
 * Calculate Levenshtein distance between two strings
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find similar env var names using Levenshtein distance
 * @param input - Input env var name
 * @param valid - List of valid env var names
 * @returns Sorted list of similar names (distance <= 3)
 */
function findSimilarEnvVars(input: string, valid: string[]): string[] {
  return valid
    .map((v) => ({ var: v, distance: levenshtein(input, v) }))
    .filter(({ distance }) => distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .map(({ var: v }) => v);
}

/**
 * Detect potential typos in SPECI_* environment variables
 */
function detectEnvTypos(): void {
  const speciEnvVars = Object.keys(process.env).filter((key) =>
    key.startsWith('SPECI_')
  );

  for (const envVar of speciEnvVars) {
    if (!VALID_ENV_VARS.includes(envVar)) {
      const suggestions = findSimilarEnvVars(envVar, VALID_ENV_VARS);

      if (suggestions.length > 0) {
        log.warn(
          `Warning: Unknown environment variable "${envVar}". ` +
            `Did you mean "${suggestions[0]}"?`
        );
      } else {
        log.warn(
          `Warning: Unknown environment variable "${envVar}". ` +
            `Valid SPECI_* variables: ${VALID_ENV_VARS.join(', ')}`
        );
      }
    }
  }
}

/**
 * Parse and validate environment variable value
 * @param value - Raw string value from env var
 * @param mapping - Env mapping configuration
 * @returns Validation result with parsed value
 */
function parseEnvValue(
  value: string,
  mapping: EnvMapping
): { valid: boolean; value?: unknown } {
  switch (mapping.type) {
    case 'string':
      return { valid: true, value };

    case 'number': {
      const num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) {
        return { valid: false };
      }
      return { valid: true, value: num };
    }

    case 'boolean': {
      const lower = value.toLowerCase();
      if (['1', 'true', 'yes'].includes(lower)) {
        return { valid: true, value: true };
      }
      if (['0', 'false', 'no', ''].includes(lower)) {
        return { valid: true, value: false };
      }
      return { valid: false };
    }

    case 'enum': {
      if (mapping.enumValues?.includes(value)) {
        return { valid: true, value };
      }
      // Try case-insensitive match
      const lower = value.toLowerCase();
      const match = mapping.enumValues?.find((v) => v.toLowerCase() === lower);
      if (match) {
        return { valid: true, value: match };
      }
      return { valid: false };
    }

    default:
      return { valid: false };
  }
}

/**
 * Set a nested value in an object using path array
 * @param obj - Target object
 * @param path - Path array (e.g., ['paths', 'logs'])
 * @param value - Value to set
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown
): void {
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < path.length - 1; i++) {
    if (!(path[i] in current)) {
      current[path[i]] = {};
    }
    current = current[path[i]] as Record<string, unknown>;
  }

  current[path[path.length - 1]] = value;
}

/**
 * Apply environment variable overrides to config
 * @param config - Config object to modify
 */
function applyEnvOverrides(config: SpeciConfig): void {
  // Check for potential typos
  detectEnvTypos();

  for (const mapping of ENV_MAPPINGS) {
    const value = process.env[mapping.envVar];

    if (value === undefined || value === '') {
      continue;
    }

    const parsed = parseEnvValue(value, mapping);

    if (parsed.valid) {
      setNestedValue(
        config as unknown as Record<string, unknown>,
        mapping.configPath,
        parsed.value
      );

      log.debug(`Applying env override: ${mapping.envVar}=${parsed.value}`);
    } else {
      log.warn(
        `Warning: Invalid value for ${mapping.envVar}: "${value}". ` +
          `Expected ${mapping.type}${mapping.enumValues ? ` (${mapping.enumValues.join('|')})` : ''}. ` +
          `Using config/default value instead.`
      );
    }
  }
}

/**
 * Load and validate configuration
 * Searches for speci.config.json starting from cwd, walking up parent directories.
 * Applies defaults and environment variable overrides.
 *
 * @returns Validated SpeciConfig object
 * @throws {Error} ERR-INP-03 if config file is malformed JSON
 * @throws {Error} ERR-INP-04 if config fails schema validation
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * console.log(config.paths.progress); // 'docs/PROGRESS.md'
 * ```
 */
export function loadConfig(): SpeciConfig {
  const startTime = performance.now();

  // Find config file
  const configPath = findConfigFile(process.cwd());

  let rawConfig: Partial<SpeciConfig> = {};

  if (configPath) {
    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      rawConfig = JSON.parse(fileContent);
      log.debug(`Loaded config from ${configPath}`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Config file has invalid JSON: ${error.message}`);
      }
      throw error;
    }
  }

  // Validate and merge with defaults
  const config = validateConfig(rawConfig);

  // Apply environment variable overrides
  applyEnvOverrides(config);

  const endTime = performance.now();
  log.debug(`Config loaded in ${(endTime - startTime).toFixed(2)}ms`);

  return config;
}

/**
 * Resolve agent path in .github/copilot/agents directory
 *
 * Agents must exist in .github/copilot/agents/ (created by `speci init`).
 * Use --agent CLI flag to specify a different agent filename.
 *
 * @param agentName - Name of agent to resolve (e.g., 'impl', 'review')
 * @param overrideFilename - Optional filename override (e.g., 'my-custom.agent.md')
 * @returns Absolute path to agent file in .github/copilot/agents/
 *
 * @example
 * ```typescript
 * const implPath = resolveAgentPath('impl');
 * // Returns: '/project/.github/copilot/agents/speci-impl.agent.md'
 *
 * const customPath = resolveAgentPath('impl', 'my-custom.agent.md');
 * // Returns: '/project/.github/copilot/agents/my-custom.agent.md'
 * ```
 */
export function resolveAgentPath(
  agentName: AgentName,
  overrideFilename?: string
): string {
  const filename = overrideFilename || `speci-${agentName}.agent.md`;
  const agentPath = join(process.cwd(), GITHUB_AGENTS_DIR, filename);

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
    TEMPLATES_DIR,
    'agents',
    'subagents',
    `${subagentName}.prompt.md`
  );

  if (!existsSync(bundledPath)) {
    throw new Error(`Subagent prompt not found: ${subagentName}.prompt.md`);
  }

  return bundledPath;
}

/**
 * Get path to config template for init command
 * @returns Absolute path to config template
 */
export function getConfigTemplatePath(): string {
  return join(TEMPLATES_DIR, 'speci.config.json');
}

/**
 * Get path to agents template directory for init command
 * @returns Absolute path to agents template directory
 */
export function getAgentsTemplatePath(): string {
  return join(TEMPLATES_DIR, 'agents');
}

/**
 * Get path to subagents template directory
 * @returns Absolute path to subagents template directory
 */
export function getSubagentsTemplatePath(): string {
  return join(TEMPLATES_DIR, 'agents', 'subagents');
}

/**
 * GitHub Copilot agents directory path (relative to project root)
 */
export const GITHUB_AGENTS_DIR = '.github/copilot/agents';
