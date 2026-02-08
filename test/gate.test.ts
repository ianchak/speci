/**
 * Gate Runner Unit Tests
 *
 * Tests for gate command execution and result tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeGateCommand,
  runGate,
  resetGateAttempts,
  incrementGateAttempt,
  getGateAttempt,
  canRetryGate,
} from '../lib/utils/gate.js';
import type { SpeciConfig } from '../lib/config.js';

describe('Gate Runner', () => {
  describe('executeGateCommand()', () => {
    it('should capture stdout correctly', async () => {
      const result = await executeGateCommand('echo hello');

      expect(result.isSuccess).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('hello');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should capture stderr correctly', async () => {
      // Command that writes to stderr on Windows
      const result = await executeGateCommand(
        'node -e "console.error(\'error message\')"'
      );

      expect(result.isSuccess).toBe(true); // exits with 0
      expect(result.error).toContain('error message');
    });

    it('should return correct exit code for failing command', async () => {
      const result = await executeGateCommand('node -e "process.exit(1)"');

      expect(result.isSuccess).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should measure duration accurately', async () => {
      const startTime = Date.now();
      const result = await executeGateCommand(
        'node -e "setTimeout(() => {}, 100)"'
      );
      const endTime = Date.now();

      expect(result.duration).toBeGreaterThanOrEqual(100);
      expect(result.duration).toBeLessThanOrEqual(endTime - startTime + 50); // Allow 50ms buffer
    });

    it('should handle timeout', async () => {
      const result = await executeGateCommand(
        'node -e "setTimeout(() => {}, 2000)"',
        { timeout: 100 }
      );

      expect(result.isSuccess).toBe(false);
      expect(result.exitCode).toBe(124); // Timeout exit code
      expect(result.error).toContain('timed out');
    });

    it('should handle command not found', async () => {
      const result = await executeGateCommand('nonexistent-command-xyz123');

      expect(result.isSuccess).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
    });
  });

  describe('runGate()', () => {
    const mockConfig: SpeciConfig = {
      version: '1.0.0',
      paths: {
        progress: 'docs/PROGRESS.md',
        tasks: 'docs/tasks',
        logs: 'logs',
        lock: '.speci.lock',
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
        commands: ['echo test1', 'echo test2'],
        maxFixAttempts: 3,
      },
      loop: {
        maxIterations: 10,
      },
    };

    it('should execute all commands', async () => {
      const result = await runGate(mockConfig);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].command).toBe('echo test1');
      expect(result.results[1].command).toBe('echo test2');
    });

    it('should return success when all commands pass', async () => {
      const result = await runGate(mockConfig);

      expect(result.isSuccess).toBe(true);
      expect(result.results.every((r) => r.isSuccess)).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return failure when any command fails', async () => {
      const failConfig: SpeciConfig = {
        ...mockConfig,
        gate: {
          ...mockConfig.gate,
          commands: ['echo test1', 'node -e "process.exit(1)"', 'echo test3'],
        },
      };

      const result = await runGate(failConfig);

      expect(result.isSuccess).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.results).toHaveLength(3);
      expect(result.results[1].isSuccess).toBe(false);
    });

    it('should return success for empty commands array', async () => {
      const emptyConfig: SpeciConfig = {
        ...mockConfig,
        gate: {
          ...mockConfig.gate,
          commands: [],
        },
      };

      const result = await runGate(emptyConfig);

      expect(result.isSuccess).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.totalDuration).toBe(0);
    });

    it('should track total duration', async () => {
      const result = await runGate(mockConfig);

      expect(result.totalDuration).toBeGreaterThan(0);
      expect(result.totalDuration).toBeGreaterThanOrEqual(
        result.results.reduce((sum, r) => sum + r.duration, 0)
      );
    });
  });

  describe('Retry tracking', () => {
    const mockConfig: SpeciConfig = {
      version: '1.0.0',
      paths: {
        progress: 'docs/PROGRESS.md',
        tasks: 'docs/tasks',
        logs: 'logs',
        lock: '.speci.lock',
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
        commands: ['echo test'],
        maxFixAttempts: 3,
      },
      loop: {
        maxIterations: 10,
      },
    };

    beforeEach(() => {
      resetGateAttempts();
    });

    it('should start at zero attempts', () => {
      expect(getGateAttempt()).toBe(0);
    });

    it('should increment attempts correctly', () => {
      incrementGateAttempt();
      expect(getGateAttempt()).toBe(1);

      incrementGateAttempt();
      expect(getGateAttempt()).toBe(2);
    });

    it('should allow retry when under max attempts', () => {
      expect(canRetryGate(mockConfig)).toBe(true);

      incrementGateAttempt();
      expect(canRetryGate(mockConfig)).toBe(true);

      incrementGateAttempt();
      expect(canRetryGate(mockConfig)).toBe(true);
    });

    it('should not allow retry after max attempts', () => {
      incrementGateAttempt();
      incrementGateAttempt();
      incrementGateAttempt();

      expect(getGateAttempt()).toBe(3);
      expect(canRetryGate(mockConfig)).toBe(false);
    });

    it('should reset attempts', () => {
      incrementGateAttempt();
      incrementGateAttempt();
      expect(getGateAttempt()).toBe(2);

      resetGateAttempts();
      expect(getGateAttempt()).toBe(0);
    });
  });

  describe('Race Conditions', () => {
    const mockConfig: SpeciConfig = {
      version: '1.0.0',
      paths: {
        progress: 'docs/PROGRESS.md',
        tasks: 'docs/tasks',
        logs: 'logs',
        lock: '.speci.lock',
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
        commands: ['echo test1', 'echo test2', 'echo test3'],
        maxFixAttempts: 3,
      },
      loop: {
        maxIterations: 10,
      },
    };

    beforeEach(() => {
      resetGateAttempts();
    });

    it('should handle concurrent runGate executions', async () => {
      // Run multiple gate executions concurrently
      const results = await Promise.all([
        runGate(mockConfig),
        runGate(mockConfig),
        runGate(mockConfig),
      ]);

      // All should succeed independently
      results.forEach((result) => {
        expect(result.isSuccess).toBe(true);
        expect(result.results).toHaveLength(3);
      });
    });

    it('should handle concurrent executeGateCommand calls', async () => {
      // Execute multiple commands concurrently
      const results = await Promise.all([
        executeGateCommand('echo concurrent1'),
        executeGateCommand('echo concurrent2'),
        executeGateCommand('echo concurrent3'),
        executeGateCommand('echo concurrent4'),
      ]);

      // All should succeed
      results.forEach((result, index) => {
        expect(result.isSuccess).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.output).toContain(`concurrent${index + 1}`);
      });
    });

    it('should maintain independent state for concurrent runGate calls', async () => {
      const config1: SpeciConfig = {
        ...mockConfig,
        gate: { ...mockConfig.gate, commands: ['echo config1'] },
      };
      const config2: SpeciConfig = {
        ...mockConfig,
        gate: { ...mockConfig.gate, commands: ['echo config2'] },
      };

      // Run with different configs concurrently
      const [result1, result2] = await Promise.all([
        runGate(config1),
        runGate(config2),
      ]);

      expect(result1.results[0].output).toContain('config1');
      expect(result2.results[0].output).toContain('config2');
    });

    it('should handle rapid sequential gate executions', async () => {
      // Execute gates in rapid succession
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(runGate(mockConfig));
      }

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result) => {
        expect(result.isSuccess).toBe(true);
      });
    });

    it('should handle concurrent attempt counter modifications', async () => {
      // Concurrently increment attempt counter
      const increments = Array.from({ length: 10 }, () =>
        Promise.resolve().then(() => incrementGateAttempt())
      );

      await Promise.all(increments);

      // Final count may vary due to race conditions in the counter itself
      // This tests that no errors occur during concurrent access
      const finalCount = getGateAttempt();
      expect(finalCount).toBeGreaterThan(0);
      expect(finalCount).toBeLessThanOrEqual(10);
    });

    it('should handle concurrent canRetryGate checks', async () => {
      // Check retry eligibility concurrently
      const checks = await Promise.all([
        canRetryGate(mockConfig),
        canRetryGate(mockConfig),
        canRetryGate(mockConfig),
        canRetryGate(mockConfig),
      ]);

      // All should return the same result
      const firstResult = checks[0];
      checks.forEach((result) => {
        expect(result).toBe(firstResult);
      });
    });

    it('should not interfere when running gates with different configs concurrently', async () => {
      const fastConfig: SpeciConfig = {
        ...mockConfig,
        gate: { ...mockConfig.gate, commands: ['echo fast'] },
      };
      const slowConfig: SpeciConfig = {
        ...mockConfig,
        gate: {
          ...mockConfig.gate,
          commands: ['node -e "setTimeout(() => console.log(\'slow\'), 100)"'],
        },
      };

      const [fastResult, slowResult] = await Promise.all([
        runGate(fastConfig),
        runGate(slowConfig),
      ]);

      expect(fastResult.isSuccess).toBe(true);
      expect(slowResult.isSuccess).toBe(true);
      expect(fastResult.totalDuration).toBeLessThan(slowResult.totalDuration);
    });
  });
});
