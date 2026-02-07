/**
 * Lock File Management Module
 *
 * Provides lock acquisition, release, and status checking for preventing
 * concurrent speci run instances. Uses atomic write pattern for race-free
 * lock acquisition.
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
import type { IProcess } from '@/interfaces.js';

/**
 * Lock information interface
 */
export interface LockInfo {
  isLocked: boolean;
  started: Date | null;
  pid: number | null;
  elapsed: string | null;
}

/**
 * Acquire the lock for speci run execution
 *
 * @param config - Speci configuration
 * @param processParam - IProcess instance (defaults to global process)
 * @throws Error if lock already exists
 */
export async function acquireLock(
  config: SpeciConfig,
  processParam?: IProcess
): Promise<void> {
  const proc = processParam || process;
  const lockPath = config.paths.lock;
  const tempPath = `${lockPath}.tmp`;

  // Check if already locked
  if (existsSync(lockPath)) {
    const info = await getLockInfo(config);
    throw new Error(
      `Another speci instance is running (PID: ${info.pid}, started: ${info.elapsed} ago). ` +
        `Use --force to override or wait for it to complete.`
    );
  }

  // Ensure directory exists
  const lockDir = dirname(lockPath);
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  // Format lock content
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const content = `Started: ${timestamp}\nPID: ${proc.pid}`;

  try {
    // Atomic write: temp file + rename
    writeFileSync(tempPath, content, 'utf8');
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
 * @returns Lock information including PID, start time, and elapsed time
 */
export async function getLockInfo(config: SpeciConfig): Promise<LockInfo> {
  const lockPath = config.paths.lock;

  if (!existsSync(lockPath)) {
    return { isLocked: false, started: null, pid: null, elapsed: null };
  }

  try {
    const content = readFileSync(lockPath, 'utf8');
    const lines = content.split('\n');

    let started: Date | null = null;
    let pid: number | null = null;

    for (const line of lines) {
      if (line.startsWith('Started: ')) {
        const timestampStr = line.slice('Started: '.length).trim();
        started = parseTimestamp(timestampStr);
      } else if (line.startsWith('PID: ')) {
        const pidStr = line.slice('PID: '.length).trim();
        pid = parseInt(pidStr, 10);
        if (isNaN(pid)) pid = null;
      }
    }

    const elapsed = started ? formatElapsed(started) : null;

    return { isLocked: true, started, pid, elapsed };
  } catch {
    // Lock file exists but can't be read - consider it locked
    return { isLocked: true, started: null, pid: null, elapsed: null };
  }
}

/**
 * Format a date to "YYYY-MM-DD HH:mm:ss" format
 *
 * @param date - Date to format
 * @returns Formatted timestamp string
 */
function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Parse a timestamp string in "YYYY-MM-DD HH:mm:ss" format
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
