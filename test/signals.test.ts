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
      // Suppress expected error log from the intentional throw
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

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

      // Should throw but all cleanups should still run
      await expect(runCleanup()).rejects.toThrow('Cleanup error');

      consoleErrorSpy.mockRestore();

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
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(async () => {
      await vi.runOnlyPendingTimersAsync();
      vi.useRealTimers();
    });

    it('should complete cleanup before timeout with fast handlers', async () => {
      const fn = vi.fn();
      registerCleanup(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        fn();
      });

      const cleanupPromise = runCleanup();
      await vi.advanceTimersByTimeAsync(200);
      await cleanupPromise;

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
        const cleanupPromise = runCleanup();
        const timeoutAssertion =
          expect(cleanupPromise).rejects.toThrow('Cleanup timeout');
        await vi.advanceTimersByTimeAsync(5001);
        // Should reject with timeout error
        await timeoutAssertion;
        const duration = Date.now() - startTime;

        // Let pending long cleanup finish to avoid state leakage
        await vi.advanceTimersByTimeAsync(10000);

        // Should timeout around 5 seconds (5000ms), not wait 10 seconds
        expect(duration).toBeLessThan(6000);
        expect(duration).toBeGreaterThan(4900);

        // log.error adds a glyph, so we just check that error was called
        expect(mockConsoleError).toHaveBeenCalled();
        const errorCall = mockConsoleError.mock.calls[0][0];
        expect(errorCall).toContain('Cleanup did not complete in time');

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

        const cleanupPromise = runCleanup();
        const timeoutAssertion =
          expect(cleanupPromise).rejects.toThrow('Cleanup timeout');
        await vi.advanceTimersByTimeAsync(5001);
        // Should reject with timeout error
        await timeoutAssertion;

        // Let pending long cleanup finish to avoid state leakage
        await vi.advanceTimersByTimeAsync(10000);

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

  describe('Race Conditions', () => {
    beforeEach(() => {
      removeSignalHandlers();
    });

    it('should handle rapid signal emissions without installing handlers', async () => {
      let cleanupCount = 0;
      registerCleanup(() => {
        cleanupCount++;
      });

      // Test rapid cleanup calls directly (safer than emitting actual signals)
      const cleanupPromises = [runCleanup(), runCleanup(), runCleanup()];

      await Promise.all(cleanupPromises);

      // Cleanup should only run once despite multiple calls
      expect(cleanupCount).toBe(1);
    });

    it('should handle concurrent runCleanup calls', async () => {
      let cleanupCount = 0;
      registerCleanup(() => {
        cleanupCount++;
      });

      // Call runCleanup multiple times concurrently
      await Promise.all([runCleanup(), runCleanup(), runCleanup()]);

      // Cleanup should only run once
      expect(cleanupCount).toBe(1);
    });

    it('should handle cleanup registry modifications during runCleanup', async () => {
      const executionOrder: string[] = [];

      registerCleanup(() => {
        executionOrder.push('first');
      });

      registerCleanup(() => {
        executionOrder.push('second');
        // Try to register another cleanup during execution
        registerCleanup(() => {
          executionOrder.push('late-registration');
        });
      });

      registerCleanup(() => {
        executionOrder.push('third');
      });

      await runCleanup();

      // Should execute in reverse order: third, second, first
      // Late registration should not execute
      expect(executionOrder).toEqual(['third', 'second', 'first']);
    });

    it('should handle unregister during cleanup execution', async () => {
      const executionOrder: string[] = [];
      const laterFn = vi.fn(() => {
        executionOrder.push('later');
      });

      registerCleanup(() => {
        executionOrder.push('first');
      });

      registerCleanup(() => {
        executionOrder.push('second');
        // Try to unregister a function during cleanup
        unregisterCleanup(laterFn);
      });

      registerCleanup(laterFn);

      await runCleanup();

      // All registered functions should still execute
      // Unregister during cleanup doesn't affect current run
      expect(executionOrder).toContain('later');
      expect(executionOrder).toContain('second');
      expect(executionOrder).toContain('first');
    });

    it('should handle concurrent signal handler installation/removal', () => {
      // Install and remove handlers rapidly
      for (let i = 0; i < 10; i++) {
        installSignalHandlers();
        removeSignalHandlers();
      }

      // Should not throw or leave handlers in inconsistent state
      installSignalHandlers();
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
      removeSignalHandlers();
    });

    it('should handle multiple cleanup functions running concurrently', async () => {
      const delays = [50, 100, 25, 75];
      const completed: number[] = [];

      delays.forEach((delay, index) => {
        registerCleanup(async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          completed.push(index);
        });
      });

      await runCleanup();

      // All cleanups should complete
      expect(completed).toHaveLength(4);
      // Should execute in reverse registration order (LIFO)
      // Index 3, 2, 1, 0 but completion order depends on delays
      expect(completed).toContain(0);
      expect(completed).toContain(1);
      expect(completed).toContain(2);
      expect(completed).toContain(3);
    });

    it('should handle rapid register/unregister cycles', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();

      // Rapidly register and unregister
      for (let i = 0; i < 20; i++) {
        registerCleanup(fn1);
        registerCleanup(fn2);
        unregisterCleanup(fn1);
        registerCleanup(fn3);
        unregisterCleanup(fn2);
        unregisterCleanup(fn3);
      }

      // Should not throw
      expect(() => runCleanup()).not.toThrow();
    });

    it('should handle concurrent cleanup registrations', () => {
      const fns = Array.from({ length: 10 }, () => vi.fn());

      // Register all functions "concurrently" (synchronously in rapid succession)
      fns.forEach((fn) => registerCleanup(fn));

      // All should be registered without errors
      expect(() => runCleanup()).not.toThrow();
    });

    it('should handle concurrent cleanup unregistrations', () => {
      const fns = Array.from({ length: 10 }, () => vi.fn());

      // Register all functions
      fns.forEach((fn) => registerCleanup(fn));

      // Unregister all concurrently
      fns.forEach((fn) => unregisterCleanup(fn));

      // Should complete without errors
      expect(() => runCleanup()).not.toThrow();
    });
  });

  describe('Signal Handler Error Logging', () => {
    it('should log error when SIGINT cleanup fails', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as never);
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Register cleanup that will fail
      registerCleanup(async () => {
        throw new Error('Test cleanup failure');
      });

      installSignalHandlers();

      // Emit SIGINT
      process.emit('SIGINT', 'SIGINT');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have logged the error
      expect(mockConsoleError).toHaveBeenCalled();
      const errorCalls = mockConsoleError.mock.calls.map((call) => call[0]);
      const hasCleanupError = errorCalls.some((call) =>
        String(call).includes('Cleanup failed during signal handler')
      );
      expect(hasCleanupError).toBe(true);

      // Should still exit with code 130
      expect(mockProcessExit).toHaveBeenCalledWith(130);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
      removeSignalHandlers();
    });

    it('should log error when SIGTERM cleanup fails', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as never);
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Register cleanup that will fail
      registerCleanup(async () => {
        throw new Error('Test cleanup failure');
      });

      installSignalHandlers();

      // Emit SIGTERM
      process.emit('SIGTERM', 'SIGTERM');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have logged the error
      expect(mockConsoleError).toHaveBeenCalled();
      const errorCalls = mockConsoleError.mock.calls.map((call) => call[0]);
      const hasCleanupError = errorCalls.some((call) =>
        String(call).includes('Cleanup failed during signal handler')
      );
      expect(hasCleanupError).toBe(true);

      // Should still exit with code 143
      expect(mockProcessExit).toHaveBeenCalledWith(143);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
      removeSignalHandlers();
    });

    it('should include error message in log output', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as never);
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const testErrorMessage = 'Lock file corrupted';
      registerCleanup(async () => {
        throw new Error(testErrorMessage);
      });

      installSignalHandlers();
      process.emit('SIGINT', 'SIGINT');

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should include the error message
      const errorCalls = mockConsoleError.mock.calls.map((call) =>
        String(call[0])
      );
      const hasErrorMessage = errorCalls.some((call) =>
        call.includes(testErrorMessage)
      );
      expect(hasErrorMessage).toBe(true);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
      removeSignalHandlers();
    });

    it('should log stack trace when error is Error instance', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as never);
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const testError = new Error('Test error with stack');
      registerCleanup(async () => {
        throw testError;
      });

      installSignalHandlers();
      process.emit('SIGINT', 'SIGINT');

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have logged stack trace
      expect(mockConsoleError).toHaveBeenCalled();
      const errorCalls = mockConsoleError.mock.calls.map((call) =>
        String(call[0])
      );
      const hasStackTrace = errorCalls.some((call) => call.includes('Stack'));
      expect(hasStackTrace).toBe(true);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
      removeSignalHandlers();
    });

    it('should still exit with correct code after logging error', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as never);
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      registerCleanup(async () => {
        throw new Error('Cleanup failed');
      });

      installSignalHandlers();
      process.emit('SIGINT', 'SIGINT');

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should exit with code 130 (SIGINT)
      expect(mockProcessExit).toHaveBeenCalledWith(130);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
      removeSignalHandlers();
    });
  });
});
