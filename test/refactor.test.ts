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
import { refactor } from '../lib/commands/refactor.js';
import * as copilotModule from '../lib/copilot.js';
import { resetConfigCache } from '../lib/config.js';

// Mock preflight to skip agent template check (tested in preflight.test.ts)
vi.mock('../lib/utils/preflight.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/utils/preflight.js')>();
  return {
    ...actual,
    preflight: vi.fn().mockResolvedValue(undefined),
  };
});

describe('refactor command', () => {
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
    testDir = join(
      tmpdir(),
      `speci-refactor-test-${Date.now()}-${Math.random()}`
    );
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

    // Create agents directory with refactor agent in .github/agents/
    mkdirSync('.github/agents', { recursive: true });
    writeFileSync(
      '.github/agents/speci-refactor.agent.md',
      '# Refactor Agent\n\nRefactoring analysis agent template.'
    );

    // Create a sample directory structure for scope testing
    mkdirSync('src', { recursive: true });
    writeFileSync('src/main.ts', 'console.log("main");');
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

  describe('no options (default behavior)', () => {
    it('should use entire project scope when no scope provided', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({}).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      expect(promptIndex).toBeGreaterThan(-1);
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('codebase');
      expect(promptArg).toContain('refactoring');
    });

    it('should use default agent from .github/agents when no override', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({}).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const hasAgentArg = args.some(
        (arg: string) =>
          arg.startsWith('--agent=') && arg.includes('speci-refactor')
      );
      expect(hasAgentArg).toBe(true);
    });
  });

  describe('scope validation', () => {
    it('should validate and resolve valid directory scope', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ scope: 'src' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('scope');
      expect(promptArg).toContain('src');
    });

    it('should pass through glob pattern unchanged', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ scope: 'src/**/*.ts' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('src/**/*.ts');
    });

    it('should reject scope outside project directory', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await refactor({ scope: '../outside' });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls.map((call) =>
        call.join(' ')
      );
      const hasSecurityMessage = errorCalls.some(
        (msg) =>
          msg.includes('must be within project') || msg.includes('outside')
      );
      expect(hasSecurityMessage).toBe(true);
    });

    it('should warn but continue when scope does not exist', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ scope: 'nonexistent' }).catch(() => {
        // Ignore process.exit error
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(spawnSpy).toHaveBeenCalled();
    });
  });

  describe('agent path resolution', () => {
    it('should use custom agent when override provided', async () => {
      // Create custom agent file in .github/agents/
      writeFileSync(
        '.github/agents/custom-refactor.md',
        '# Custom Refactor Agent'
      );

      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ agent: 'custom-refactor.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const hasAgentArg = args.some(
        (arg: string) =>
          arg.startsWith('--agent=') && arg.includes('custom-refactor.md')
      );
      expect(hasAgentArg).toBe(true);
    });

    it('should exit with error when agent file not found', async () => {
      const result = await refactor({ agent: 'nonexistent.md' });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('copilot arguments', () => {
    it('should build correct args for one-shot mode', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({}).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      expect(args).toContain('-p');
      expect(args).toContain('--allow-all');
    });

    it('should include scope in prompt when provided', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ scope: 'src' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      expect(promptIndex).toBeGreaterThan(-1);
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('src');
    });

    it('should pass model flag when specified for refactor agent in config', async () => {
      // Update config with per-agent model
      const configPath = join(testDir, 'speci.config.json');
      const configContent = existsSync(configPath)
        ? readFileSync(configPath, 'utf8')
        : '{}';
      const config = JSON.parse(configContent);
      config.copilot.models = config.copilot.models || {};
      config.copilot.models.refactor = 'gpt-4';
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({}).catch(() => {
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

      const result = await refactor({});

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should exit with copilot exit code on failure', async () => {
      vi.spyOn(copilotModule, 'spawnCopilot').mockResolvedValue(42);

      const result = await refactor({});

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });
  });

  describe('stdio handling', () => {
    it('should spawn copilot with inherit stdio', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({}).catch(() => {
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

      await refactor({}).catch(() => {
        // Ignore process.exit error
      });

      // If we got to spawn, preflight checks passed
      expect(spawnSpy).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle absolute scope paths', async () => {
      const absolutePath = join(testDir, 'src');
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ scope: absolutePath }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('scope');
    });

    it('should handle glob patterns with brackets', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ scope: 'src/**/*.{ts,js}' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('src/**/*.{ts,js}');
    });

    it('should handle single file scope', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await refactor({ scope: 'src/main.ts' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const promptIndex = args.indexOf('-p');
      const promptArg = args[promptIndex + 1];
      expect(promptArg).toContain('main.ts');
    });
  });
});
