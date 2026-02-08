/**
 * State Parser Module
 *
 * Reads and parses PROGRESS.md to determine the current loop state.
 * Provides state detection and task statistics for orchestrator decision-making.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { SpeciConfig, TaskStats, CurrentTask } from '@/types.js';
import { STATE } from '@/types.js';

// Re-export types for backward compatibility
export { STATE } from '@/types.js';
export type { TaskStats, CurrentTask } from '@/types.js';

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
 * Get current orchestration state by parsing PROGRESS.md
 *
 * @param config - Speci configuration
 * @returns Current STATE enum value
 * @throws {Error} ERR-STA-02 if PROGRESS.md cannot be parsed
 *
 * @example
 * ```typescript
 * const state = await getState(config);
 * if (state === STATE.WORK_LEFT) {
 *   // Start implementation
 * }
 * ```
 */
export async function getState(config: SpeciConfig): Promise<STATE> {
  const progressPath = config.paths.progress;

  // Check file existence
  if (!existsSync(progressPath)) {
    return STATE.NO_PROGRESS;
  }

  // Read file content
  const content = await readFile(progressPath, 'utf8');

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
 * @param config - Speci configuration
 * @returns TaskStats object with counts
 *
 * @example
 * ```typescript
 * const stats = await getTaskStats(config);
 * console.log(`${stats.completed}/${stats.total} tasks complete`);
 * ```
 */
export async function getTaskStats(config: SpeciConfig): Promise<TaskStats> {
  const progressPath = config.paths.progress;

  if (!existsSync(progressPath)) {
    return { total: 0, completed: 0, remaining: 0, inReview: 0, blocked: 0 };
  }

  const content = await readFile(progressPath, 'utf8');
  const lines = content.split('\n');

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
 * @param config - Speci configuration
 * @returns Current task info or null if no active task
 */
export async function getCurrentTask(
  config: SpeciConfig
): Promise<CurrentTask | null> {
  const progressPath = config.paths.progress;

  if (!existsSync(progressPath)) {
    return null;
  }

  const content = await readFile(progressPath, 'utf8');
  const lines = content.split('\n');

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

  return null;
}
