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
import { log } from '@/utils/logger.js';
import { CONFIG_FILENAME, getAgentFilename } from '@/constants.js';
import { createError } from '@/errors.js';
import type { IProcess } from '@/interfaces.js';
import type { SpeciConfig } from '@/types.js';
import { ConfigValidator } from '@/validation/index.js';

// Re-export SpeciConfig for backward compatibility
export type { SpeciConfig } from '@/types.js';

// Config cache for memoization (singleton pattern with lazy initialization)
let cachedConfig: SpeciConfig | null = null;

// Get the directory of the compiled output
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to bundled templates (relative to compiled lib/ directory)
const TEMPLATES_DIR_CANDIDATES = [
  join(__dirname, '..', 'templates'),
  join(__dirname, '..', '..', 'templates'),
];

let cachedTemplatesDir: string | null = null;

function resolveTemplatesDir(): string {
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

type AgentName =
  | 'plan'
  | 'task'
  | 'refactor'
  | 'impl'
  | 'review'
  | 'fix'
  | 'tidy';

const DEFAULT_COPILOT_MODELS: Record<AgentName, string> = {
  plan: 'claude-opus-4.6',
  task: 'claude-sonnet-4.6',
  refactor: 'claude-sonnet-4.6',
  impl: 'gpt-5.3-codex',
  review: 'claude-sonnet-4.6',
  fix: 'claude-sonnet-4.6',
  tidy: 'gpt-5.2',
};

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
    copilot: {
      permissions: 'allow-all',
      models: {
        ...DEFAULT_COPILOT_MODELS,
      },
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
 * @returns Path to config file or undefined if not found
 */
function findConfigFile(startDir: string): string | undefined {
  let currentDir = startDir;

  while (true) {
    const configPath = join(currentDir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      log.debug(`Found config file at ${configPath}`);
      return configPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      log.debug('No config file found, using defaults');
      return undefined;
    }
    currentDir = parentDir;
  }
}

/**
 * Deep freeze an object and all nested objects for immutability
 * @param obj - Object to freeze
 * @returns Frozen object
 */
function deepFreeze<T>(obj: T): T {
  // Freeze the object itself
  Object.freeze(obj);

  // Recursively freeze all properties
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = (obj as Record<string, unknown>)[prop];

    if (
      value !== null &&
      typeof value === 'object' &&
      !Object.isFrozen(value)
    ) {
      deepFreeze(value);
    }
  });

  return obj;
}

/**
 * Type guard to check if value is a plain object (not array or null)
 * @param value - Value to check
 * @returns true if value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merge two objects with type safety
 * Uses generic type parameters to maintain type information
 * @param target - Target object
 * @param source - Source object to merge
 * @returns Merged object with target's type
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  // Cast to Record for dynamic property access during merge
  const result = { ...target } as Record<string, unknown>;

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

    const sourceValue = source[key];
    const targetValue = result[key];

    // Use type guard to safely check and narrow types
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      // Both are plain objects - merge recursively with deep merge
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Partial<Record<string, unknown>>
      );
    } else if (sourceValue !== undefined) {
      // Replace with source value (arrays, primitives, or null)
      result[key] = sourceValue;
    }
  }

  // Cast back to original type - this is safe because we only merged
  // properties from Partial<T> into T
  return result as T;
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

  // Use ConfigValidator for validation
  const result = new ConfigValidator(config).validate();

  if (!result.success) {
    // Map validation errors to existing error codes
    const { error } = result;

    if (error.field === 'version') {
      throw createError(
        'ERR-INP-06',
        JSON.stringify({ version: config.version })
      );
    }

    if (error.field?.startsWith('paths.')) {
      throw createError('ERR-INP-07', JSON.stringify({ path: error.message }));
    }

    if (error.field === 'copilot.permissions') {
      throw createError('ERR-INP-08');
    }

    if (error.field === 'gate.maxFixAttempts') {
      throw createError('ERR-INP-09');
    }

    if (error.field === 'loop.maxIterations') {
      throw createError('ERR-INP-10');
    }

    // Fallback for unexpected validation errors
    throw createError('ERR-INP-04', JSON.stringify(error));
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
 * @param proc - Process instance to read environment from
 */
function detectEnvTypos(proc: IProcess): void {
  const speciEnvVars = Object.keys(proc.env).filter((key) =>
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
  path: readonly string[],
  value: unknown
): void {
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];

    // Create intermediate object if missing or not a plain object
    if (!(key in current) || !isPlainObject(current[key])) {
      current[key] = {};
    }

    // Type guard ensures this is safe - we just verified it's a plain object
    current = current[key] as Record<string, unknown>;
  }

  current[path[path.length - 1]] = value;
}

