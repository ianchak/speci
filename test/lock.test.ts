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
    models: {
      plan: 'claude-opus-4.6',
      task: 'claude-sonnet-4.5',
      refactor: 'claude-sonnet-4.5',
      impl: 'gpt-5.3-codex',
      review: 'claude-sonnet-4.5',
      fix: 'claude-sonnet-4.5',
      tidy: 'gpt-5.2',
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
    it('creates lock file with JSON format', async () => {
      await acquireLock(mockConfig, undefined, 'test-command');

      expect(existsSync(testLockPath)).toBe(true);

      const content = readFileSync(testLockPath, 'utf8');
      const lockData = JSON.parse(content);

      expect(lockData).toHaveProperty('version');
      expect(lockData).toHaveProperty('pid');
      expect(lockData).toHaveProperty('started');
      expect(lockData).toHaveProperty('command');
      expect(lockData.command).toBe('test-command');
    });

    it('includes all required fields in JSON schema', async () => {
      await acquireLock(mockConfig, undefined, 'run');

      const content = readFileSync(testLockPath, 'utf8');
      const lockData = JSON.parse(content);

      expect(lockData.version).toBe('1.0.0');
      expect(lockData.pid).toBe(process.pid);
      expect(lockData.command).toBe('run');
      expect(lockData.started).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
    });

    it('includes optional metadata when provided', async () => {
      const metadata = {
        iteration: 5,
        taskId: 'TASK_001',
        state: 'IMPL',
      };

      await acquireLock(mockConfig, undefined, 'run', metadata);

      const content = readFileSync(testLockPath, 'utf8');
      const lockData = JSON.parse(content);

      expect(lockData.metadata).toEqual(metadata);
    });

    it('defaults command to "unknown" when not provided', async () => {
      await acquireLock(mockConfig);

      const content = readFileSync(testLockPath, 'utf8');
      const lockData = JSON.parse(content);

      expect(lockData.command).toBe('unknown');
    });

    it('throws error if live lock already exists', async () => {
      await acquireLock(mockConfig, undefined, 'run');

      await expect(acquireLock(mockConfig, undefined, 'run')).rejects.toThrow(
        /Another speci instance is running/
      );
    });

    it('auto-removes stale lock and acquires new lock', async () => {
      // Create a lock with a PID that doesn't exist
      mkdirSync(testDir, { recursive: true });
      const staleLock = {
        version: '1.0.0',
        pid: 999999, // Non-existent PID
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(testLockPath, JSON.stringify(staleLock), 'utf8');

      // Should succeed by removing stale lock
      await expect(
        acquireLock(mockConfig, undefined, 'run')
      ).resolves.toBeUndefined();

      // New lock should have current PID
      const content = readFileSync(testLockPath, 'utf8');
      const lockData = JSON.parse(content);
      expect(lockData.pid).toBe(process.pid);
    });

    it('creates parent directories if needed', async () => {
      expect(existsSync(testDir)).toBe(false);

      await acquireLock(mockConfig, undefined, 'run');

      expect(existsSync(testDir)).toBe(true);
      expect(existsSync(testLockPath)).toBe(true);
    });

    it('uses atomic write pattern (temp file + rename)', async () => {
      const tempPath = `${testLockPath}.tmp`;

      await acquireLock(mockConfig, undefined, 'run');

      // Temp file should not exist after successful lock
      expect(existsSync(tempPath)).toBe(false);
      expect(existsSync(testLockPath)).toBe(true);
    });

    it('contains correct PID in lock file', async () => {
      await acquireLock(mockConfig, undefined, 'run');

      const content = readFileSync(testLockPath, 'utf8');
      const lockData = JSON.parse(content);
      expect(lockData.pid).toBe(process.pid);
    });

    it('contains valid ISO timestamp in lock file', async () => {
      const beforeTime = new Date();
      await acquireLock(mockConfig, undefined, 'run');
      const afterTime = new Date();

      const content = readFileSync(testLockPath, 'utf8');
      const lockData = JSON.parse(content);
      const lockTime = new Date(lockData.started);

      expect(lockTime).toBeInstanceOf(Date);
      expect(lockTime.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime() - 1000
      );
      expect(lockTime.getTime()).toBeLessThanOrEqual(
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
        command: undefined,
        isStale: undefined,
        metadata: undefined,
      });
    });

    it('parses JSON lock file correctly', async () => {
      await acquireLock(mockConfig, undefined, 'run');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.started).toBeInstanceOf(Date);
      expect(info.started!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(info.command).toBe('run');
      expect(info.isStale).toBe(false);
    });

    it('parses PID correctly from JSON lock file', async () => {
      await acquireLock(mockConfig, undefined, 'test');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.pid).toBe(process.pid);
    });

    it('includes metadata from JSON lock file', async () => {
      const metadata = { iteration: 3, taskId: 'TASK_005', state: 'IMPL' };
      await acquireLock(mockConfig, undefined, 'run', metadata);

      const info = await getLockInfo(mockConfig);

      expect(info.metadata).toEqual(metadata);
    });

    it('detects stale lock from dead process', async () => {
      mkdirSync(testDir, { recursive: true });
      const staleLock = {
        version: '1.0.0',
        pid: 999999, // Non-existent PID
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(testLockPath, JSON.stringify(staleLock), 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.isStale).toBe(true);
    });

    it('calculates elapsed time in HH:MM:SS format', async () => {
      await acquireLock(mockConfig, undefined, 'run');

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

    it('handles old text format lock file gracefully (backward compatibility)', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        testLockPath,
        'Started: 2026-02-08 10:00:00\nPID: 12345',
        'utf8'
      );

      const info = await getLockInfo(mockConfig);

      // Should parse old format
      expect(info.isLocked).toBe(true);
      expect(info.started).toBeInstanceOf(Date);
      expect(info.pid).toBe(12345);
      expect(info.command).toBe('unknown'); // Old format doesn't have command
    });

    it('handles malformed JSON lock file gracefully', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testLockPath, '{invalid json}', 'utf8');

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

    it('handles JSON lock file with invalid PID', async () => {
      mkdirSync(testDir, { recursive: true });
      const invalidLock = {
        version: '1.0.0',
        pid: 'not-a-number',
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(testLockPath, JSON.stringify(invalidLock), 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.pid).toBeNull();
    });

    it('handles JSON lock file with invalid timestamp', async () => {
      mkdirSync(testDir, { recursive: true });
      const invalidLock = {
        version: '1.0.0',
        pid: process.pid,
        started: 'invalid-date',
        command: 'run',
      };
      writeFileSync(testLockPath, JSON.stringify(invalidLock), 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.started).toBeNull();
      expect(info.elapsed).toBeNull();
    });

    it('handles JSON lock file with missing required fields', async () => {
      mkdirSync(testDir, { recursive: true });
      const incompleteLock = {
        version: '1.0.0',
        // Missing pid, started, command
      };
      writeFileSync(testLockPath, JSON.stringify(incompleteLock), 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.pid).toBeNull();
      expect(info.started).toBeNull();
    });

    it('handles JSON lock file with negative PID', async () => {
      mkdirSync(testDir, { recursive: true });
      const invalidLock = {
        version: '1.0.0',
        pid: -1,
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(testLockPath, JSON.stringify(invalidLock), 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.pid).toBeNull(); // Invalid PIDs should be treated as null
    });

    it('handles JSON lock file with zero PID', async () => {
      mkdirSync(testDir, { recursive: true });
      const invalidLock = {
        version: '1.0.0',
        pid: 0,
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(testLockPath, JSON.stringify(invalidLock), 'utf8');

      const info = await getLockInfo(mockConfig);

      expect(info.isLocked).toBe(true);
      expect(info.pid).toBeNull(); // Zero PID should be treated as invalid
    });
  });

  describe('Edge Cases', () => {
    it('handles zero-second elapsed time', async () => {
      await acquireLock(mockConfig, undefined, 'run');

      const info = await getLockInfo(mockConfig);

      expect(info.elapsed).toMatch(/^00:00:0\d$/);
    });

    it('handles multiple lock/release cycles', async () => {
      for (let i = 0; i < 3; i++) {
        await acquireLock(mockConfig, undefined, 'run');
        expect(existsSync(testLockPath)).toBe(true);

        await releaseLock(mockConfig);
        expect(existsSync(testLockPath)).toBe(false);
      }
    });

    it('lock error message includes PID and elapsed time', async () => {
      await acquireLock(mockConfig, undefined, 'run');

      try {
        await acquireLock(mockConfig, undefined, 'run');
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
        acquireLock(mockConfig, undefined, 'run'),
        acquireLock(mockConfig, undefined, 'run'),
        acquireLock(mockConfig, undefined, 'run'),
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
      await acquireLock(mockConfig, undefined, 'run');

      // Start multiple acquisition attempts that will fail
      const acquisitionPromises = [
        acquireLock(mockConfig, undefined, 'run').catch((err) => err),
        acquireLock(mockConfig, undefined, 'run').catch((err) => err),
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
        acquireLock(mockConfig, undefined, 'run'),
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
      await acquireLock(mockConfig, undefined, 'run');

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
        await acquireLock(mockConfig, undefined, 'run');
        await releaseLock(mockConfig);
      }

      // Lock should be released at the end
      const isLockPresent = await isLocked(mockConfig);
      expect(isLockPresent).toBe(false);
    });

    it('prevents race condition in concurrent acquisition with staggered timing', async () => {
      // Stagger lock attempts slightly to test different timing scenarios
      const results = await Promise.allSettled([
        acquireLock(mockConfig, undefined, 'run'),
        new Promise((resolve) => setTimeout(resolve, 10)).then(() =>
          acquireLock(mockConfig, undefined, 'run')
        ),
        new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
          acquireLock(mockConfig, undefined, 'run')
        ),
      ]);

      // First should succeed, others should fail
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('rejected');
    });
  });
});
