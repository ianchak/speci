/**
 * Lock File Management Module
 *
 * Provides lock acquisition, release, and status checking for preventing
 * concurrent speci run instances. Uses atomic write pattern for race-free
 * lock acquisition with JSON format for structured metadata.
 */

import {
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  readFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { SpeciConfig } from '@/config.js';
import { log } from '@/utils/logger.js';
import { createError } from '@/errors.js';
import type { IProcess } from '@/interfaces.js';

/**
 * Lock file data structure (JSON format)
 */
export interface LockFileData {
  version: string;
  pid: number;
  started: string; // ISO 8601 timestamp
  command: string;
  metadata?: {
    iteration?: number;
    taskId?: string;
    state?: string;
  };
}

/**
 * Lock information interface
 */
export interface LockInfo {
  isLocked: boolean;
  started: Date | null;
  pid: number | null;
  elapsed: string | null;
  command?: string;
  isStale?: boolean;
  metadata?: {
    iteration?: number;
    taskId?: string;
    state?: string;
  };
}

/**
 * Check if a process is running
 *
 * @param pid - Process ID to check
 * @returns true if process is running, false otherwise
 */
function isProcessRunning(pid: number): boolean {
  if (pid <= 0) return false;

  try {
    // Signal 0 checks if process exists without sending actual signal
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      return false; // Process not found
    }
    if (error.code === 'EPERM') {
      return true; // Process exists but no permission (Windows)
    }
    // Unknown error - assume process is running to be safe
    return true;
  }
}

/**
 * Acquire the lock for speci run execution
 *
 * @param config - Speci configuration
 * @param processParam - IProcess instance (defaults to global process)
 * @param command - Command name (e.g., "run", "fix")
 * @param metadata - Optional metadata to include in lock file
 * @throws Error if lock already exists and is not stale
 */
export async function acquireLock(
  config: SpeciConfig,
  processParam?: IProcess,
  command: string = 'unknown',
  metadata?: {
    iteration?: number;
    taskId?: string;
    state?: string;
  }
): Promise<void> {
  const proc = processParam || process;
  const lockPath = config.paths.lock;
  const tempPath = `${lockPath}.tmp`;

  // Check if already locked
  if (existsSync(lockPath)) {
    const info = await getLockInfo(config);

    // If lock is stale, remove it
    if (info.isStale) {
      log.info(`Removed stale lock from PID ${info.pid}`);
      await releaseLock(config);
    } else {
      throw createError(
        'ERR-STA-01',
        JSON.stringify({
          pid: info.pid,
          elapsed: info.elapsed,
        })
      );
    }
  }

  // Ensure directory exists
  const lockDir = dirname(lockPath);
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  // Create lock data in JSON format
  const lockData: LockFileData = {
    version: '1.0.0',
    pid: proc.pid,
    started: new Date().toISOString(),
    command,
    ...(metadata && { metadata }),
  };

  try {
    // Atomic write: temp file + rename
    writeFileSync(tempPath, JSON.stringify(lockData, null, 2), 'utf8');
    renameSync(tempPath, lockPath);
  } catch (err) {
    // Cleanup temp file on failure
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Release the lock
 *
 * @param config - Speci configuration
 */
export async function releaseLock(config: SpeciConfig): Promise<void> {
  const lockPath = config.paths.lock;

  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  } catch (err) {
    // Log warning but don't throw - cleanup should be best-effort
    log.warn(`Could not release lock file: ${(err as Error).message}`);
  }
}

/**
 * Check if lock file exists
 *
 * @param config - Speci configuration
 * @returns true if lock file exists
 */
export async function isLocked(config: SpeciConfig): Promise<boolean> {
  return existsSync(config.paths.lock);
}

/**
 * Get lock information
 *
 * @param config - Speci configuration
 * @returns Lock information including PID, start time, elapsed time, command, staleness, and metadata
 */
export async function getLockInfo(config: SpeciConfig): Promise<LockInfo> {
  const lockPath = config.paths.lock;

  if (!existsSync(lockPath)) {
    return {
      isLocked: false,
      started: null,
      pid: null,
      elapsed: null,
      command: undefined,
      isStale: undefined,
      metadata: undefined,
    };
  }

  try {
    const content = readFileSync(lockPath, 'utf8');

    // Try to parse as JSON first (new format)
    if (content.trim().startsWith('{')) {
      try {
        const lockData = JSON.parse(content) as Partial<LockFileData>;

        // Validate and extract fields
        let pid: number | null = null;
        if (typeof lockData.pid === 'number' && lockData.pid > 0) {
          pid = lockData.pid;
        }

        let started: Date | null = null;
        if (typeof lockData.started === 'string') {
          const parsedDate = new Date(lockData.started);
          if (!isNaN(parsedDate.getTime())) {
            started = parsedDate;
          }
        }

        const elapsed = started ? formatElapsed(started) : null;
        const command =
          typeof lockData.command === 'string' ? lockData.command : undefined;
        const isStale = pid !== null ? !isProcessRunning(pid) : undefined;

        return {
          isLocked: true,
          started,
          pid,
          elapsed,
          command,
          isStale,
          metadata: lockData.metadata,
        };
      } catch {
        // JSON parse failed, treat as locked but invalid
        return {
          isLocked: true,
          started: null,
          pid: null,
          elapsed: null,
          command: undefined,
          isStale: undefined,
          metadata: undefined,
        };
      }
    }

    // Fall back to old text format (backward compatibility)
    const lines = content.split('\n');
    let started: Date | null = null;
    let pid: number | null = null;

    for (const line of lines) {
      if (line.startsWith('Started: ')) {
        const timestampStr = line.slice('Started: '.length).trim();
        started = parseTimestamp(timestampStr);
      } else if (line.startsWith('PID: ')) {
        const pidStr = line.slice('PID: '.length).trim();
        const parsedPid = parseInt(pidStr, 10);
        if (!isNaN(parsedPid) && parsedPid > 0) {
          pid = parsedPid;
        }
      }
    }

    const elapsed = started ? formatElapsed(started) : null;
    const isStale = pid !== null ? !isProcessRunning(pid) : undefined;

    return {
      isLocked: true,
      started,
      pid,
      elapsed,
      command: 'unknown', // Old format doesn't have command
      isStale,
      metadata: undefined,
    };
  } catch {
    // Lock file exists but can't be read - consider it locked
    return {
      isLocked: true,
      started: null,
      pid: null,
      elapsed: null,
      command: undefined,
      isStale: undefined,
      metadata: undefined,
    };
  }
}

/**
 * Parse a timestamp string in "YYYY-MM-DD HH:mm:ss" format (for backward compatibility with old format)
 *
 * @param str - Timestamp string to parse
 * @returns Parsed Date object or null if invalid
 */
function parseTimestamp(str: string): Date | null {
  const match = str.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, min, sec] = match.map(Number);
  return new Date(year, month - 1, day, hour, min, sec);
}

/**
 * Format elapsed time since a given date as "HH:MM:SS"
 *
 * @param started - Start date
 * @returns Formatted elapsed time string
 */
function formatElapsed(started: Date): string {
  const elapsed = Date.now() - started.getTime();
  const seconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}
