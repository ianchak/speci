import type { ILogger, IProcess } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';
import { log } from '@/utils/infrastructure/logger.js';

/**
 * Environment variable mapping configuration
 */
export interface EnvMapping {
  envVar: string;
  configPath: readonly string[];
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: string[];
  /** Minimum allowed value for numeric types (default: 0) */
  min?: number;
}

/**
 * Environment variable to config path mappings
 */
export const ENV_MAPPINGS = [
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
    min: 1,
  },
  {
    envVar: 'SPECI_MAX_FIX_ATTEMPTS',
    configPath: ['gate', 'maxFixAttempts'],
    type: 'number',
    min: 0,
  },

  // Enum overrides
  {
    envVar: 'SPECI_COPILOT_PERMISSIONS',
    configPath: ['copilot', 'permissions'],
    type: 'enum',
    enumValues: ['allow-all', 'yolo', 'strict', 'none'],
  },
] as const satisfies readonly EnvMapping[];

/**
 * Valid SPECI_* environment variable names
 */
export const VALID_ENV_VARS = ENV_MAPPINGS.map((m) => m.envVar);

type KnownEnvVar = (typeof ENV_MAPPINGS)[number]['envVar'];

function assertNever(value: never): never {
  throw new Error(`Unhandled config path: ${String(value)}`);
}

function applyMapping(
  config: SpeciConfig,
  mapping: (typeof ENV_MAPPINGS)[number],
  value: unknown
): void {
  const key: KnownEnvVar = mapping.envVar;

  switch (key) {
    case 'SPECI_LOG_PATH':
    case 'SPECI_LOGS_PATH':
      config.paths.logs = value as string;
      return;
    case 'SPECI_PROGRESS_PATH':
      config.paths.progress = value as string;
      return;
    case 'SPECI_LOCK_PATH':
      config.paths.lock = value as string;
      return;
    case 'SPECI_TASKS_PATH':
      config.paths.tasks = value as string;
      return;
    case 'SPECI_MAX_ITERATIONS':
      config.loop.maxIterations = value as number;
      return;
    case 'SPECI_MAX_FIX_ATTEMPTS':
      config.gate.maxFixAttempts = value as number;
      return;
    case 'SPECI_COPILOT_PERMISSIONS':
      config.copilot.permissions =
        value as SpeciConfig['copilot']['permissions'];
      return;
    default:
      assertNever(key);
  }
}

/**
 * Calculate Levenshtein distance between two strings
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance
 */
export function levenshtein(a: string, b: string): number {
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
export function findSimilarEnvVars(input: string, valid: string[]): string[] {
  return valid
    .map((v) => ({ var: v, distance: levenshtein(input, v) }))
    .filter(({ distance }) => distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .map(({ var: v }) => v);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Detect potential typos in SPECI_* environment variables
 * @param proc - Process instance to read environment from
 */
export function detectEnvTypos(proc: IProcess, logger?: ILogger): void {
  const resolvedLogger = logger ?? log;
  const speciEnvVars = Object.keys(proc.env).filter((key) =>
    key.startsWith('SPECI_')
  );

  for (const envVar of speciEnvVars) {
    if (!VALID_ENV_VARS.some((validEnvVar) => validEnvVar === envVar)) {
      const suggestions = findSimilarEnvVars(envVar, VALID_ENV_VARS);

      if (suggestions.length > 0) {
        resolvedLogger.warn(
          `Warning: Unknown environment variable "${envVar}". ` +
            `Did you mean "${suggestions[0]}"?`
        );
      } else {
        resolvedLogger.warn(
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
export function parseEnvValue(
  value: string,
  mapping: EnvMapping
): { valid: boolean; value?: unknown } {
  switch (mapping.type) {
    case 'string':
      return { valid: true, value };

    case 'number': {
      const num = parseInt(value, 10);
      const min = mapping.min ?? 0;
      if (isNaN(num) || num < min) {
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
export function setNestedValue(
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
export function applyEnvOverrides(
  config: SpeciConfig,
  proc: IProcess,
  logger?: ILogger
): void {
  const resolvedLogger = logger ?? log;
  // Check for potential typos
  detectEnvTypos(proc, resolvedLogger);

  for (const mapping of ENV_MAPPINGS) {
    const value = proc.env[mapping.envVar];

    if (value === undefined || value === '') {
      continue;
    }

    const parsed = parseEnvValue(value, mapping);

    if (parsed.valid) {
      applyMapping(config, mapping, parsed.value);

      resolvedLogger.debug(
        `Applying env override: ${mapping.envVar}=${parsed.value}`
      );
    } else {
      resolvedLogger.warn(
        `Warning: Invalid value for ${mapping.envVar}: "${value}". ` +
          `Expected ${mapping.type}${'enumValues' in mapping && mapping.enumValues ? ` (${mapping.enumValues.join('|')})` : ''}. ` +
          `Using config/default value instead.`
      );
    }
  }
}
