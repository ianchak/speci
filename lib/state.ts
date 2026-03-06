/**
 * State Parser Module
 *
 * Reads and parses PROGRESS.md to determine the current loop state.
 * Provides state detection and task statistics for orchestrator decision-making.
 *
 * Implements caching with configurable TTL to reduce redundant file I/O when
 * multiple state functions are called in quick succession.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type {
  SpeciConfig,
  TaskStats,
  CurrentTask,
  MilestoneInfo,
  TaskStatus,
  GateFailureInfo,
} from '@/types.js';
import { STATE } from '@/types.js';
import { log } from '@/utils/infrastructure/logger.js';
import { createError } from '@/errors.js';

// Re-export types for backward compatibility
export { STATE } from '@/types.js';
export type { TaskStats, CurrentTask, GateFailureInfo } from '@/types.js';

/**
 * Cache entry for state file content
 */
interface StateFileCache {
  lines: string[];
  content: string;
  timestamp: number;
  ttl: number;
}

/**
 * Options for state functions
 */
import type { StateOptions } from '@/types.js';
export type { StateOptions } from '@/types.js';

/**
 * File-system reader contract used by StateCache.
 */
export type FsReader = Pick<
  NonNullable<StateOptions['fs']>,
  'existsSync' | 'readFile'
>;

// Default TTL for cache (200ms)
const DEFAULT_TTL = 200;
const MIN_STATE_TABLE_COLUMNS = 4;
const MIN_TASK_TABLE_COLUMNS = 7;

// Pre-compile regex patterns at module load for performance
const PATTERNS = {
  TASK_ROW: /^\s*\|\s*TASK_\d+\s*\|/i,
  MILESTONE_HEADER: /^##\s+Milestone:\s*M(\d+)\s*-\s*(.+)$/,
  MVT_ROW: /^\s*\|\s*MVT_\w+\s*\|/i,
} as const;

/** Canonical task status values used to identify task rows in PROGRESS.md. */
const VALID_TASK_STATUSES = new Set<TaskStatus>([
  'NOT STARTED',
  'IN PROGRESS',
  'IN REVIEW',
  'COMPLETE',
  'BLOCKED',
]);

/**
 * Type predicate for canonical TaskStatus values.
 * @param s - Status string to validate
 * @returns true if the value is a canonical TaskStatus
 */
function isTaskStatus(s: string): s is TaskStatus {
  return VALID_TASK_STATUSES.has(s as TaskStatus);
}

/**
 * Normalise legacy status aliases to canonical values.
 * @param value - Raw uppercase status value from table cell
 * @returns Canonical status when known, otherwise original input
 */
function normaliseStatusAlias(value: string): string {
  if (value === 'IN_REVIEW') {
    return 'IN REVIEW';
  }
  if (value === 'COMPLETED' || value === 'DONE') {
    return 'COMPLETE';
  }
  return value;
}

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
 * Per-instance cache for PROGRESS.md file reads.
 */
export class StateCache {
  private entry: StateFileCache | null = null;

  /**
   * Read state lines with TTL caching.
   *
   * @param progressPath - Path to PROGRESS.md
   * @param ttl - Cache time-to-live in ms
   * @param fs - Optional filesystem implementation
   * @param forceRefresh - Whether to bypass cache
   * @returns A shallow copy of cached/read lines, or undefined if file is absent
   */
  async get(
    progressPath: string,
    ttl: number,
    fs?: FsReader,
    forceRefresh = false
  ): Promise<string[] | undefined> {
    const now = Date.now();
    if (
      this.entry &&
      !forceRefresh &&
      now - this.entry.timestamp < this.entry.ttl
    ) {
      return [...this.entry.lines];
    }

    const injectedExistsSync = fs?.existsSync;
    if (injectedExistsSync && !injectedExistsSync(progressPath)) {
      return undefined;
    }

    const readStateContent = fs?.readFile
      ? fs.readFile
      : async (path: string, encoding?: BufferEncoding): Promise<string> => {
          const content = await readFile(path, encoding);
          return typeof content === 'string' ? content : content.toString();
        };

    let content: string;
    try {
      content = await readStateContent(progressPath, 'utf8');
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return undefined;
      }
      throw error;
    }

