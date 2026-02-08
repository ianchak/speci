/**
 * Gate Runner Unit Tests
 *
 * Tests for gate command execution and result tracking.
 */

import { describe, it, expect } from 'vitest';
import {
  executeGateCommand,
  runGate,
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
      if (result.isSuccess) {
        // Success case doesn't have error property
        expect('error' in result).toBe(false);
      }
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
      if (!result.isSuccess) {
        expect(result.error).toBeDefined();
      }
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

  describe('Retry logic', () => {
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

    it('should allow retry when under max attempts', () => {
      expect(canRetryGate(mockConfig, 0)).toBe(true);
      expect(canRetryGate(mockConfig, 1)).toBe(true);
      expect(canRetryGate(mockConfig, 2)).toBe(true);
    });

    it('should not allow retry after max attempts', () => {
      expect(canRetryGate(mockConfig, 3)).toBe(false);
      expect(canRetryGate(mockConfig, 4)).toBe(false);
    });

    it('should handle zero max attempts', () => {
      const zeroConfig: SpeciConfig = {
        ...mockConfig,
        gate: { ...mockConfig.gate, maxFixAttempts: 0 },
      };
      expect(canRetryGate(zeroConfig, 0)).toBe(false);
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

    it('should handle concurrent canRetryGate checks with different attempt counts', async () => {
      // Check retry eligibility concurrently with different attempt counts
      const checks = await Promise.all([
        canRetryGate(mockConfig, 0),
        canRetryGate(mockConfig, 1),
        canRetryGate(mockConfig, 2),
        canRetryGate(mockConfig, 3),
      ]);

      // Should return correct results for each attempt count
      expect(checks[0]).toBe(true);
      expect(checks[1]).toBe(true);
      expect(checks[2]).toBe(true);
      expect(checks[3]).toBe(false);
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

  describe('Parallel Execution Strategy', () => {
    const baseConfig: SpeciConfig = {
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

    it('should execute all commands in parallel mode - all pass', async () => {
      const parallelConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          ...baseConfig.gate,
          commands: [
            'node -e "setTimeout(() => console.log(\'cmd1\'), 100)"',
            'node -e "setTimeout(() => console.log(\'cmd2\'), 100)"',
            'node -e "setTimeout(() => console.log(\'cmd3\'), 100)"',
          ],
          strategy: 'parallel',
        },
      };

      const startTime = Date.now();
      const result = await runGate(parallelConfig);
      const endTime = Date.now();

      expect(result.isSuccess).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results.every((r) => r.isSuccess)).toBe(true);

      // Parallel execution should be faster than sequential
      // Sequential would be ~300ms (3 x 100ms), parallel should be ~100ms
      expect(endTime - startTime).toBeLessThan(250);
    });

    it('should execute all commands in parallel mode - one failure', async () => {
      const parallelConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          ...baseConfig.gate,
          commands: ['echo test1', 'node -e "process.exit(1)"', 'echo test3'],
          strategy: 'parallel',
        },
      };

      const result = await runGate(parallelConfig);

      expect(result.isSuccess).toBe(false);
      expect(result.results).toHaveLength(3);
      // All commands should have executed despite the failure
      expect(result.results[0].isSuccess).toBe(true);
      expect(result.results[1].isSuccess).toBe(false);
      expect(result.results[2].isSuccess).toBe(true);

      if (!result.isSuccess) {
        expect(result.error).toBeDefined();
      }
    });

    it('should execute all commands in parallel mode - multiple failures', async () => {
      const parallelConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          ...baseConfig.gate,
          commands: [
            'node -e "process.exit(1)"',
            'echo test2',
            'node -e "process.exit(2)"',
          ],
          strategy: 'parallel',
        },
      };

      const result = await runGate(parallelConfig);

      expect(result.isSuccess).toBe(false);
      expect(result.results).toHaveLength(3);
      // Verify which commands failed
      expect(result.results[0].isSuccess).toBe(false);
      expect(result.results[1].isSuccess).toBe(true);
      expect(result.results[2].isSuccess).toBe(false);

      if (!result.isSuccess) {
        // First failure should be reported
        expect(result.error).toBeDefined();
      }
    });

    it('should default to sequential mode when strategy is undefined', async () => {
      const sequentialConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          ...baseConfig.gate,
          commands: ['echo test1', 'echo test2'],
          // No strategy specified - should default to sequential
        },
      };

      const result = await runGate(sequentialConfig);

      expect(result.isSuccess).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should work with explicit sequential strategy', async () => {
      const sequentialConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          ...baseConfig.gate,
          commands: ['echo test1', 'echo test2'],
          strategy: 'sequential',
        },
      };

      const result = await runGate(sequentialConfig);

      expect(result.isSuccess).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should handle empty commands array in parallel mode', async () => {
      const emptyConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          commands: [],
          maxFixAttempts: 3,
          strategy: 'parallel',
        },
      };

      const result = await runGate(emptyConfig);

      expect(result.isSuccess).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.totalDuration).toBe(0);
    });

    it('should capture output without interleaving in parallel mode', async () => {
      const parallelConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          ...baseConfig.gate,
          commands: ['echo output1', 'echo output2', 'echo output3'],
          strategy: 'parallel',
        },
      };

      const result = await runGate(parallelConfig);

      expect(result.isSuccess).toBe(true);
      expect(result.results).toHaveLength(3);
      // Verify each command's output is captured correctly
      expect(result.results[0].output).toContain('output1');
      expect(result.results[1].output).toContain('output2');
      expect(result.results[2].output).toContain('output3');
      // Verify outputs are not mixed
      expect(result.results[0].output).not.toContain('output2');
      expect(result.results[1].output).not.toContain('output3');
    });

    it('should measure accurate wall-clock time in parallel mode', async () => {
      const parallelConfig: SpeciConfig = {
        ...baseConfig,
        gate: {
          ...baseConfig.gate,
          commands: [
            'node -e "setTimeout(() => {}, 100)"',
            'node -e "setTimeout(() => {}, 100)"',
            'node -e "setTimeout(() => {}, 100)"',
          ],
          strategy: 'parallel',
        },
      };

      const result = await runGate(parallelConfig);

      // Total duration should be ~100ms (parallel), not ~300ms (sequential sum)
      expect(result.totalDuration).toBeGreaterThanOrEqual(100);
      expect(result.totalDuration).toBeLessThan(250);

      // Individual durations should each be ~100ms
      result.results.forEach((r) => {
        expect(r.duration).toBeGreaterThanOrEqual(100);
        expect(r.duration).toBeLessThan(200);
      });
    });
  });

  describe('Discriminated Union Types', () => {
    describe('GateCommandResult', () => {
      it('should not have error property on successful command', async () => {
        const result = await executeGateCommand('echo success');

        if (result.isSuccess) {
          expect(result.exitCode).toBe(0);
          // Error field should be empty string on success (not undefined)
          expect(result.error).toBe('');
        }
      });

      it('should always have error message on failed command', async () => {
        const result = await executeGateCommand('node -e "process.exit(1)"');

        if (!result.isSuccess) {
          expect(result.error).toBeDefined();
          expect(result.exitCode).toBeGreaterThan(0);
        }
      });
    });

    describe('GateResult', () => {
      const successConfig: SpeciConfig = {
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

      const failConfig: SpeciConfig = {
        ...successConfig,
        gate: {
          ...successConfig.gate,
          commands: ['node -e "process.exit(1)"'],
        },
      };

      it('should not have error property on successful gate', async () => {
        const result = await runGate(successConfig);

        if (result.isSuccess) {
          // @ts-expect-error - error should not exist on success result
          expect(result.error).toBeUndefined();
        }
      });

      it('should have error message on failed gate', async () => {
        const result = await runGate(failConfig);

        if (!result.isSuccess) {
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
        }
      });

      it('should enable type narrowing with isSuccess check', async () => {
        const result = await runGate(failConfig);

        if (!result.isSuccess) {
          // TypeScript should know error exists without optional chaining
          const errorMsg: string = result.error;
          expect(errorMsg).toBeDefined();
        }
      });
    });
  });
});
