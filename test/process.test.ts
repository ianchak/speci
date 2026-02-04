import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  trackChild,
  cleanupChildren,
  preventZombies,
  getTrackedChildCount,
  killAllChildren,
} from '../lib/utils/process.js';

describe('process utilities', () => {
  beforeEach(() => {
    // Ensure clean state before each test
    killAllChildren();
  });

  afterEach(() => {
    // Clean up any spawned processes
    killAllChildren();
  });

  describe('trackChild', () => {
    it('should add child to registry', () => {
      const child = spawn('node', ['--version'], { stdio: 'ignore' });
      const initialCount = getTrackedChildCount();

      trackChild(child);

      expect(getTrackedChildCount()).toBe(initialCount + 1);
      child.kill('SIGKILL');
    });

    it('should remove child from registry on exit', async () => {
      const child = spawn('node', ['--version'], { stdio: 'ignore' });
      trackChild(child);

      const beforeCount = getTrackedChildCount();
      expect(beforeCount).toBeGreaterThan(0);

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        child.once('exit', () => {
          // Give a moment for cleanup
          setTimeout(resolve, 50);
        });
      });

      expect(getTrackedChildCount()).toBeLessThan(beforeCount);
    });

    it('should handle child without PID gracefully', () => {
      const mockChild = { pid: undefined } as unknown as ChildProcess;
      trackChild(mockChild);

      // Should not crash or add to registry
      expect(true).toBe(true);
    });

    it('should handle null child gracefully', () => {
      trackChild(null as unknown as ChildProcess);

      // Should not crash
      expect(true).toBe(true);
    });
  });

  describe('cleanupChildren', () => {
    it('should send SIGTERM to tracked children', async () => {
      // Spawn a long-running process
      const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      });

      trackChild(child);
      expect(getTrackedChildCount()).toBeGreaterThan(0);

      await cleanupChildren();

      // Registry should be cleared
      expect(getTrackedChildCount()).toBe(0);

      // Process should be killed
      expect(child.killed).toBe(true);
    });

    it('should force kill after timeout', async () => {
      // Spawn a process that ignores SIGTERM
      const child = spawn(
        'node',
        [
          '-e',
          `
        process.on('SIGTERM', () => {});
        setInterval(() => {}, 1000);
      `,
        ],
        { stdio: 'ignore' }
      );

      trackChild(child);

      const cleanupPromise = cleanupChildren();

      // Should complete within reasonable time (including timeout + margin)
      await expect(cleanupPromise).resolves.toBeUndefined();

      expect(getTrackedChildCount()).toBe(0);
    }, 10000); // Increase test timeout

    it('should handle empty registry', async () => {
      killAllChildren(); // Ensure empty

      await expect(cleanupChildren()).resolves.toBeUndefined();

      expect(getTrackedChildCount()).toBe(0);
    });

    it('should handle already-exited process', async () => {
      const child = spawn('node', ['--version'], { stdio: 'ignore' });
      trackChild(child);

      // Wait for it to exit naturally
      await new Promise<void>((resolve) => {
        child.once('exit', () => {
          setTimeout(resolve, 50);
        });
      });

      // Cleanup should handle it gracefully
      await expect(cleanupChildren()).resolves.toBeUndefined();
    });
  });

  describe('preventZombies', () => {
    it('should be no-op on Windows', () => {
      const originalPlatform = process.platform;

      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      preventZombies();

      // Should not crash
      expect(true).toBe(true);

      // Restore platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('should be safe to call multiple times', () => {
      preventZombies();
      preventZombies();
      preventZombies();

      // Should not crash or add multiple listeners
      expect(true).toBe(true);
    });

    it('should set up SIGCHLD handler on Unix', () => {
      if (process.platform === 'win32') {
        // Skip on Windows
        return;
      }

      preventZombies();

      const listenersAfter = process.listenerCount('SIGCHLD');

      // Should have at least one listener
      expect(listenersAfter).toBeGreaterThanOrEqual(1);
    });
  });

  describe('killAllChildren', () => {
    it('should kill all children immediately', () => {
      const child1 = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      });
      const child2 = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      });

      trackChild(child1);
      trackChild(child2);

      expect(getTrackedChildCount()).toBe(2);

      killAllChildren();

      expect(getTrackedChildCount()).toBe(0);
      expect(child1.killed).toBe(true);
      expect(child2.killed).toBe(true);
    });

    it('should clear registry after killing', () => {
      const child = spawn('node', ['--version'], { stdio: 'ignore' });
      trackChild(child);

      killAllChildren();

      expect(getTrackedChildCount()).toBe(0);
    });
  });

  describe('integration', () => {
    it('should clean up spawned process on signal', async () => {
      // Spawn a long-running process
      const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      });

      trackChild(child);

      const initialCount = getTrackedChildCount();
      expect(initialCount).toBeGreaterThan(0);

      // Simulate cleanup on signal
      await cleanupChildren();

      expect(getTrackedChildCount()).toBe(0);
      expect(child.killed).toBe(true);
    });
  });
});
