import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
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
      expect(result.error).toBeUndefined();
    });

    it('should return failure for non-zero exit code', async () => {
      const mockChild = new EventEmitter();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

      const promise = runAgent(config, 'impl', 'Test Implementation');

      // Simulate failure
      setTimeout(() => mockChild.emit('close', 1), 10);

      const result: AgentRunResult = await promise;

      expect(result.isSuccess).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
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
      expect(result.exitCode).toBe(127);
      expect(result.error).toContain('Copilot CLI not found');
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
});
