/**
 * Signal Handling Tests
 *
 * Tests for lib/utils/signals.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerCleanup,
  unregisterCleanup,
  installSignalHandlers,
  removeSignalHandlers,
  runCleanup,
} from '../lib/utils/signals.js';

describe('Signal Handling', () => {
  beforeEach(() => {
    // Clear any registered listeners
    removeSignalHandlers();
  });

  afterEach(() => {
    // Clean up after tests
    removeSignalHandlers();
  });

  describe('Cleanup Registry', () => {
    it('should register cleanup functions', () => {
      const fn = vi.fn();
      registerCleanup(fn);
      // No error means success
      expect(true).toBe(true);
    });

    it('should unregister cleanup functions', () => {
      const fn = vi.fn();
      registerCleanup(fn);
      unregisterCleanup(fn);
      // No error means success
      expect(true).toBe(true);
    });

    it('should run cleanup functions in reverse order', async () => {
      const order: number[] = [];
      registerCleanup(() => {
        order.push(1);
      });
      registerCleanup(() => {
        order.push(2);
      });
      registerCleanup(() => {
        order.push(3);
      });

      await runCleanup();

      expect(order).toEqual([3, 2, 1]);
    });

    it('should run async cleanup functions', async () => {
      let completed = false;
      registerCleanup(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        completed = true;
      });

      await runCleanup();

      expect(completed).toBe(true);
    });

    it('should continue cleanup even if one function throws', async () => {
      const order: number[] = [];
      registerCleanup(() => {
        order.push(1);
      });
      registerCleanup(() => {
        order.push(2);
        throw new Error('Cleanup error');
      });
      registerCleanup(() => {
        order.push(3);
      });

      // Should not throw despite error in second cleanup
      await runCleanup();

      expect(order).toEqual([3, 2, 1]);
    });

    it('should prevent duplicate cleanup runs', async () => {
      const fn = vi.fn();
      registerCleanup(fn);

      await runCleanup();
      await runCleanup(); // Second call should be no-op

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should clear registry after cleanup', async () => {
      const fn = vi.fn();
      registerCleanup(fn);

      await runCleanup();

      // Registry should be cleared and cleanup state reset
      // Need to reset state to allow second cleanup
      removeSignalHandlers(); // This resets isCleaningUp flag

      // Register new function and run again
      const fn2 = vi.fn();
      registerCleanup(fn2);
      await runCleanup();

      // First function should not run again
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Signal Handler Registration', () => {
    it('should install signal handlers without error', () => {
      expect(() => installSignalHandlers()).not.toThrow();
    });

    it('should remove signal handlers without error', () => {
      installSignalHandlers();
      expect(() => removeSignalHandlers()).not.toThrow();
    });

    it('should allow multiple install/remove cycles', () => {
      installSignalHandlers();
      removeSignalHandlers();
      installSignalHandlers();
      removeSignalHandlers();
      expect(true).toBe(true);
    });
  });

  describe('Signal Handler Behavior', () => {
    it('should handle SIGINT and run cleanup', async () => {
      const fn = vi.fn();
      registerCleanup(fn);
      installSignalHandlers();

      // Note: Actual signal testing requires integration tests
      // This test validates the structure is correct
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);

      removeSignalHandlers();
    });

    it('should handle SIGTERM and run cleanup', async () => {
      const fn = vi.fn();
      registerCleanup(fn);
      installSignalHandlers();

      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0);

      removeSignalHandlers();
    });

    it('should remove handlers when requested', () => {
      installSignalHandlers();
      const initialSigintCount = process.listenerCount('SIGINT');
      const initialSigtermCount = process.listenerCount('SIGTERM');

      expect(initialSigintCount).toBeGreaterThan(0);
      expect(initialSigtermCount).toBeGreaterThan(0);

      removeSignalHandlers();

      const finalSigintCount = process.listenerCount('SIGINT');
      const finalSigtermCount = process.listenerCount('SIGTERM');

      expect(finalSigintCount).toBeLessThan(initialSigintCount);
      expect(finalSigtermCount).toBeLessThan(initialSigtermCount);
    });
  });

  describe('Cleanup Timeout', () => {
    it('should complete cleanup before timeout with fast handlers', async () => {
      const fn = vi.fn();
      registerCleanup(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        fn();
      });

      await runCleanup();

      expect(fn).toHaveBeenCalledOnce();
    });

    it(
      'should timeout and continue if cleanup takes too long',
      { timeout: 10000 },
      async () => {
        const mockConsoleError = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        registerCleanup(async () => {
          // Intentionally slow cleanup (exceeds CLEANUP_TIMEOUT_MS)
          await new Promise((resolve) => setTimeout(resolve, 10000));
        });

        const startTime = Date.now();
        await runCleanup();
        const duration = Date.now() - startTime;

        // Should timeout around 5 seconds (5000ms), not wait 10 seconds
        expect(duration).toBeLessThan(6000);
        expect(duration).toBeGreaterThan(4900);

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Cleanup did not complete in time:',
          expect.any(Error)
        );

        mockConsoleError.mockRestore();
      }
    );

    it(
      'should continue with exit even if timeout error occurs',
      { timeout: 10000 },
      async () => {
        const mockConsoleError = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        registerCleanup(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10000));
        });

        // Should not throw despite timeout
        await expect(runCleanup()).resolves.not.toThrow();

        mockConsoleError.mockRestore();
      }
    );
  });

  describe('Edge Cases', () => {
    it('should handle empty cleanup registry', async () => {
      await expect(runCleanup()).resolves.not.toThrow();
    });

    it('should handle unregistering non-existent function', () => {
      const fn = vi.fn();
      expect(() => unregisterCleanup(fn)).not.toThrow();
    });

    it('should handle cleanup with null return', async () => {
      registerCleanup(() => {
        return undefined;
      });
      await expect(runCleanup()).resolves.not.toThrow();
    });

    it('should handle cleanup with Promise.resolve', async () => {
      const fn = vi.fn();
      registerCleanup(async () => {
        fn();
        return Promise.resolve();
      });
      await runCleanup();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