    const lines = content.split('\n');
    this.entry = {
      lines,
      content,
      timestamp: now,
      ttl,
    };
    return [...lines];
  }

  invalidate(): void {
    this.entry = null;
  }

  reset(): void {
    this.invalidate();
  }
}

const defaultCache = new StateCache();

/**
 * Reset the state file cache
 *
 * Useful for testing or when you need to force a fresh read.
 *
 * @deprecated Use instance-scoped StateCache via NodeStateReader instead.
 *
 * @example
 * ```typescript
 * resetStateCache();
 * const state = await getState(config); // Will read from file
 * ```
 */
export function resetStateCache(): void {
  defaultCache.reset();
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
  const cache =
    (options as (StateOptions & { cache?: StateCache }) | undefined)?.cache ??
    defaultCache;
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const forceRefresh = options?.forceRefresh ?? false;
  return cache.get(progressPath, ttl, options?.fs, forceRefresh);
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

  let hasBlocked = false;
  let hasInReview = false;
  let hasWorkLeft = false;

  for (const line of lines) {
    if (!PATTERNS.TASK_ROW.test(line)) continue;

    const cols = line.split('|');
    if (cols.length < MIN_STATE_TABLE_COLUMNS) continue;

    const status = findStatusInColumns(cols, VALID_TASK_STATUSES);
    if (!status) continue;

    if (status === 'BLOCKED') {
      hasBlocked = true;
    } else if (status === 'IN REVIEW') {
      hasInReview = true;
    } else if (status === 'NOT STARTED' || status === 'IN PROGRESS') {
      hasWorkLeft = true;
    }
  }

  if (hasBlocked) return STATE.BLOCKED;
  if (hasInReview) return STATE.IN_REVIEW;
  if (hasWorkLeft) return STATE.WORK_LEFT;
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
  validStatuses: ReadonlySet<TaskStatus>
): TaskStatus | undefined;
function findStatusInColumns(
  cols: string[],
  validStatuses: ReadonlySet<string>
): string | undefined;
function findStatusInColumns(
  cols: string[],
  validStatuses: ReadonlySet<string>
): string | undefined {
  // Start from index 3 (skip: empty first element, Task ID, Title)
  // Status could be at index 3 (old format) or 4 (new format with File column)
  for (let i = 3; i < cols.length && i <= 5; i++) {
    const value = cols[i].trim().toUpperCase();
    const normalisedValue = normaliseStatusAlias(value);
    if (validStatuses.has(value) || validStatuses.has(normalisedValue)) {
      return normalisedValue;
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
    const status = findStatusInColumns(cols, VALID_TASK_STATUSES);

    // Skip rows that don't have a valid task status
    if (!status) continue;

    stats.total++;

    if (status === 'COMPLETE') {
      stats.completed++;
    } else if (status === 'BLOCKED') {
      stats.blocked++;
    } else if (status === 'IN REVIEW') {
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
  const ACTIVE_STATUSES = new Set<TaskStatus>(['IN PROGRESS', 'IN REVIEW']);

  for (const line of lines) {
    if (!PATTERNS.TASK_ROW.test(line)) continue;

    const cols = line.split('|');
    if (cols.length < 4) continue;

    const taskId = cols[1].trim();
    const title = cols[2].trim();

    // Find the Status column dynamically (handles both with and without File column)
    const status = findStatusInColumns(cols, VALID_TASK_STATUSES);
    if (!status) continue;

    if (ACTIVE_STATUSES.has(status)) {
      return { id: taskId, title, status };
    }
  }

  return undefined;
}

/**
 * Get milestone-level MVT status from PROGRESS.md
 *
 * Uses cached file content when called within TTL window (default 200ms).
 * Cache is shared with getState(), getTaskStats(), and getCurrentTask().
 *
 * @param config - Speci configuration
 * @param options - Cache options
 * @returns Milestone status entries
 */
export async function getMilestonesMvtStatus(
  config: SpeciConfig,
  options?: StateOptions
): Promise<MilestoneInfo[]> {
  let lines: string[] | undefined;
  try {
    lines = await readStateFile(config.paths.progress, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const err = createError(
      'ERR-STA-06',
      JSON.stringify({ error: message })
    ) as Error & { cause?: unknown };
    err.cause = error;
    throw err;
  }

  if (lines === undefined) {
    return [];
  }

  const result = parseProgressLines(lines);
  computeMvtReadiness(result);

  if (result.length === 0) {
    log.debug('getMilestonesMvtStatus: No milestone sections found');
  } else if (result.every((entry) => entry.mvtId === null)) {
    log.debug('getMilestonesMvtStatus: No MVT rows found in any milestone');
  }

  return result;
}

function parseProgressLines(lines: string[]): MilestoneInfo[] {
  const VALID_MVT_STATUSES = new Set<string>([
    'NOT STARTED',
    'IN PROGRESS',
    'IN REVIEW',
    'IN_REVIEW',
    'COMPLETE',
    'COMPLETED',
    'DONE',
    'BLOCKED',
  ]);
  const result: MilestoneInfo[] = [];
  let current: MilestoneInfo | null = null;

  for (const line of lines) {
    const milestoneMatch = PATTERNS.MILESTONE_HEADER.exec(line);
    if (!milestoneMatch && /^\s*##\s*Milestone:/i.test(line)) {
      log.debug(`[ERR-STA-04] Malformed milestone header, skipping: ${line}`);
      current = null;
      continue;
    }
    if (milestoneMatch) {
      if (current !== null) {
        result.push(current);
      }

      const milestoneNumber = milestoneMatch[1];
      const milestoneName = milestoneMatch[2];
      if (!milestoneNumber || !milestoneName) {
        log.debug(`[ERR-STA-04] Malformed milestone header, skipping: ${line}`);
        current = null;
        continue;
      }

      current = {
        milestoneId: `M${milestoneNumber}`,
        milestoneName: milestoneName.trim(),
        totalTasks: 0,
        completedTasks: 0,
        mvtId: null,
        mvtStatus: null,
        isMvtReady: false,
      };
      continue;
    }

    if (current === null) {
      continue;
    }

    if (PATTERNS.TASK_ROW.test(line)) {
      const status = findStatusInColumns(line.split('|'), VALID_TASK_STATUSES);
      if (!status) {
        continue;
      }

      current.totalTasks++;
      if (status === 'COMPLETE') {
        current.completedTasks++;
      }
      continue;
    }

    if (PATTERNS.MVT_ROW.test(line)) {
      const cols = line.split('|');
      const mvtId = cols[1]?.trim() || null;
      const rawStatus = findStatusInColumns(cols, VALID_MVT_STATUSES);
      if (!rawStatus) {
        log.debug(
          `[ERR-STA-05] Unexpected MVT status for ${mvtId ?? 'unknown'} — treating as null`
        );
      }

      let mvtStatus: TaskStatus | null = null;
      if (rawStatus && isTaskStatus(rawStatus)) {
        mvtStatus = rawStatus;
      }

      current.mvtId = mvtId;
      current.mvtStatus = mvtStatus;
    }
  }

  if (current !== null) {
    result.push(current);
  }
  return result;
}

function computeMvtReadiness(entries: MilestoneInfo[]): void {
  for (const entry of entries) {
    entry.isMvtReady =
      entry.completedTasks === entry.totalTasks &&
      entry.totalTasks > 0 &&
      entry.mvtId !== null &&
      entry.mvtStatus !== null &&
      entry.mvtStatus !== 'COMPLETE';
  }
}

/** Maximum characters for the Primary Error field in the For Fix Agent table */
const MAX_ERROR_LENGTH = 500;

/**
 * Truncate a string to a maximum length, appending ellipsis if truncated.
 * Trims whitespace and normalises newlines to spaces for table compatibility.
 *
 * @param text - Raw error text (may contain newlines)
 * @param maxLength - Maximum character count
 * @returns Truncated, single-line string
 */
function truncateError(text: string, maxLength: number): string {
  // Collapse newlines/carriage-returns to spaces for markdown table compatibility
  const oneLine = text.replace(/[\r\n]+/g, ' ').trim();
  if (oneLine.length <= maxLength) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLength)}…`;
}

/**
 * Write gate failure notes into the `### For Fix Agent` section of PROGRESS.md.
 *
 * Populates the structured table so the fix agent has immediate context about
 * which gate commands failed, the primary error, and a root-cause hint.
 *
 * If the section is not found in the file the function logs a warning and
 * returns without error (never crashes the orchestration loop).
 *
 * @param config - Speci configuration (used for paths and to look up the current task)
 * @param gateFailure - Gate failure information with per-command results
 *
 * @example
 * ```typescript
 * if (!gateResult.isSuccess) {
 *   await writeFailureNotes(config, gateResult);
 *   // then dispatch fix agent…
 * }
 * ```
 */
export async function writeFailureNotes(
  config: SpeciConfig,
  gateFailure: GateFailureInfo,
  options?: StateOptions
): Promise<void> {
  const progressPath = config.paths.progress;
  const fileExists = options?.fs?.existsSync ?? existsSync;
  const readProgressFile = options?.fs?.readFile
    ? options.fs.readFile
    : async (path: string, encoding?: BufferEncoding): Promise<string> => {
        const content = await readFile(path, encoding);
        return typeof content === 'string' ? content : content.toString();
      };
  const writeProgressFile = options?.fs?.writeFile ?? writeFile;

  if (!fileExists(progressPath)) {
    log.warn('PROGRESS.md not found — skipping failure notes');
    return;
  }

  const content = await readProgressFile(progressPath, 'utf8');

  // Locate the ### For Fix Agent section
  const sectionHeading = '### For Fix Agent';
  const sectionIndex = content.indexOf(sectionHeading);
  if (sectionIndex === -1) {
    log.warn(
      '"### For Fix Agent" section not found in PROGRESS.md — skipping failure notes'
    );
    return;
  }

  // Determine current task (may be undefined)
  const currentTask = await getCurrentTask(config, {
    ...options,
    forceRefresh: true,
  });
  const taskValue = currentTask
    ? `${currentTask.id} — ${currentTask.title}`
    : '—';

  // Collect failed commands
  const failed = gateFailure.results.filter((r) => !r.isSuccess);
  const failedGateValue =
    failed.length > 0 ? failed.map((r) => r.command).join(', ') : '—';

  // Primary error: first failure's stderr, truncated for readability
  const firstFailed = failed[0];
  const primaryErrorValue = firstFailed
    ? truncateError(firstFailed.error || gateFailure.error, MAX_ERROR_LENGTH)
    : '—';

  // Root cause hint: command + exit code for the first failure
  const rootCauseValue = firstFailed
    ? `\`${firstFailed.command}\` exited with code ${String(firstFailed.exitCode)}`
    : '—';

  // Build the replacement table
  const newTable = [
    sectionHeading,
    '',
    '| Field           | Value |',
    '| --------------- | ----- |',
    `| Task            | ${taskValue} |`,
    `| Failed Gate     | ${failedGateValue} |`,
    `| Primary Error   | ${primaryErrorValue} |`,
    `| Root Cause Hint | ${rootCauseValue} |`,
  ].join('\n');

  // Find the end of the existing table (next heading, horizontal rule, or EOF)
  const afterHeading = sectionIndex + sectionHeading.length;
  const rest = content.slice(afterHeading);
  // Match the next markdown heading (## or ###) or horizontal rule (---) that
  // isn't part of the table separator row.
  const nextSectionMatch = rest.match(/\n(?=#{2,3}\s|---\s*$(?!\|))/m);
  const endOffset = nextSectionMatch
    ? afterHeading + (nextSectionMatch.index ?? rest.length)
    : content.length;

  const updated =
    content.slice(0, sectionIndex) + newTable + content.slice(endOffset);

  await writeProgressFile(progressPath, updated, 'utf8');

  // Invalidate the read cache so subsequent state reads see the new content
  resetStateCache();
}
