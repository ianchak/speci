/**
 * Lock File Management Tests
 *
 * Tests for lib/utils/lock.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  acquireLock,
  releaseLock,
  isLocked,
  getLockInfo,
} from '../lib/utils/lock.js';
import type { SpeciConfig } from '../lib/config.js';

// Test config with temporary lock path
const testDir = join(process.cwd(), '.test-lock');
const testLockPath = join(testDir, '.speci-lock');

const mockConfig: SpeciConfig = {
  version: '1.0.0',
  paths: {
    progress: 'docs/PROGRESS.md',
    tasks: 'docs/tasks',
    logs: '.speci/logs',
    lock: testLockPath,
  },
  agents: {
    plan: null,
    task: null,
    refactor: null,
    impl: null,
    review: null,
    fix: null,
    tidy: null,
  },
  copilot: {
    permissions: 'allow-all',
    model: null,
    models: {
      plan: null,
      task: null,
      refactor: null,
      impl: null,
      review: null,
      fix: null,
      tidy: null,
    },
    extraFlags: [],
  },
  gate: {
    commands: ['npm test'],
    maxFixAttempts: 3,
  },
  loop: {
    maxIterations: 100,
  },
};

describe('Lock File Management', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testLockPath)) {
      unlinkSync(testLockPath);
    }
    if (existsSync(testDir)) {
      rmdirSync(testDir);
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(testLockPath)) {
      unlinkSync(testLockPath);
    }
    if (existsSync(testDir)) {
      rmdirSync(testDir);
    }
  });

  describe('acquireLock()', () => {
    it('creates lock file with correct format', async () => {
      await acquireLock(mockConfig);

      expect(existsSync(testLockPath)).toBe(true);

      const content = readFileSync(testLockPath, 'utf8');
      expect(content).toMatch(
        /^Started: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\nPID: \d+$/
      );
    });

    it('throws error if lock already exists', async () => {
      await acquireLock(mockConfig);

      await expect(acquireLock(mockConfig)).rejects.toThrow(
        /Another speci instance is running/
      );
    });

    it('creates parent directories if needed', async () => {
      expect(existsSync(testDir)).toBe(false);

      await acquireLock(mockConfig);

      expect(existsSync(testDir)).toBe(true);
      expect(existsSync(testLockPath)).toBe(true);
    });

    it('uses atomic write pattern (temp file + rename)', async () => {
      const tempPath = `${testLockPath}.tmp`;

      await acquireLock(mockConfig);

      // Temp file should not exist after successful lock
      expect(existsSync(tempPath)).toBe(false);
      expect(existsSync(testLockPath)).toBe(true);
    });

    it('contains correct PID in lock file', async () => {
      await acquireLock(mockConfig);

      const content = readFileSync(testLockPath, 'utf8');
      const pidMatch = content.match(/PID: (\d+)/);
      expect(pidMatch).toBeTruthy();

      const lockPid = parseInt(pidMatch![1], 10);
      expect(lockPid).toBe(process.pid);
    });

    it('contains valid timestamp in lock file', async () => {
      const beforeTime = new Date();
      await acquireLock(mockConfig);
      const afterTime = new Date();

      const content = readFileSync(testLockPath, 'utf8');
      const timestampMatch = content.match(
        /Started: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/
      );
      expect(timestampMatch).toBeTruthy();

      const timestampStr = timestampMatch![1];
      const lockTime = parseTimestamp(timestampStr);

      expect(lockTime).toBeTruthy();
      expect(lockTime!.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime() - 1000
      );
      expect(lockTime!.getTime()).toBeLessThanOrEqual(
        afterTime.getTime() + 1000
      );
    });
  });

  describe('releaseLock()', () => {
    it('deletes lock file', async () => {
      await acquireLock(mockConfig);
      expect(existsSync(testLockPath)).toBe(true);

      await releaseLock(mockConfig);

      expect(existsSync(testLockPath)).toBe(false);
    });

    it('succeeds silently if lock file does not exist', async () => {
      expect(existsSync(testLockPath)).toBe(false);

      await expect(releaseLock(mockConfig)).resolves.toBeUndefined();
    });
  });

  describe('isLocked()', () => {
    it('returns true when lock file exists', async () => {
      await acquireLock(mockConfig);

      const locked = await isLocked(mockConfig);

      expect(locked).toBe(true);
    });

    it('returns false when lock file does not exist', async () => {
      const locked = await isLocked(mockConfig);

      expect(locked).toBe(false);
    });
  });

  describe('getLockInfo()', () => {
    it('returns locked: false when no lock file exists', async () => {
      const info = await getLockInfo(mockConfig);

      expect(info).toEqual({
        isLocked: false,
        started: null,
        pid: null,
        elapsed: null,
      });
    });

    it('parses timestamp correctly from lock file', async () => {
      await acquireLock(mockConfig);

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.started).toBeInstanceOf(Date);
      expect(info.started!.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('parses PID correctly from lock file', async () => {
      await acquireLock(mockConfig);

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.pid).toBe(process.pid);
    });

    it('calculates elapsed time in HH:MM:SS format', async () => {
      await acquireLock(mockConfig);

      // Wait a bit to have some elapsed time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.elapsed).toMatch(/^\d{2}:\d{2}:\d{2}$/);

      // Should show at least 1 second elapsed
      const parts = info.elapsed!.split(':').map(Number);
      const totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      expect(totalSeconds).toBeGreaterThanOrEqual(1);
    });

    it('handles malformed lock file gracefully', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testLockPath, 'Invalid content\nNo proper format', 'utf8');

      const info = await getLockInfo(mockConfig);

      // Should report as locked but with null fields
      expect(info.isLocked).toBe(true);
      expect(info.started).toBeNull();
      expect(info.pid).toBeNull();
      expect(info.elapsed).toBeNull();
    });

    it('handles empty lock file', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testLockPath, '', 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.started).toBeNull();
      expect(info.pid).toBeNull();
      expect(info.elapsed).toBeNull();
    });

    it('handles lock file with invalid PID', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        testLockPath,
        'Started: 2026-02-04 10:00:00\nPID: not-a-number',
        'utf8'
      );

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.pid).toBeNull();
    });

    it('handles lock file with invalid timestamp', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testLockPath, 'Started: invalid-date\nPID: 12345', 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.started).toBeNull();
      expect(info.pid).toBe(12345);
      expect(info.elapsed).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles zero-second elapsed time', async () => {
      await acquireLock(mockConfig);

      const info = await getLockInfo(mockConfig);

      expect(info.elapsed).toMatch(/^00:00:0\d$/);
    });

    it('handles multiple lock/release cycles', async () => {
      for (let i = 0; i < 3; i++) {
        await acquireLock(mockConfig);
        expect(existsSync(testLockPath)).toBe(true);

        await releaseLock(mockConfig);
        expect(existsSync(testLockPath)).toBe(false);
      }
    });

    it('lock error message includes PID and elapsed time', async () => {
      await acquireLock(mockConfig);

      try {
        await acquireLock(mockConfig);
        expect.fail('Should have thrown an error');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain(`PID: ${process.pid}`);
        expect(message).toMatch(/started: \d{2}:\d{2}:\d{2} ago/);
      }
    });
  });

  describe('Race Conditions', () => {
    it('allows only one concurrent lock acquisition', async () => {
      // Trigger three simultaneous lock attempts
      const results = await Promise.allSettled([
        acquireLock(mockConfig),
        acquireLock(mockConfig),
        acquireLock(mockConfig),
      ]);

      // Exactly one should succeed, two should fail
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(2);

      // Both failures should have proper error messages
      failures.forEach((failure) => {
        if (failure.status === 'rejected') {
          expect(failure.reason.message).toMatch(
            /Another speci instance is running/
          );
        }
      });
    });

    it('handles lock release during concurrent acquisition attempts', async () => {
      // First, acquire the lock
      await acquireLock(mockConfig);

      // Start multiple acquisition attempts that will fail
      const acquisitionPromises = [
        acquireLock(mockConfig).catch((err) => err),
        acquireLock(mockConfig).catch((err) => err),
      ];

      // Release the lock while attempts are pending
      await releaseLock(mockConfig);

      // All attempts should still fail since lock existed when they checked
      const results = await Promise.all(acquisitionPromises);

      results.forEach((result) => {
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(
          /Another speci instance is running/
        );
      });
    });

    it('handles concurrent lock and isLocked checks', async () => {
      // Run lock acquisition and isLocked checks concurrently
      const [lockResult, ...checkResults] = await Promise.all([
        acquireLock(mockConfig),
        isLocked(mockConfig),
        isLocked(mockConfig),
        isLocked(mockConfig),
      ]);

      // Lock should succeed
      expect(lockResult).toBeUndefined();

      // isLocked checks should either see locked or unlocked state
      // (timing dependent but all should return boolean)
      checkResults.forEach((result) => {
        expect(typeof result).toBe('boolean');
      });

      // After all operations, lock should definitely be acquired
      const finalCheck = await isLocked(mockConfig);
      expect(finalCheck).toBe(true);
    });

    it('handles concurrent getLockInfo calls', async () => {
      await acquireLock(mockConfig);

      // Trigger multiple simultaneous getLockInfo calls
      const results = await Promise.all([
        getLockInfo(mockConfig),
        getLockInfo(mockConfig),
        getLockInfo(mockConfig),
        getLockInfo(mockConfig),
      ]);

      // All results should be consistent
      results.forEach((info) => {
        expect(info.isLocked).toBe(true);
        expect(info.pid).toBe(process.pid);
        expect(info.started).toBeInstanceOf(Date);
        expect(info.elapsed).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      });

      // All timestamps should be very close (within 1 second)
      const timestamps = results.map((r) => r.started?.getTime() ?? 0);
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      expect(maxTime - minTime).toBeLessThan(1000);
    });

    it('handles rapid lock/release cycles', async () => {
      // Perform 10 rapid lock/release cycles
      for (let i = 0; i < 10; i++) {
        await acquireLock(mockConfig);
        await releaseLock(mockConfig);
      }

      // Lock should be released at the end
      const isLockPresent = await isLocked(mockConfig);
      expect(isLockPresent).toBe(false);
    });

    it('prevents race condition in concurrent acquisition with staggered timing', async () => {
      // Stagger lock attempts slightly to test different timing scenarios
      const results = await Promise.allSettled([
        acquireLock(mockConfig),
        new Promise((resolve) => setTimeout(resolve, 10)).then(() =>
          acquireLock(mockConfig)
        ),
        new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
          acquireLock(mockConfig)
        ),
      ]);

      // First should succeed, others should fail
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('rejected');
    });
  });
});

// Helper function to parse timestamp (same as in implementation)
function parseTimestamp(str: string): Date | null {
  const match = str.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, min, sec] = match.map(Number);
  return new Date(year, month - 1, day, hour, min, sec);
}
