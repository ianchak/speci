/**
 * Atomic Write Utility Module
 *
 * Implements safe temp-file-then-rename pattern for writing state files.
 * Ensures files are never left in corrupted state due to crashes, power
 * failures, or disk full conditions.
 *
 * The atomic write pattern:
 * 1. Write content to a temp file in the same directory
 * 2. Use atomic rename to replace the target file
 * 3. If any step fails, original file remains intact
 */

import { promises as fs } from 'node:fs';
import { writeFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Write content to file atomically using temp+rename pattern
 *
 * @param filePath - Target file path (absolute or relative)
 * @param content - Content to write
 * @throws {Error} If write fails (disk full, permission denied, etc.)
 */
export async function atomicWrite(
  filePath: string,
  content: string
): Promise<void> {
  const dir = dirname(filePath);
  const tempName = `.tmp-${randomBytes(8).toString('hex')}`;
  const tempPath = join(dir, tempName);

  try {
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write to temp file with restrictive permissions
    await fs.writeFile(tempPath, content, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'w',
    });

    // Atomic rename to target
    await fs.rename(tempPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    await cleanupTempFile(tempPath);

    // Re-throw with context
    throw wrapWriteError(err, filePath);
  }
}

/**
 * Synchronous atomic file write
 *
 * @param filePath - Target file path (absolute or relative)
 * @param content - Content to write
 * @throws {Error} If write fails
 */
export function atomicWriteSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  const tempName = `.tmp-${randomBytes(8).toString('hex')}`;
  const tempPath = join(dir, tempName);

  try {
    // Ensure directory exists
    mkdirSync(dir, { recursive: true });

    // Write to temp file
    writeFileSync(tempPath, content, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'w',
    });

    // Atomic rename to target
    renameSync(tempPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    cleanupTempFileSync(tempPath);

    // Re-throw with context
    throw wrapWriteError(err, filePath);
  }
}

/**
 * Safely remove temp file if it exists
 */
async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
  } catch {
    // Ignore cleanup errors - temp may not exist
  }
}

/**
 * Safely remove temp file synchronously
 */
function cleanupTempFileSync(tempPath: string): void {
  try {
    unlinkSync(tempPath);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Wrap filesystem errors with user-friendly messages
 */
function wrapWriteError(err: unknown, filePath: string): Error {
  if (!(err instanceof Error)) {
    return new Error(`Failed to write ${filePath}: Unknown error`);
  }

  const code = (err as NodeJS.ErrnoException).code;

  switch (code) {
    case 'ENOSPC':
      return new Error(
        `Disk full: Cannot write to ${filePath}. ` +
          `Free up disk space and try again.`
      );
    case 'EACCES':
    case 'EPERM':
      return new Error(
        `Permission denied: Cannot write to ${filePath}. ` +
          `Check file and directory permissions.`
      );
    case 'EROFS':
      return new Error(
        `Read-only filesystem: Cannot write to ${filePath}. ` +
          `The filesystem is mounted read-only.`
      );
    case 'ENOENT':
      return new Error(
        `Path not found: Cannot write to ${filePath}. ` +
          `Parent directory may not exist.`
      );
    default:
      return new Error(`Failed to write ${filePath}: ${err.message}`);
  }
}
