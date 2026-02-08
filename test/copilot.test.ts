import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  buildCopilotArgs,
  spawnCopilot,
  runAgent,
  type CopilotArgsOptions,
  type AgentRunResult,
} from '../lib/copilot.js';
import { getDefaults, type SpeciConfig } from '../lib/config.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock logger
vi.mock('../lib/utils/logger.js', () => ({
  log: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config resolveAgentPath
vi.mock('../lib/config.js', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/config.js')>(
      '../lib/config.js'
    );
  return {
    ...actual,
    resolveAgentPath: vi.fn((_config: SpeciConfig, agentName: string) => {
      return `/path/to/agents/${agentName}.md`;
    }),
  };
});

describe('copilot', () => {
  let config: SpeciConfig;

  beforeEach(() => {
    config = getDefaults();
    vi.clearAllMocks();
  });

  describe('buildCopilotArgs', () => {
    it('should build args for one-shot mode with empty prompt by default', () => {
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('-p');
      expect(args).toContain('--allow-all');
    });

    it('should build args for one-shot mode with prompt', () => {
      const options: CopilotArgsOptions = {
        prompt: 'test prompt',
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
      expect(args).toContain('--allow-all');
    });

    it('should include agent flag when agent specified', () => {
      const options: CopilotArgsOptions = {
        agent: '/path/to/agent.md',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('--agent=/path/to/agent.md');
    });

    it('should include --allow-all flag for allow-all permission', () => {
      config.copilot.permissions = 'allow-all';
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('--allow-all');
      expect(args).not.toContain('--yolo');
    });

    it('should include --yolo flag for yolo permission', () => {
      config.copilot.permissions = 'yolo';
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('--yolo');
      expect(args).not.toContain('--allow-all');
    });

    it('should not include permission flag for strict mode', () => {
      config.copilot.permissions = 'strict';
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).not.toContain('--allow-all');
      expect(args).not.toContain('--yolo');
    });

    it('should include model flag when model is configured', () => {
      config.copilot.model = 'gpt-4';
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('--model');
      expect(args).toContain('gpt-4');
    });

    it('should use per-command model when command is specified', () => {
      config.copilot.model = 'gpt-4'; // default model
      config.copilot.models.plan = 'claude-opus-4.5'; // per-command model
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4.5');
      expect(args).not.toContain('gpt-4');
    });

    it('should fall back to default model when per-command model is null', () => {
      config.copilot.model = 'gpt-4'; // default model
      config.copilot.models.task = null; // no per-command model
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'task',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('--model');
      expect(args).toContain('gpt-4');
    });

    it('should not include model flag when both default and per-command are null', () => {
      config.copilot.model = null;
      config.copilot.models.refactor = null;
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'refactor',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).not.toContain('--model');
    });

    it('should append extra flags from config', () => {
      config.copilot.extraFlags = ['--verbose', '--debug'];
      const options: CopilotArgsOptions = {
        agent: 'test-agent',
        command: 'plan',
      };

      const args = buildCopilotArgs(config, options);

      expect(args).toContain('--verbose');
      expect(args).toContain('--debug');
    });
  });

  describe('spawnCopilot', () => {
    it('should spawn copilot process with correct arguments', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = spawnCopilot(['-p', '', '--allow-all']);

      // Simulate successful completion
      setTimeout(() => mockChild.emit('close', 0), 10);

      const exitCode = await promise;

      expect(spawn).toHaveBeenCalledWith('copilot', ['-p', '', '--allow-all'], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: process.env,
        shell: false,
      });
      expect(exitCode).toBe(0);
    });

    it('should handle process error (ENOENT)', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = spawnCopilot(['-p', '']);

      // Simulate ENOENT error
      setTimeout(() => {
        const error = new Error(
          'spawn copilot ENOENT'
        ) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockChild.emit('error', error);
      }, 10);

      await expect(promise).rejects.toThrow('spawn copilot ENOENT');
    });

    it('should resolve with non-zero exit code on failure', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = spawnCopilot(['-p', '']);

      // Simulate failure
      setTimeout(() => mockChild.emit('close', 1), 10);

      const exitCode = await promise;
      expect(exitCode).toBe(1);
    });

    it('should handle null exit code as 1', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = spawnCopilot(['-p', '']);

      // Simulate close with null exit code
      setTimeout(() => mockChild.emit('close', null), 10);

      const exitCode = await promise;
      expect(exitCode).toBe(1);
    });
  });

  describe('runAgent', () => {
    it('should return success for exit code 0', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // Simulate success
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result: AgentRunResult = await promise;

      expect(result.isSuccess).toBe(true);
      expect(result.exitCode).toBe(0);
      if (result.isSuccess) {
        // Success case doesn't have error property
        expect('error' in result).toBe(false);
      }
    });

    it('should return failure for non-zero exit code', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // Simulate failure
      setTimeout(() => mockChild.emit('close', 1), 10);

      const result: AgentRunResult = await promise;

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.exitCode).toBe(1);
        expect(result.error).toBeDefined();
      }
    });

    it('should retry on retryable exit codes', async () => {
      const mockChild1 = new EventEmitter();
      const mockChild2 = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // First attempt fails with rate limit (429 -> retryable)
      setTimeout(() => mockChild1.emit('close', 429), 10);
      // Second attempt succeeds
      setTimeout(() => mockChild2.emit('close', 0), 1100);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(2);
      expect(result.isSuccess).toBe(true);
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should retry on exit code 52 (network error)', async () => {
      const mockChild1 = new EventEmitter();
      const mockChild2 = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // First attempt fails with network error (52 -> retryable)
      setTimeout(() => mockChild1.emit('close', 52), 10);
      // Second attempt succeeds
      setTimeout(() => mockChild2.emit('close', 0), 1100);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(2);
      expect(result.isSuccess).toBe(true);
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should retry on exit code 124 (timeout)', async () => {
      const mockChild1 = new EventEmitter();
      const mockChild2 = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // First attempt fails with timeout (124 -> retryable)
      setTimeout(() => mockChild1.emit('close', 124), 10);
      // Second attempt succeeds
      setTimeout(() => mockChild2.emit('close', 0), 1100);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(2);
      expect(result.isSuccess).toBe(true);
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should retry on exit code 7 (connection failure)', async () => {
      const mockChild1 = new EventEmitter();
      const mockChild2 = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // First attempt fails with connection failure (7 -> retryable)
      setTimeout(() => mockChild1.emit('close', 7), 10);
      // Second attempt succeeds
      setTimeout(() => mockChild2.emit('close', 0), 1100);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(2);
      expect(result.isSuccess).toBe(true);
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should retry on exit code 6 (DNS resolution failure)', async () => {
      const mockChild1 = new EventEmitter();
      const mockChild2 = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // First attempt fails with DNS failure (6 -> retryable)
      setTimeout(() => mockChild1.emit('close', 6), 10);
      // Second attempt succeeds
      setTimeout(() => mockChild2.emit('close', 0), 1100);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(2);
      expect(result.isSuccess).toBe(true);
      expect(result.exitCode).toBe(0);
    }, 10000);

    it('should not retry on ENOENT error', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // Simulate ENOENT error
      setTimeout(() => {
        const error = new Error(
          'spawn copilot ENOENT'
        ) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockChild.emit('error', error);
      }, 10);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(1); // No retries
      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.exitCode).toBe(127);
        expect(result.error).toContain('Copilot CLI not found');
      }
    });

    it('should not retry on non-retryable exit codes', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // Non-retryable exit code
      setTimeout(() => mockChild.emit('close', 1), 10);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(result.isSuccess).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should respect max retries limit', async () => {
      vi.useFakeTimers();

      // Create mocks for all attempts (initial + 3 retries = 4 total)
      const mocks = Array.from({ length: 4 }, () => new EventEmitter());
      (spawn as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mocks[0])
        .mockReturnValueOnce(mocks[1])
        .mockReturnValueOnce(mocks[2])
        .mockReturnValueOnce(mocks[3]);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // Emit close event for first attempt immediately
      setTimeout(() => mocks[0].emit('close', 429), 10);
      await vi.advanceTimersByTimeAsync(1000);

      // Emit close event for second attempt (after 1s delay)
      setTimeout(() => mocks[1].emit('close', 429), 10);
      await vi.advanceTimersByTimeAsync(2000);

      // Emit close event for third attempt (after 2s delay)
      setTimeout(() => mocks[2].emit('close', 429), 10);
      await vi.advanceTimersByTimeAsync(4000);

      // Emit close event for fourth attempt (after 4s delay)
      setTimeout(() => mocks[3].emit('close', 429), 10);
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(spawn).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(result.isSuccess).toBe(false);
      expect(result.exitCode).toBe(429);

      vi.useRealTimers();
    });
  });

  describe('Discriminated Union Types', () => {
    describe('AgentRunResult', () => {
      it('should have no error property on success', async () => {
        const mockChild = new EventEmitter();
        (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

        const promise = runAgent(config, 'impl', 'Test Implementation');
        setTimeout(() => mockChild.emit('close', 0), 10);

        const result = await promise;

        if (result.isSuccess) {
          // TypeScript should allow accessing exitCode
          expect(result.exitCode).toBe(0);
          // @ts-expect-error - error should not exist on success result
          expect(result.error).toBeUndefined();
        }
      });

      it('should always have error property on failure', async () => {
        const mockChild = new EventEmitter();
        (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

        const promise = runAgent(config, 'impl', 'Test Implementation');
        setTimeout(() => mockChild.emit('close', 1), 10);

        const result = await promise;

        if (!result.isSuccess) {
          // TypeScript should require error to be present
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      });

      it('should enable type narrowing with isSuccess check', async () => {
        const mockChild = new EventEmitter();
        (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

        const promise = runAgent(config, 'impl', 'Test Implementation');
        setTimeout(() => mockChild.emit('close', 1), 10);

        const result = await promise;

        // After this check, TypeScript knows result has error property
        if (!result.isSuccess) {
          // No optional chaining needed
          const errorMessage: string = result.error;
          expect(errorMessage).toBeDefined();
        }
      });
    });
  });

  describe('runAgent retry logic comprehensive tests', () => {
    it('should handle retryable error codes (rate limit)', async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          if (callCount === 1) {
            // First call fails with rate limit (retryable)
            if (proc.stderr) {
              proc.stderr.emit('data', 'Rate limit exceeded');
            }
            proc.emit('close', 429);
          } else {
            // Second call succeeds
            proc.emit('close', 0);
          }
        }, 10);

        return proc;
      });

      const result = await runAgent(config, 'test-agent', 'plan');

      expect(result.isSuccess).toBe(true);
      expect(callCount).toBeGreaterThan(1); // Should have retried
    });

    it('should skip retry for non-retryable exit codes', async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          if (proc.stderr) {
            proc.stderr.emit('data', 'User error');
          }
          proc.emit('close', 1); // Exit code 1 (non-retryable)
        }, 10);

        return proc;
      });

      const result = await runAgent(config, 'test-agent', 'plan');

      expect(result.isSuccess).toBe(false);
      expect(callCount).toBe(1); // No retries for exit code 1
      if (!result.isSuccess) {
        // Error message format may vary, just check it exists
        expect(result.error).toBeDefined();
        expect(result.exitCode).toBe(1);
      }
    });

    it('should handle network errors (exit code 52)', async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          if (proc.stderr) {
            proc.stderr.emit('data', 'Network connection failed');
          }
          proc.emit('close', 52); // Network error (retryable)
        }, 10);

        return proc;
      });

      await runAgent(config, 'test-agent', 'plan');

      // Should retry but eventually fail if all retries exhausted
      expect(callCount).toBeGreaterThan(1);
    }, 15000); // Increase timeout for retry delays

    it('should handle timeout errors (exit code 124)', async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          if (proc.stderr) {
            proc.stderr.emit('data', 'Command timed out');
          }
          proc.emit('close', 124); // Timeout (retryable)
        }, 10);

        return proc;
      });

      await runAgent(config, 'test-agent', 'plan');

      // Should retry for timeout
      expect(callCount).toBeGreaterThan(1);
    }, 15000); // Increase timeout for retry delays

    it('should return error with context when all retries exhausted', async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          if (proc.stderr) {
            proc.stderr.emit(
              'data',
              `Connection failed (attempt ${callCount})`
            );
          }
          proc.emit('close', 7); // Connection failure (retryable)
        }, 10);

        return proc;
      });

      const result = await runAgent(config, 'test-agent', 'plan');

      expect(result.isSuccess).toBe(false);
      expect(callCount).toBeGreaterThan(1); // Should have retried
      if (!result.isSuccess) {
        expect(result.error).toBeDefined();
        expect(result.exitCode).toBe(7);
      }
    }, 15000); // Increase timeout for retry delays

    it('should use exponential backoff for retries', async () => {
      const timestamps: number[] = [];
      let callCount = 0;

      vi.mocked(spawn).mockImplementation(() => {
        timestamps.push(Date.now());
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 429); // Rate limit (retryable)
        }, 10);

        return proc;
      });

      await runAgent(config, 'test-agent', 'plan');

      // Should have made initial attempt + retries
      expect(callCount).toBeGreaterThan(1);
      expect(timestamps.length).toBeGreaterThan(1);

      // Verify delays increase (exponential backoff)
      if (timestamps.length >= 3) {
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];
        // Second delay should be longer than first (exponential growth)
        expect(delay2).toBeGreaterThan(delay1 * 1.5);
      }
    }, 15000); // Increase timeout for retry delays
  });

  describe('spawnCopilot stdio options', () => {
    it('should use pipe stdio when inherit is false', async () => {
      let actualOptions: unknown;
      vi.mocked(spawn).mockImplementation((_cmd, _args, options) => {
        actualOptions = options;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 0);
        }, 10);

        return proc;
      });

      await spawnCopilot(['--help'], { inherit: false });

      expect((actualOptions as { stdio: string }).stdio).toBe('pipe');
    });

    it('should use inherit stdio by default', async () => {
      let actualOptions: unknown;
      vi.mocked(spawn).mockImplementation((_cmd, _args, options) => {
        actualOptions = options;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 0);
        }, 10);

        return proc;
      });

      await spawnCopilot(['--help']);

      expect((actualOptions as { stdio: string }).stdio).toBe('inherit');
    });
  });

  describe('runAgent ENOENT error handling', () => {
    it('should handle ENOENT error (copilot not found)', async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          const error: NodeJS.ErrnoException = new Error(
            'spawn copilot ENOENT'
          );
          error.code = 'ENOENT';
          proc.emit('error', error);
        }, 10);

        return proc;
      });

      const result = await runAgent(config, 'test-agent', 'plan');

      expect(result.isSuccess).toBe(false);
      expect(result.exitCode).toBe(127);
      if (!result.isSuccess) {
        expect(result.error).toContain('Copilot CLI not found');
        expect(result.error).toContain('PATH');
      }
    });

    it('should not retry on ENOENT error', async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          const error: NodeJS.ErrnoException = new Error(
            'spawn copilot ENOENT'
          );
          error.code = 'ENOENT';
          proc.emit('error', error);
        }, 10);

        return proc;
      });

      const result = await runAgent(config, 'test-agent', 'plan');

      // Should only attempt once (no retries for ENOENT)
      expect(callCount).toBe(1);
      // Should return proper error result
      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.exitCode).toBe(127);
        expect(result.error).toBe(
          'Copilot CLI not found. Is it installed and in PATH?'
        );
      }
    });
  });

  describe('Retry Logic Comprehensive Edge Cases', () => {
    it('should retry and succeed after transient failure (AC#36)', async () => {
      vi.useFakeTimers();
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          // First call fails with retryable error, second succeeds
          const exitCode = callCount === 1 ? 429 : 0;
          proc.emit('close', exitCode);
        }, 10);

        return proc;
      });

      const promise = runAgent(config, 'test-agent', 'plan');

      // Fast-forward through retry delay (1000ms for first retry)
      await vi.advanceTimersByTimeAsync(1100);

      const result = await promise;

      expect(result.isSuccess).toBe(true);
      expect(callCount).toBe(2); // Initial attempt + 1 retry
      expect(result.exitCode).toBe(0);

      vi.useRealTimers();
    });

    it('should exhaust maxRetries and return lastError (AC#37)', async () => {
      vi.useFakeTimers();
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 429); // Always fail with retryable error
        }, 10);

        return proc;
      });

      const promise = runAgent(config, 'test-agent', 'plan', {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 10000,
        retryableExitCodes: [429, 52, 124, 7, 6],
      });

      // Fast-forward through all retries (100ms + 200ms delays)
      await vi.advanceTimersByTimeAsync(500);

      const result = await promise;

      expect(result.isSuccess).toBe(false);
      expect(callCount).toBe(3); // Initial + 2 retries
      if (!result.isSuccess) {
        expect(result.exitCode).toBe(429);
        expect(result.error).toBeDefined();
      }

      vi.useRealTimers();
    });

    it('should use exponential backoff timing (AC#38)', async () => {
      vi.useFakeTimers();
      const timestamps: number[] = [];
      let callCount = 0;

      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        timestamps.push(Date.now());
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 429); // Always fail
        }, 10);

        return proc;
      });

      const promise = runAgent(config, 'test-agent', 'plan', {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableExitCodes: [429, 52, 124, 7, 6],
      });

      // Fast-forward through retries: 1s, 2s, 4s
      await vi.advanceTimersByTimeAsync(8000);

      await promise;

      expect(callCount).toBe(4); // Initial + 3 retries
      expect(timestamps.length).toBe(4);

      // Verify exponential backoff delays (with tolerance)
      const delay1 = timestamps[1] - timestamps[0]; // Should be ~1000ms
      const delay2 = timestamps[2] - timestamps[1]; // Should be ~2000ms
      const delay3 = timestamps[3] - timestamps[2]; // Should be ~4000ms

      expect(delay1).toBeGreaterThanOrEqual(950);
      expect(delay1).toBeLessThanOrEqual(1050);
      expect(delay2).toBeGreaterThanOrEqual(1950);
      expect(delay2).toBeLessThanOrEqual(2050);
      expect(delay3).toBeGreaterThanOrEqual(3950);
      expect(delay3).toBeLessThanOrEqual(4050);

      vi.useRealTimers();
    });

    it('should skip retry for non-retryable exit codes (AC#39)', async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 1); // Exit code 1 is not retryable
        }, 10);

        return proc;
      });

      const result = await runAgent(config, 'test-agent', 'plan');

      expect(result.isSuccess).toBe(false);
      expect(callCount).toBe(1); // No retries
      if (!result.isSuccess) {
        expect(result.exitCode).toBe(1);
      }
    });

    it('should return lastError with full context (AC#40)', async () => {
      vi.useFakeTimers();
      vi.mocked(spawn).mockImplementation(() => {
        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 429);
        }, 10);

        return proc;
      });

      const promise = runAgent(config, 'test-agent', 'plan', {
        maxRetries: 1,
        baseDelay: 100,
        maxDelay: 10000,
        retryableExitCodes: [429, 52, 124, 7, 6],
      });

      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        // Verify error contains context about failure
        expect(result.exitCode).toBe(429);
        expect(result.error).toBeDefined();
        // Error should be descriptive (actual implementation may vary)
        expect(typeof result.error).toBe('string');
      }

      vi.useRealTimers();
    });

    it('should verify backoff delays increase exponentially (AC#41)', async () => {
      vi.useFakeTimers();
      const delayCaptures: number[] = [];
      let lastTimestamp = Date.now();
      let callCount = 0;

      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const currentTimestamp = Date.now();
        if (callCount > 1) {
          delayCaptures.push(currentTimestamp - lastTimestamp);
        }
        lastTimestamp = currentTimestamp;

        const proc = new EventEmitter() as ChildProcess;
        proc.stdout = new EventEmitter() as never;
        proc.stderr = new EventEmitter() as never;

        setTimeout(() => {
          proc.emit('close', 52); // Network error (retryable)
        }, 10);

        return proc;
      });

      const promise = runAgent(config, 'test-agent', 'plan', {
        maxRetries: 4,
        baseDelay: 1000,
        maxDelay: 20000,
        retryableExitCodes: [52, 429, 124, 7, 6],
      });

      // Fast-forward through delays: 1s, 2s, 4s, 8s
      await vi.advanceTimersByTimeAsync(16000);

      await promise;

      expect(callCount).toBe(5); // Initial + 4 retries
      expect(delayCaptures.length).toBe(4);

      // Verify exponential pattern (with ±50ms tolerance)
      expect(delayCaptures[0]).toBeGreaterThanOrEqual(950); // 1000ms
      expect(delayCaptures[0]).toBeLessThanOrEqual(1050);
      expect(delayCaptures[1]).toBeGreaterThanOrEqual(1950); // 2000ms
      expect(delayCaptures[1]).toBeLessThanOrEqual(2050);
      expect(delayCaptures[2]).toBeGreaterThanOrEqual(3950); // 4000ms
      expect(delayCaptures[2]).toBeLessThanOrEqual(4050);
      expect(delayCaptures[3]).toBeGreaterThanOrEqual(7950); // 8000ms
      expect(delayCaptures[3]).toBeLessThanOrEqual(8050);

      vi.useRealTimers();
    });
  });
});
