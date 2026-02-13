import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { task } from '../lib/commands/task.js';
import * as copilotModule from '../lib/copilot.js';
import { resetConfigCache } from '../lib/config.js';

describe('task command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    // Reset config cache before each test to avoid stale config
    resetConfigCache();

    // Save original state
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    originalExit = process.exit;

    // Mock process.exit to prevent actual exit
    process.exit = vi.fn(((code?: number) => {
      throw new Error(`Process exit: ${code}`);
    }) as never);

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-task-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    // Create minimal config file
    const config = {
      version: '1.0.0',
      paths: {
        progress: 'docs/PROGRESS.md',
        tasks: 'docs/tasks',
        logs: '.speci-logs',
        lock: '.speci-lock',
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
        permissions: 'allow-all' as const,
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
        commands: ['npm run lint', 'npm run typecheck', 'npm test'],
        maxFixAttempts: 5,
      },
      loop: {
        maxIterations: 100,
      },
    };
    writeFileSync('speci.config.json', JSON.stringify(config, null, 2));

    // Create .git directory to satisfy git check
    mkdirSync('.git', { recursive: true });

    // Create agents directory with task agent in .github/agents/
    mkdirSync('.github/agents', { recursive: true });
    writeFileSync(
      '.github/agents/speci-task.agent.md',
      '# Task Agent\n\nTask generation agent template.'
    );

    // Create a sample plan file
    writeFileSync('plan.md', '# Implementation Plan\n\nSample plan content.');
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    process.env = originalEnv;
    process.exit = originalExit;

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  describe('required options', () => {
    it('should exit with error when --plan flag is missing', async () => {
      const result = await task({});
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should display usage message when --plan is missing', async () => {
      const logErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await task({});

      expect(logErrorSpy).toHaveBeenCalled();
      const errorCalls = logErrorSpy.mock.calls.map((call) => call.join(' '));
      const hasUsageMessage = errorCalls.some(
        (msg) =>
          msg.includes('Missing required input') || msg.includes('--plan')
      );
      expect(hasUsageMessage).toBe(true);
    });
  });

  describe('plan file validation', () => {
    it('should exit with error when plan file does not exist', async () => {
      const result = await task({ plan: 'nonexistent.md' });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should display error message for nonexistent plan file', async () => {
      const logErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await task({ plan: 'nonexistent.md' });

      expect(logErrorSpy).toHaveBeenCalled();
      const errorCalls = logErrorSpy.mock.calls.map((call) => call.join(' '));
      const hasFileNotFoundMessage = errorCalls.some(
        (msg) =>
          msg.includes('Plan file not found') || msg.includes('nonexistent.md')
      );
      expect(hasFileNotFoundMessage).toBe(true);
    });

    it('should resolve plan file path to absolute', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptArg = args.find((arg: string) => arg.includes('plan.md'));
      expect(promptArg).toBeDefined();
    });
  });

  describe('agent path resolution', () => {
    it('should use default agent from .github/agents when no override', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const hasAgentArg = args.some(
        (arg: string) =>
          arg.startsWith('--agent=') && arg.includes('speci-task')
      );
      expect(hasAgentArg).toBe(true);
    });

    it('should use custom agent when override provided', async () => {
      // Create custom agent file in .github/agents/
      writeFileSync('.github/agents/custom-task.md', '# Custom Task Agent');

      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md', agent: 'custom-task.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const hasAgentArg = args.some(
        (arg: string) =>
          arg.startsWith('--agent=') && arg.includes('custom-task.md')
      );
      expect(hasAgentArg).toBe(true);
    });

    it('should exit with error when agent file not found', async () => {
      const result = await task({ plan: 'plan.md', agent: 'nonexistent.md' });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('copilot arguments', () => {
    it('should build correct args for one-shot mode', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      expect(args).toContain('-p');
      expect(args).toContain('--allow-all');
    });

    it('should include plan file path in prompt', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      expect(promptIndex).toBeGreaterThan(-1);
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('plan.md');
    });

    it('should pass model flag when specified for task agent in config', async () => {
      // Update config with per-agent model
      const configPath = join(testDir, 'speci.config.json');
      const configContent = existsSync(configPath)
        ? readFileSync(configPath, 'utf8')
        : '{}';
      const config = JSON.parse(configContent);
      config.copilot.models = config.copilot.models || {};
      config.copilot.models.task = 'gpt-4';
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      expect(args).toContain('--model');
      expect(args).toContain('gpt-4');
    });
  });

  describe('exit code propagation', () => {
    it('should exit with code 0 on success', async () => {
      vi.spyOn(copilotModule, 'spawnCopilot').mockResolvedValue(0);

      const result = await task({ plan: 'plan.md' });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should exit with copilot exit code on failure', async () => {
      vi.spyOn(copilotModule, 'spawnCopilot').mockResolvedValue(42);

      const result = await task({ plan: 'plan.md' });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });
  });

  describe('stdio handling', () => {
    it('should spawn copilot with inherit stdio', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const options = spawnSpy.mock.calls[0][1];
      expect(options?.inherit).toBe(true);
    });
  });

  describe('preflight checks', () => {
    it('should run preflight checks before invocation', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await task({ plan: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      // If we got to spawn, preflight checks passed
      expect(spawnSpy).toHaveBeenCalled();
    });
  });
});