/**
 * Apply environment variable overrides to config
 * @param config - Config object to modify
 * @param proc - Process instance to read environment from
 */
function applyEnvOverrides(config: SpeciConfig, proc: IProcess): void {
  // Check for potential typos
  detectEnvTypos(proc);

  // Cast once at the boundary where we need dynamic property access
  // This single cast is necessary to allow setNestedValue to work with
  // the specific SpeciConfig interface using dynamic path-based access
  const configRecord = config as unknown as Record<string, unknown>;

  for (const mapping of ENV_MAPPINGS) {
    const value = proc.env[mapping.envVar];

    if (value === undefined || value === '') {
      continue;
    }

    const parsed = parseEnvValue(value, mapping);

    if (parsed.valid) {
      setNestedValue(configRecord, mapping.configPath, parsed.value);

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
 * Uses singleton pattern with lazy initialization - config is loaded once and cached
 * for the process lifetime. Subsequent calls return the cached instance.
 *
 * @param options - Optional configuration options
 * @param options.forceReload - Force reload from disk, bypassing cache
 * @param options.processParam - Optional IProcess instance for testing (defaults to global process)
 * @returns Validated SpeciConfig object (frozen for immutability)
 * @throws {Error} ERR-INP-03 if config file is malformed JSON
 * @throws {Error} ERR-INP-04 if config fails schema validation
 *
 * @example
 * ```typescript
 * // First call - loads from disk
 * const config = loadConfig();
 * console.log(config.paths.progress); // 'docs/PROGRESS.md'
 *
 * // Subsequent calls - returns cached instance
 * const config2 = loadConfig();
 * console.log(config === config2); // true
 *
 * // Force reload if needed (testing/development)
 * const config3 = loadConfig({ forceReload: true });
 * ```
 */
export function loadConfig(options?: {
  forceReload?: boolean;
  processParam?: IProcess;
}): SpeciConfig {
  // Check cache unless forceReload requested
  if (cachedConfig && !options?.forceReload) {
    log.debug('Config cache hit');
    return cachedConfig;
  }

  const startTime = performance.now();
  const proc = options?.processParam || process;

  // Find config file
  const configPath = findConfigFile(proc.cwd());

  let rawConfig: Partial<SpeciConfig> = {};

  if (configPath) {
    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      rawConfig = JSON.parse(fileContent);
      log.debug(`Loaded config from ${configPath}`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw createError('ERR-INP-03');
      }
      throw error;
    }
  }

  // Validate and merge with defaults
  const config = validateConfig(rawConfig);

  // Apply environment variable overrides
  applyEnvOverrides(config, proc);

  // Deep freeze for immutability
  const frozenConfig = deepFreeze(config);

  // Cache the result
  cachedConfig = frozenConfig;

  const endTime = performance.now();
  log.debug(`Config loaded in ${(endTime - startTime).toFixed(2)}ms`);

  return frozenConfig;
}

/**
 * Reset the config cache
 *
 * Clears the cached config, forcing the next loadConfig() call to reload from disk.
 * This function should only be used in tests to reset state between test cases.
 *
 * @example
 * ```typescript
 * // In tests
 * beforeEach(() => {
 *   resetConfigCache();
 * });
 * ```
 */
export function resetConfigCache(): void {
  cachedConfig = null;
  cachedTemplatesDir = null;
  log.debug('Config cache cleared');
}

/**
 * Get the cached config if it has been loaded
 *
 * Returns the cached config instance without triggering a load.
 * Useful for checking if config has been loaded without side effects.
 *
 * @returns Cached config or null if not yet loaded
 *
 * @example
 * ```typescript
 * const config = getConfigIfLoaded();
 * if (config) {
 *   console.log('Config already loaded:', config.version);
 * } else {
 *   console.log('Config not yet loaded');
 * }
 * ```
 */
export function getConfigIfLoaded(): SpeciConfig | null {
  return cachedConfig;
}

/**
 * Resolve agent path in .github/agents directory
 *
 * Agents must exist in .github/agents/ (created by `speci init`).
 *
 * @param agentName - Name of agent to resolve (e.g., 'impl', 'review')
 * @param processParam - Optional IProcess instance for testing (defaults to global process)
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
  processParam?: IProcess
): string {
  const proc = processParam || process;
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

/**
 * GitHub Copilot agents directory path (relative to project root)
 */
export const GITHUB_AGENTS_DIR = '.github/agents';
