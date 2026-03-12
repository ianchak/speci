/**
 * Configuration Loader Module
 *
 * Handles loading, validating, and merging configuration from speci.config.json.
 * Supports priority-based merge: defaults → config file → env vars.
 * Walks up directories to find config file (similar to ESLint/Prettier).
 */

import { join, dirname } from 'node:path';
import { NodeFileSystem } from '@/adapters/node-filesystem.js';
import { CONFIG_FILENAME, DEFAULT_PATHS } from '@/constants.js';
import { createError } from '@/errors.js';
import type { IFileSystem, ILogger, IProcess } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';
import { ConfigValidator } from '@/validation/index.js';
import { log } from '@/utils/infrastructure/logger.js';
import { applyEnvOverrides } from './env-overrides.js';
import { resolveTemplatesDir, resetTemplatesCache } from './path-resolver.js';

// Re-export SpeciConfig for backward compatibility
export type { SpeciConfig } from '@/types.js';

// Config cache for memoization (singleton pattern with lazy initialization)
let cachedConfig: SpeciConfig | null = null;
let cachedDefaults: SpeciConfig | null = null;

/**
 * Get default configuration by reading from the bundled template file.
 *
 * The template file (`templates/speci.config.json`) is the single source of
 * truth for default values. Falls back to hardcoded values only if the
 * template cannot be found (should never happen in a properly installed package).
 *
 * @returns Default SpeciConfig object with all standard paths and settings
 *
 * @example
 * ```typescript
 * const defaults = getDefaults();
 * console.log(defaults.paths.progress); // 'docs/PROGRESS.md'
 * ```
 */
export function getDefaults(
  fs: IFileSystem = new NodeFileSystem()
): SpeciConfig {
  if (cachedDefaults) {
    return cachedDefaults;
  }

  const templatePath = join(resolveTemplatesDir(), CONFIG_FILENAME);

  if (fs.existsSync(templatePath)) {
    const content = fs.readFileSync(templatePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isPlainObject(parsed)) {
      throw new Error(
        'Bundled template speci.config.json has invalid structure'
      );
    }
    if (
      typeof parsed.version !== 'string' ||
      !isPlainObject(parsed.paths) ||
      !isPlainObject(parsed.copilot) ||
      !isPlainObject(parsed.gate) ||
      !isPlainObject(parsed.loop)
    ) {
      throw new Error(
        'Bundled template speci.config.json has invalid structure'
      );
    }

    const result = new ConfigValidator(
      parsed as Partial<SpeciConfig>
    ).validate();
    if (!result.success) {
      throw new Error(
        `Bundled template speci.config.json has invalid structure: field '${result.error.field}' - ${result.error.message}`
      );
    }

    cachedDefaults = result.value;
    return cachedDefaults;
  }

  // Hardcoded fallback — only reached if the template is not bundled
  log.debug('Template file not found, using hardcoded defaults');
  cachedDefaults = {
    version: '1.0.0',
    paths: {
      progress: DEFAULT_PATHS.PROGRESS,
      tasks: DEFAULT_PATHS.TASKS,
      logs: DEFAULT_PATHS.LOGS,
      lock: DEFAULT_PATHS.LOCK,
    },
    copilot: {
      permissions: 'allow-all',
      models: {
        plan: 'claude-opus-4.6',
        task: 'claude-sonnet-4.6',
        refactor: 'claude-sonnet-4.6',
        impl: 'gpt-5.3-codex',
        review: 'claude-sonnet-4.6',
        fix: 'claude-sonnet-4.6',
        tidy: 'gpt-5.2',
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
  return cachedDefaults;
}

/**
 * Find config file by walking up directory tree
 * @param startDir - Starting directory
 * @returns Path to config file or undefined if not found
 */
export function findConfigFile(
  startDir: string,
  fs: IFileSystem,
  logger?: ILogger
): string | undefined {
  const resolvedLogger = logger ?? log;
  let currentDir = startDir;

  while (true) {
    const configPath = join(currentDir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      resolvedLogger.debug(`Found config file at ${configPath}`);
      return configPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      resolvedLogger.debug('No config file found, using defaults');
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
export function deepFreeze<T>(obj: T): T {
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
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merge two objects with type safety
 * Uses generic type parameters to maintain type information
 * @param target - Target object
 * @param source - Source object to merge
 * @returns Merged object with target's type
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
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
export function validateConfig(
  rawConfig: Partial<SpeciConfig>,
  fs: IFileSystem = new NodeFileSystem()
): SpeciConfig {
  const defaults = getDefaults(fs);
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
    throw createError('ERR-INP-04', JSON.stringify({ ...error }));
  }

  return config;
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
 * @param options.forceRefresh - Force reload from disk, bypassing cache
 * @param options.proc - Optional IProcess instance for testing (defaults to global process)
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
 * const config3 = loadConfig({ forceRefresh: true });
 * ```
 */
export function loadConfig(options?: {
  forceRefresh?: boolean;
  proc?: IProcess;
  fs?: IFileSystem;
  logger?: ILogger;
}): SpeciConfig {
  const resolvedLogger = options?.logger ?? log;
  // Check cache unless forceRefresh requested
  if (cachedConfig && !options?.forceRefresh) {
    resolvedLogger.debug('Config cache hit');
    return cachedConfig;
  }

  const startTime = performance.now();
  const proc = options?.proc ?? process;
  const resolvedFs = options?.fs ?? new NodeFileSystem();

  // Find config file
  const configPath = findConfigFile(proc.cwd(), resolvedFs, resolvedLogger);

  let rawConfig: Partial<SpeciConfig> = {};

  if (configPath) {
    try {
      const fileContent = resolvedFs.readFileSync(configPath, 'utf-8');
      const parsedRaw: unknown = JSON.parse(fileContent);
      if (!isPlainObject(parsedRaw)) {
        throw createError('ERR-INP-03');
      }
      rawConfig = parsedRaw as Partial<SpeciConfig>;
      resolvedLogger.debug(`Loaded config from ${configPath}`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw createError('ERR-INP-03');
      }
      throw error;
    }
  }

  // Validate and merge with defaults
  const config = validateConfig(rawConfig, resolvedFs);

  // Apply environment variable overrides
  applyEnvOverrides(config, proc, resolvedLogger);

  // Deep freeze for immutability
  const frozenConfig = deepFreeze(config);

  // Cache the result
  cachedConfig = frozenConfig;

  const endTime = performance.now();
  resolvedLogger.debug(
    `Config loaded in ${(endTime - startTime).toFixed(2)}ms`
  );

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
  resetTemplatesCache();
  resetDefaultsCache();
  log.debug('Config cache cleared');
}

/**
 * Clears the cached default config template.
 * This function should only be used in tests to reset state between test cases.
 */
export function resetDefaultsCache(): void {
  cachedDefaults = null;
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
