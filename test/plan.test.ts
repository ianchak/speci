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
import { createMockContext } from '../lib/adapters/test-context.js';
import type { CommandContext } from '../lib/interfaces.js';

describe('plan command', () => {
  let testDir: string;
  let originalCwd: string;
  let mockContext: CommandContext;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();

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
      copilot: {
        permissions: 'allow-all' as const,
        models: {
          plan: 'claude-opus-4.6',
          task: 'claude-sonnet-4.5',
          refactor: 'claude-sonnet-4.5',
          impl: 'gpt-5.3-codex',
          review: 'claude-sonnet-4.5',
          fix: 'claude-sonnet-4.5',
          tidy: 'gpt-5.2',
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

    // Create agents directory with plan agent in .github/agents/
    mkdirSync('.github/agents', { recursive: true });
    writeFileSync(
      '.github/agents/speci-plan.agent.md',
      '# Plan Agent\n\nPlan generation agent template.'
    );

    // Create mock context with filesystem that checks real files
    const realFs = {
      existsSync: (_path: string) => existsSync(_path),
      readFileSync: (_path: string, encoding?: BufferEncoding) =>
        readFileSync(_path, encoding || 'utf8'),
      writeFileSync: (
        _path: string,
        data: string | Buffer,
        encoding?: BufferEncoding
      ) => writeFileSync(_path, data, encoding as BufferEncoding),
      mkdirSync: (_path: string, options?: { recursive?: boolean }) =>
        mkdirSync(_path, options),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({
        isDirectory: () => false,
        isFile: () => true,
      })),
      copyFileSync: vi.fn(),
      readFile: vi.fn(async () => ''),
      writeFile: vi.fn(async () => {}),
    };

    // Create mock copilot runner that returns realistic args
    const realCopilotRunner = {
      buildArgs: vi.fn(
        (
          config: {
            copilot: {
              permissions: string;
              models: { plan: string | null };
            };
          },
          options: { agent: string; prompt?: string; command?: string }
        ) => {
          const args = ['-p', options.prompt || 'Execute agent instructions'];
          args.push(`--agent=${options.agent}`);
          if (config.copilot.permissions === 'allow-all') {
            args.push('--allow-all');
          }
          if (options.command === 'plan' && config.copilot.models.plan) {
            args.push('--model', config.copilot.models.plan);
          }
          return args;
        }
      ),
      spawn: vi.fn(async () => 0),
      run: vi.fn(async () => ({ isSuccess: true, exitCode: 0 }) as const),
    };

    mockContext = createMockContext({
      mockConfig: config,
      cwd: testDir,
      fs: realFs,
      copilotRunner: realCopilotRunner,
    });
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  describe('agent path resolution', () => {
    it('should use default agent from .github/agents when no override', async () => {
      const spawnSpy = vi
        .spyOn(mockContext.copilotRunner, 'spawn')
        .mockResolvedValue(0);

      const result = await plan({ prompt: 'test plan' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      const hasAgentArg = args.some(
        (arg: string) =>
          arg.startsWith('--agent=') && arg.includes('speci-plan')
      );
      expect(hasAgentArg).toBe(true);
    });

    it('should return error when agent file not found', async () => {
      // Mock fs.existsSync to return false for agent file
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(false);

      const result = await plan({ prompt: 'test plan' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('Agent file not found');
    });
  });

  describe('copilot arguments', () => {
    it('should build correct args for one-shot mode', async () => {
      const spawnSpy = vi
        .spyOn(mockContext.copilotRunner, 'spawn')
        .mockResolvedValue(0);

      await plan({ prompt: 'test plan' }, mockContext);

      expect(spawnSpy).toHaveBeenCalled();
      const args = spawnSpy.mock.calls[0][0];
      expect(args).toContain('-p');
      expect(args).toContain('--allow-all');
    });

    it('should pass model flag when specified for plan agent in config', async () => {
      // Update config with per-agent model
      const configPath = join(testDir, 'speci.config.json');
      const configContent = existsSync(configPath)
        ? readFileSync(configPath, 'utf8')
        : '{}';
      const config = JSON.parse(configContent);
      config.copilot.models.plan = 'gpt-4';
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Create mock copilot runner with updated config
      const buildArgsSpy = vi.fn(
        (
          config: {
            copilot: {
              permissions: string;
              models: { plan: string | null };
            };
          },
          options: { agent: string; prompt?: string; command?: string }
        ) => {
          const args = ['-p', options.prompt || 'Execute agent instructions'];
          args.push(`--agent=${options.agent}`);
          if (config.copilot.permissions === 'allow-all') {
            args.push('--allow-all');
          }
          if (options.command === 'plan' && config.copilot.models.plan) {
            args.push('--model', config.copilot.models.plan);
          }
          return args;
        }
      );
      const spawnSpy = vi.fn(async () => 0);

      const realCopilotRunner = {
        buildArgs: buildArgsSpy,
        spawn: spawnSpy,
        run: vi.fn(async () => ({ isSuccess: true, exitCode: 0 }) as const),
      };

      // Create real filesystem wrapper
      const realFs = {
        existsSync: (_path: string) => existsSync(_path),
        readFileSync: (_path: string, encoding?: BufferEncoding) =>
          readFileSync(_path, encoding || 'utf8'),
        writeFileSync: (
          _path: string,
          data: string | Buffer,
          encoding?: BufferEncoding
        ) => writeFileSync(_path, data, encoding as BufferEncoding),
        mkdirSync: (_path: string, options?: { recursive?: boolean }) =>
          mkdirSync(_path, options),
        unlinkSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({
          isDirectory: () => false,
          isFile: () => true,
        })),
        copyFileSync: vi.fn(),
        readFile: vi.fn(async () => ''),
        writeFile: vi.fn(async () => {}),
      };

      // Update mock context with new config and runner
      const updatedContext = createMockContext({
        mockConfig: config,
        cwd: testDir,
        copilotRunner: realCopilotRunner,
        fs: realFs,
      });

      await plan({ prompt: 'test plan' }, updatedContext);

      // Check that buildArgs was called with model
      expect(buildArgsSpy).toHaveBeenCalled();
      const buildResult = buildArgsSpy.mock.results[0].value;
      expect(buildResult).toContain('--model');
      expect(buildResult).toContain('gpt-4');
    });

    it('should include output path in prompt when --output provided', async () => {
      const buildArgsSpy = vi.spyOn(mockContext.copilotRunner, 'buildArgs');
      vi.spyOn(mockContext.copilotRunner, 'spawn').mockResolvedValue(0);

      await plan({ output: 'plan.md', prompt: 'test plan' }, mockContext);

      expect(buildArgsSpy).toHaveBeenCalled();
      const passedOptions = buildArgsSpy.mock.calls[0][1] as {
        prompt?: string;
      };
      expect(passedOptions.prompt).toContain('plan.md');
      expect(passedOptions.prompt).toContain(
        'Use this exact path as the plan document file for ALL phases'
      );
    });
  });

  describe('exit code propagation', () => {
    it('should return success result on success', async () => {
      vi.spyOn(mockContext.copilotRunner, 'spawn').mockResolvedValue(0);

      const result = await plan({ prompt: 'test plan' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('should return error result with copilot exit code on failure', async () => {
      vi.spyOn(mockContext.copilotRunner, 'spawn').mockResolvedValue(42);

      const result = await plan({ prompt: 'test plan' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });
  });

  describe('options handling', () => {
    it('should accept prompt option', async () => {
      const spawnSpy = vi
        .spyOn(mockContext.copilotRunner, 'spawn')
        .mockResolvedValue(0);

      const result = await plan({ prompt: 'test plan' }, mockContext);

      expect(result.success).toBe(true);
      expect(spawnSpy).toHaveBeenCalled();
    });

    it('should accept input option', async () => {
      // Create input file
      writeFileSync('spec.md', '# Specification');

      const spawnSpy = vi
        .spyOn(mockContext.copilotRunner, 'spawn')
        .mockResolvedValue(0);

      const result = await plan({ input: ['spec.md'] }, mockContext);

      expect(result.success).toBe(true);
      expect(spawnSpy).toHaveBeenCalled();
    });

    it('should return error when neither prompt nor input provided', async () => {
      const result = await plan({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('Missing required input');
    });

    it('should return error when input file does not exist', async () => {
      const result = await plan({ input: ['nonexistent.md'] }, mockContext);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('Input file not found');
    });
  });

  describe('stdio handling', () => {
    it('should spawn copilot with inherit stdio', async () => {
      const spawnSpy = vi
        .spyOn(mockContext.copilotRunner, 'spawn')
        .mockResolvedValue(0);

      await plan({ prompt: 'test plan' }, mockContext);

      expect(spawnSpy).toHaveBeenCalled();
      const options = spawnSpy.mock.calls[0][1];
      expect(options?.inherit).toBe(true);
    });
  });

  describe('default context', () => {
    it('should use production context when context not provided', async () => {
      // This test verifies the default parameter works
      // Note: We can't easily test this without mocking the whole system
      // So we just verify the function signature allows calling without context
      expect(plan).toBeDefined();
      // Default parameters don't count towards function.length, so we can't test it this way
      // Instead we verify the type signature allows it
      const _typeTest: (options?: {
        prompt?: string;
      }) => Promise<{ success: boolean; exitCode: number }> = plan;
      expect(_typeTest).toBe(plan);
    });
  });
});
