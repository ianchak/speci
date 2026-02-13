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
 * Find the status value in a split table row by scanning columns for a valid status.
 *
 * Handles both old format (Status at column index 3) and new format with File column
 * (Status at column index 4+). Scans from index 3 onward for the first valid status.
 *
 * @param cols - Array of column values from splitting a table row on '|'
 * @param validStatuses - Set of recognized status strings
 * @returns Uppercase status string, or undefined if no valid status found
 */
function findStatusInColumns(
  cols: string[],
  validStatuses: Set<string>
): string | undefined {
  // Start from index 3 (skip: empty first element, Task ID, Title)
  // Status could be at index 3 (old format) or 4 (new format with File column)
  for (let i = 3; i < cols.length && i <= 5; i++) {
    const value = cols[i].trim().toUpperCase();
    if (validStatuses.has(value)) {
      return value;
    }
  }
  return undefined;
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

  // Minimum columns required (Task ID, Title, Status, Review Status, Priority, Complexity, Dependencies, Assigned To, Attempts)
  // Actual task tables have 9 data columns = 10+ elements after split (including empty first element)
  // Risk Areas and other tables have fewer columns
  const MIN_TASK_TABLE_COLUMNS = 7; // At least 6 data columns to be a real task table

  for (const line of lines) {
    // Match task rows: | TASK_001 | Title | Status | ... |
    if (!PATTERNS.TASK_ROW.test(line)) continue;

    // Split on '|' — leading '|' produces empty first element
    // Columns: ['', ' TASK_001 ', ' Title ', ' Status ', ...]
    const cols = line.split('|');

    // Skip rows with too few columns (not a real task table, e.g., Risk Areas)
    if (cols.length < MIN_TASK_TABLE_COLUMNS) continue;

    // Find the Status column dynamically (handles both with and without File column)
    // Scan from index 3 onward for the first column containing a valid status value
    const status = findStatusInColumns(cols, VALID_STATUSES);

    // Skip rows that don't have a valid task status
    if (!status) continue;

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
  const ACTIVE_STATUSES = new Set(['IN PROGRESS', 'IN_REVIEW', 'IN REVIEW']);

  // Valid task statuses for column detection
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
    if (!PATTERNS.TASK_ROW.test(line)) continue;

    const cols = line.split('|');
    if (cols.length < 4) continue;

    const taskId = cols[1].trim();
    const title = cols[2].trim();

    // Find the Status column dynamically (handles both with and without File column)
    const status = findStatusInColumns(cols, VALID_STATUSES);
    if (!status) continue;

    if (ACTIVE_STATUSES.has(status)) {
      return { id: taskId, title, status };
    }
  }

  return undefined;
}
