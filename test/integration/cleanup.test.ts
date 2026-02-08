/**
 * Integration Tests for Cleanup Execution
 *
 * Verifies that cleanup runs before exit in various error scenarios,
 * including lock file release and proper resource cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  registerCleanup,
  runCleanup,
  resetCleanupState,
} from '../../lib/utils/signals.js';

describe('Cleanup Integration', () => {
  const testDir = join(process.cwd(), '.test-cleanup-integration');

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    resetCleanupState();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetCleanupState();
  });

  describe('Lock File Release', () => {
    it('should release lock file when cleanup runs', async () => {
      const lockPath = join(testDir, '.speci-lock');
      writeFileSync(lockPath, 'test-lock');

      expect(existsSync(lockPath)).toBe(true);

      // Register cleanup to remove lock
      registerCleanup(() => {
        if (existsSync(lockPath)) {
          rmSync(lockPath);
        }
      });

      await runCleanup();

      expect(existsSync(lockPath)).toBe(false);
    });

    it('should release lock even if other cleanup fails', async () => {
      const lockPath = join(testDir, '.speci-lock');
      writeFileSync(lockPath, 'test-lock');

      // Register failing cleanup first
      registerCleanup(() => {
        throw new Error('Intentional cleanup failure');
      });

      // Register lock cleanup second (runs first due to LIFO order)
      registerCleanup(() => {
        if (existsSync(lockPath)) {
          rmSync(lockPath);
        }
      });

      await runCleanup();

      // Lock should be released despite other cleanup failing
      expect(existsSync(lockPath)).toBe(false);
    });
  });

  describe('Multiple Resource Cleanup', () => {
    it('should cleanup multiple resources in order', async () => {
      const file1 = join(testDir, 'temp1.txt');
      const file2 = join(testDir, 'temp2.txt');
      const file3 = join(testDir, 'temp3.txt');

      writeFileSync(file1, 'temp1');
      writeFileSync(file2, 'temp2');
      writeFileSync(file3, 'temp3');

      // Register cleanup for each file (will execute in reverse order)
      registerCleanup(() => {
        if (existsSync(file1)) rmSync(file1);
      });
      registerCleanup(() => {
        if (existsSync(file2)) rmSync(file2);
      });
      registerCleanup(() => {
        if (existsSync(file3)) rmSync(file3);
      });

      await runCleanup();

      expect(existsSync(file1)).toBe(false);
      expect(existsSync(file2)).toBe(false);
      expect(existsSync(file3)).toBe(false);
    });

    it('should handle async cleanup operations', async () => {
      const cleanupLog: string[] = [];

      registerCleanup(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        cleanupLog.push('cleanup-1');
      });

      registerCleanup(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        cleanupLog.push('cleanup-2');
      });

      registerCleanup(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        cleanupLog.push('cleanup-3');
      });

      await runCleanup();

      // All cleanups should have completed
      expect(cleanupLog).toEqual(['cleanup-3', 'cleanup-2', 'cleanup-1']);
    });
  });

  describe('Error Scenarios', () => {
    it('should cleanup on early exit from validation failure', async () => {
      const tempFile = join(testDir, 'validation-temp.txt');
      writeFileSync(tempFile, 'temp');

      registerCleanup(() => {
        if (existsSync(tempFile)) rmSync(tempFile);
      });

      // Simulate validation failure scenario
      const validationFailed = true;
      if (validationFailed) {
        await runCleanup();
      }

      expect(existsSync(tempFile)).toBe(false);
    });

    it('should cleanup on agent file not found error', async () => {
      const lockPath = join(testDir, '.speci-lock');
      writeFileSync(lockPath, 'test-lock');

      registerCleanup(() => {
        if (existsSync(lockPath)) rmSync(lockPath);
      });

      // Simulate agent not found error
      const agentExists = false;
      if (!agentExists) {
        await runCleanup();
      }

      expect(existsSync(lockPath)).toBe(false);
    });

    it('should cleanup on config validation failure', async () => {
      const tempFiles = [
        join(testDir, 'temp1.txt'),
        join(testDir, 'temp2.txt'),
      ];

      tempFiles.forEach((file) => writeFileSync(file, 'temp'));

      tempFiles.forEach((file) => {
        registerCleanup(() => {
          if (existsSync(file)) rmSync(file);
        });
      });

      // Simulate config validation failure
      const configValid = false;
      if (!configValid) {
        await runCleanup();
      }

      tempFiles.forEach((file) => {
        expect(existsSync(file)).toBe(false);
      });
    });
  });

  describe('Cleanup Handler Errors', () => {
    it('should log errors but continue cleanup', async () => {
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const tempFile = join(testDir, 'continue-cleanup.txt');
      writeFileSync(tempFile, 'temp');

      // Register failing cleanup
      registerCleanup(() => {
        throw new Error('Intentional error');
      });

      // Register successful cleanup
      registerCleanup(() => {
        if (existsSync(tempFile)) rmSync(tempFile);
      });

      await runCleanup();

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Cleanup error:',
        expect.any(Error)
      );
      expect(existsSync(tempFile)).toBe(false);

      mockConsoleError.mockRestore();
    });

    it('should handle multiple failing cleanup handlers', async () => {
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      registerCleanup(() => {
        throw new Error('Error 1');
      });
      registerCleanup(() => {
        throw new Error('Error 2');
      });
      registerCleanup(() => {
        throw new Error('Error 3');
      });

      await runCleanup();

      expect(mockConsoleError).toHaveBeenCalledTimes(3);

      mockConsoleError.mockRestore();
    });
  });

  describe('Cleanup State Reset', () => {
    it('should allow cleanup to run again after state reset', async () => {
      const cleanupLog: string[] = [];

      registerCleanup(() => {
        cleanupLog.push('first-run');
      });

      await runCleanup();

      expect(cleanupLog).toEqual(['first-run']);

      // Reset state
      resetCleanupState();

      // Register new cleanup and run again
      registerCleanup(() => {
        cleanupLog.push('second-run');
      });

      await runCleanup();

      expect(cleanupLog).toEqual(['first-run', 'second-run']);
    });
  });
});
