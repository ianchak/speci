/**
 * State Parser Module
 *
 * Reads and parses PROGRESS.md to determine the current loop state.
 * Provides state detection and task statistics for orchestrator decision-making.
 *
 * Implements caching with configurable TTL to reduce redundant file I/O when
 * multiple state functions are called in quick succession.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { SpeciConfig, TaskStats, CurrentTask } from '@/types.js';
import { STATE } from '@/types.js';

// Re-export types for backward compatibility
export { STATE } from '@/types.js';
export type { TaskStats, CurrentTask } from '@/types.js';

/**
 * Cache entry for state file content
 */
interface StateFileCache {
  lines: string[];
  timestamp: number;
  ttl: number;
}

/**
 * Options for state functions
 */
export interface StateOptions {
  /** Force cache bypass and read file */
  forceRefresh?: boolean;
  /** Cache TTL in milliseconds (default: 200ms) */
  ttl?: number;
}

// Module-level cache for state file reads
let stateFileCache: StateFileCache | null = null;

// Default TTL for cache (200ms)
const DEFAULT_TTL = 200;

// Pre-compile regex patterns at module load for performance
const PATTERNS = {
  BLOCKED: /TASK_\d+\s*\|.*BLOCKED/i,
  IN_REVIEW: /TASK_\d+\s*\|.*IN.REVIEW/i,
  WORK_LEFT: /TASK_\d+\s*\|.*(NOT STARTED|IN PROGRESS)/i,
  TASK_ROW: /^\s*\|\s*TASK_\d+\s*\|/i,
} as const;

// Priority order for state detection (highest to lowest)
const STATE_PRIORITY: Array<{ state: STATE; pattern: RegExp }> = [
  { state: STATE.BLOCKED, pattern: PATTERNS.BLOCKED },
  { state: STATE.IN_REVIEW, pattern: PATTERNS.IN_REVIEW },
  { state: STATE.WORK_LEFT, pattern: PATTERNS.WORK_LEFT },
];

/**
 * Check if content matches a state pattern
 * @param content - Content to check
 * @param pattern - Regex pattern to test
 * @returns true if pattern matches
 */
export function hasStatePattern(content: string, pattern: RegExp): boolean {
  return pattern.test(content);
}

/**
 * Reset the state file cache
 *
 * Useful for testing or when you need to force a fresh read.
 *
 * @example
 * ```typescript
 * resetStateCache();
 * const state = await getState(config); // Will read from file
 * ```
 */
export function resetStateCache(): void {
  stateFileCache = null;
}

/**
 * Read state file with caching
 *
 * Implements TTL-based caching to reduce redundant file I/O.
 * Cache is shared across all state functions (getState, getTaskStats, getCurrentTask).
 *
 * @param progressPath - Path to PROGRESS.md file
 * @param options - Cache options
 * @returns Array of file lines or undefined if file doesn't exist
 */
async function readStateFile(
  progressPath: string,
  options?: StateOptions
): Promise<string[] | undefined> {
  // Check if file exists
  if (!existsSync(progressPath)) {
    return undefined;
  }

  const now = Date.now();
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const forceRefresh = options?.forceRefresh ?? false;

  // Check cache validity
  if (
    stateFileCache &&
    !forceRefresh &&
    now - stateFileCache.timestamp < stateFileCache.ttl
  ) {
    // Cache hit - return cached lines
    return stateFileCache.lines;
  }

  // Cache miss or expired - read from file
  const content = await readFile(progressPath, 'utf8');
  const lines = content.split('\n');

  // Update cache
  stateFileCache = {
    lines,
    timestamp: now,
    ttl,
  };

  return lines;
}

/**
 * Get current orchestration state by parsing PROGRESS.md
 *
 * Uses cached file content when called within TTL window (default 200ms).
 * Cache is shared with getTaskStats() and getCurrentTask().
 *
 * @param config - Speci configuration
 * @param options - Cache options
 * @returns Current STATE enum value
 * @throws {Error} ERR-STA-02 if PROGRESS.md cannot be parsed
 *
 * @example
 * ```typescript
 * const state = await getState(config);
 * if (state === STATE.WORK_LEFT) {
 *   // Start implementation
 * }
 *
 * // Force fresh read
 * const freshState = await getState(config, { forceRefresh: true });
 * ```
 */
