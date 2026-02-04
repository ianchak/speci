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
import { plan } from '../lib/commands/plan.js';
import * as copilotModule from '../lib/copilot.js';

describe('plan command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    originalExit = process.exit;

    // Mock process.exit to capture exit code
    exitCode = undefined;
    process.exit = vi.fn(((code?: number) => {
      exitCode = code;
      throw new Error(`Process exit: ${code}`);
    }) as never);

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-plan-test-${Date.now()}-${Math.random()}`);
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
        model: null,
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

    // Create agents directory with plan agent
    mkdirSync('agents', { recursive: true });
    writeFileSync(
      'agents/plan.md',
      '# Plan Agent\n\nPlan generation agent template.'
    );
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

  describe('agent path resolution', () => {
    it('should use bundled agent when config.agents.plan is null', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan().catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const hasAgentArg = args.some(
        (arg: string) => arg.startsWith('--agent=') && arg.includes('plan.md')
      );
      expect(hasAgentArg).toBe(true);
    });

    it('should use custom agent when override provided', async () => {
      // Create custom agent file
      writeFileSync('custom-plan.md', '# Custom Plan Agent');

      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan({ agent: 'custom-plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const hasAgentArg = args.some(
        (arg: string) =>
          arg.startsWith('--agent=') && arg.includes('custom-plan.md')
      );
      expect(hasAgentArg).toBe(true);
    });

    it('should exit with error when agent file not found', async () => {
      await plan({ agent: 'nonexistent.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(exitCode).toBe(1);
    });
  });

  describe('copilot arguments', () => {
    it('should build correct args for interactive mode', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan().catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      expect(args).toContain('-i');
      expect(args).toContain('--allow-all');
    });

    it('should pass model flag when specified in config', async () => {
      // Update config with model
      const configPath = join(testDir, 'speci.config.json');
      const configContent = existsSync(configPath)
        ? readFileSync(configPath, 'utf8')
        : '{}';
      const config = JSON.parse(configContent);
      config.copilot.model = 'gpt-4';
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan().catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      expect(args).toContain('--model');
      expect(args).toContain('gpt-4');
    });

    it('should include output flag when provided', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan({ output: 'plan.md' }).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      expect(args).toContain('--output');
      expect(args).toContain('plan.md');
    });
  });

  describe('exit code propagation', () => {
    it('should exit with code 0 on success', async () => {
      vi.spyOn(copilotModule, 'spawnCopilot').mockResolvedValue(0);

      await plan().catch(() => {
        // Ignore process.exit error
      });

      expect(exitCode).toBe(0);
    });

    it('should exit with copilot exit code on failure', async () => {
      vi.spyOn(copilotModule, 'spawnCopilot').mockResolvedValue(42);

      await plan().catch(() => {
        // Ignore process.exit error
      });

      expect(exitCode).toBe(42);
    });
  });

  describe('options handling', () => {
    it('should accept empty options', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan({}).catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
    });

    it('should accept no options', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan().catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
    });
  });

  describe('stdio handling', () => {
    it('should spawn copilot with inherit stdio', async () => {
      const spawnSpy = vi
        .spyOn(copilotModule, 'spawnCopilot')
        .mockResolvedValue(0);

      await plan().catch(() => {
        // Ignore process.exit error
      });

      expect(spawnSpy).toHaveBeenCalled();
      const options = spawnSpy.mock.calls[0][1];
      expect(options?.inherit).toBe(true);
    });
  });
});