export async function getState(
  config: SpeciConfig,
  options?: StateOptions
): Promise<STATE> {
  const progressPath = config.paths.progress;

  // Read file (with caching)
  const lines = await readStateFile(progressPath, options);

  // File doesn't exist
  if (lines === undefined) {
    return STATE.NO_PROGRESS;
  }

  // Join lines for pattern matching
  const content = lines.join('\n');

  // Check patterns in priority order (early exit)
  for (const { state, pattern } of STATE_PRIORITY) {
    if (pattern.test(content)) {
      return state;
    }
  }

  // No incomplete tasks found
  return STATE.DONE;
}

/**
 * Get task statistics from PROGRESS.md
 *
 * Uses cached file content when called within TTL window (default 200ms).
 * Cache is shared with getState() and getCurrentTask().
 *
 * @param config - Speci configuration
 * @param options - Cache options
 * @returns TaskStats object with counts
 *
 * @example
 * ```typescript
 * const stats = await getTaskStats(config);
 * console.log(`${stats.completed}/${stats.total} tasks complete`);
 * ```
 */
export async function getTaskStats(
  config: SpeciConfig,
  options?: StateOptions
): Promise<TaskStats> {
  const progressPath = config.paths.progress;

  // Read file (with caching)
  const lines = await readStateFile(progressPath, options);

  // File doesn't exist
  if (lines === undefined) {
    return { total: 0, completed: 0, remaining: 0, inReview: 0, blocked: 0 };
  }

  const stats: TaskStats = {
    total: 0,
    completed: 0,
    remaining: 0,
    inReview: 0,
    blocked: 0,
  };

  // Valid task statuses (used to filter out non-task tables like Risk Areas)
  const VALID_STATUSES = new Set([
    'COMPLETE',
    'COMPLETED',
    'DONE',
    'BLOCKED',
    'IN_REVIEW',
    'IN REVIEW',
    'NOT STARTED',
    'IN PROGRESS',
  ]);

  for (const line of lines) {
    // Match task rows: | TASK_001 | Title | Status | ... |
    if (!PATTERNS.TASK_ROW.test(line)) continue;

    // Split on '|' — leading '|' produces empty first element
    // Columns: ['', ' TASK_001 ', ' Title ', ' Status ', ...]
    const cols = line.split('|');
    if (cols.length < 4) continue;

    // Status is always the 3rd data column (index 3 after split)
    const status = cols[3].trim().toUpperCase();

    // Skip rows that don't have a valid task status (e.g., Risk Areas table)
    if (!VALID_STATUSES.has(status)) continue;

    stats.total++;

    if (status === 'COMPLETE' || status === 'COMPLETED' || status === 'DONE') {
      stats.completed++;
    } else if (status === 'BLOCKED') {
      stats.blocked++;
    } else if (status === 'IN_REVIEW' || status === 'IN REVIEW') {
      stats.inReview++;
    } else if (status === 'NOT STARTED' || status === 'IN PROGRESS') {
      stats.remaining++;
    }
  }

  return stats;
}

/**
 * Get the current active task (IN PROGRESS or IN_REVIEW)
 *
 * Uses cached file content when called within TTL window (default 200ms).
 * Cache is shared with getState() and getTaskStats().
 *
 * @param config - Speci configuration
 * @param options - Cache options
 * @returns Current task info or undefined if no active task
 *
 * @example
 * ```typescript
 * const task = await getCurrentTask(config);
 * if (task) {
 *   console.log(`Current task: ${task.id} - ${task.title}`);
 * }
 * ```
 */
export async function getCurrentTask(
  config: SpeciConfig,
  options?: StateOptions
): Promise<CurrentTask | undefined> {
  const progressPath = config.paths.progress;

  // Read file (with caching)
  const lines = await readStateFile(progressPath, options);

  // File doesn't exist
  if (lines === undefined) {
    return undefined;
  }

  // Look for IN PROGRESS first, then IN_REVIEW
  const ACTIVE_STATUSES = ['IN PROGRESS', 'IN_REVIEW', 'IN REVIEW'];

  for (const line of lines) {
    if (!PATTERNS.TASK_ROW.test(line)) continue;

    const cols = line.split('|');
    if (cols.length < 4) continue;

    const taskId = cols[1].trim();
    const title = cols[2].trim();
    const status = cols[3].trim().toUpperCase();

    if (ACTIVE_STATUSES.includes(status)) {
      return { id: taskId, title, status };
    }
  }

  return undefined;
}
