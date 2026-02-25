import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { EventEmitter } from 'node:events';
import type { CommandContext } from '../../lib/interfaces.js';
import type { SpeciConfig } from '../../lib/types.js';
import { createMockContext } from '../../lib/adapters/test-context.js';

describe('CommandRegistry', () => {
  let mockContext: CommandContext;
  let mockConfig: SpeciConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create minimal mock config
    mockConfig = {
      version: '1.0',
      paths: {
        progress: 'docs/PROGRESS.md',
        tasks: 'docs/tasks',
        logs: '.speci/logs',
        lock: '.speci/lock',
      },
      gate: {
        commands: ['npm run lint', 'npm run typecheck', 'npm test'],
        maxFixAttempts: 3,
      },
      copilot: {
        permissions: 'allow-all',
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
      loop: {
        maxIterations: 10,
      },
    };

    mockContext = createMockContext({
      mockConfig: mockConfig,
      cwd: '/test/dir',
    });

    // Override copilotRunner to match test expectations
    vi.mocked(mockContext.copilotRunner.run).mockResolvedValue({
      isSuccess: true,
      exitCode: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CommandRegistry', () => {
    it('should create a CommandRegistry instance', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);

      expect(registry).toBeDefined();
      expect(registry).toBeInstanceOf(CommandRegistry);
    });

    it('should register all core commands', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      const commands = program.commands.map((cmd: Command) => cmd.name());
      expect(commands).toContain('init');
      expect(commands).toContain('plan');
      expect(commands).toContain('task');
      expect(commands).toContain('refactor');
      expect(commands).toContain('run');
      expect(commands).toContain('yolo');
      expect(commands).toContain('status');
      expect(commands).toContain('clean');
    });

    it('should register yolo command with expected options and help text', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();
      const yoloCmd = program.commands.find(
        (cmd: Command) => cmd.name() === 'yolo'
      );

      expect(yoloCmd).toBeDefined();
      const optionNames = yoloCmd?.options.map(
        (opt: { long?: string }) => opt.long
      );
      expect(optionNames).toContain('--prompt');
      expect(optionNames).toContain('--input');
      expect(optionNames).toContain('--output');
      expect(optionNames).toContain('--force');
      expect(optionNames).toContain('--verbose');
      expect(yoloCmd?.description()).toContain('plan -> task -> run');
    });

    it('UT-CLI01: should register --verify option on run command', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();
      const runCmd = program.commands.find(
        (cmd: Command) => cmd.name() === 'run'
      );

      expect(runCmd).toBeDefined();
      const verifyOpt = runCmd?.options.find(
        (opt: { long?: string; description?: string }) =>
          opt.long === '--verify'
      );
      expect(verifyOpt).toBeDefined();
      expect(verifyOpt?.description).toMatch(/MVT|verification/i);
    });

    it('UT-CLI02: should not register --verify option on yolo command', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();
      const yoloCmd = program.commands.find(
        (cmd: Command) => cmd.name() === 'yolo'
      );

      expect(yoloCmd).toBeDefined();
      const verifyOpt = yoloCmd?.options.find(
        (opt: { long?: string }) => opt.long === '--verify'
      );
      expect(verifyOpt).toBeUndefined();
    });

    it('should register command aliases', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      const initCmd = program.commands.find(
        (cmd: Command) => cmd.name() === 'init'
      );
      expect(initCmd?.aliases()).toContain('i');

      const planCmd = program.commands.find(
        (cmd: Command) => cmd.name() === 'plan'
      );
      expect(planCmd?.aliases()).toContain('p');

      const statusCmd = program.commands.find(
        (cmd: Command) => cmd.name() === 'status'
      );
      expect(statusCmd?.aliases()).toContain('s');
    });

    it('should configure program metadata', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      expect(program.name()).toBe('speci');
      expect(program.description()).toContain(
        'implementation loop orchestrator'
      );
    });

    it('should have version option configured', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      const versionOption = program.options.find(
        (opt: { short?: string; long?: string }) =>
          opt.short === '-V' || opt.long === '--version'
      );
      expect(versionOption).toBeDefined();
    });

    it('should have verbose option configured', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      const verboseOption = program.options.find(
        (opt: { short?: string; long?: string }) =>
          opt.short === '-v' || opt.long === '--verbose'
      );
      expect(verboseOption).toBeDefined();
    });

    it('should have no-color option configured', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      const noColorOption = program.options.find(
        (opt: { long?: string }) => opt.long === '--no-color'
      );
      expect(noColorOption).toBeDefined();
    });
  });

  describe('execute()', () => {
    it('should parse arguments and execute commands', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const parseSpy = vi.spyOn(registry.getProgram(), 'parseAsync');

      // Use a command that won't actually execute (mock the status command)
      vi.mock('../../lib/commands/status.js', () => ({
        status: vi.fn().mockResolvedValue({ success: true, exitCode: 0 }),
      }));

      await registry.execute(['status', '--once']);

      expect(parseSpy).toHaveBeenCalled();

      vi.unmock('../../lib/commands/status.js');
    });

    it('should execute yolo action with parsed options', async () => {
      vi.resetModules();
      const yoloMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });
      vi.doMock('../../lib/commands/yolo.js', () => ({ yolo: yoloMock }));

      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      await registry.execute(['yolo', '--prompt', 'Build API']);

      expect(yoloMock).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Build API' }),
        mockContext,
        mockConfig
      );
      vi.doUnmock('../../lib/commands/yolo.js');
    });

    it('should handle empty arguments (show help)', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();
      const helpSpy = vi.spyOn(program, 'help').mockImplementation(() => {
        return undefined as never;
      });

      await registry.execute([]);

      expect(helpSpy).toHaveBeenCalled();
    });
  });

  describe('unknown command handler', () => {
    it('should register unknown command handler', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      // Verify the command:* event handler exists
      // Commander.js extends EventEmitter but TS types don't include listeners()
      const listeners = (program as unknown as EventEmitter).listeners(
        'command:*'
      );
      expect(listeners.length).toBeGreaterThan(0);
    });

    it('should have access to findSimilarCommands function', async () => {
      // Verify the suggest module is available
      const { findSimilarCommands } =
        await import('../../lib/utils/suggest.js');

      const suggestions = findSimilarCommands('runn', ['run', 'init', 'plan']);
      expect(suggestions).toContain('run');
    });
  });

  describe('M3 integration', () => {
    it('registers clean command with alias c', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const cleanCmd = registry
        .getProgram()
        .commands.find((cmd: Command) => cmd.name() === 'clean');

      expect(cleanCmd).toBeDefined();
      expect(cleanCmd?.aliases()).toContain('c');
    });

    it('registers --clean option on task command', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const taskCmd = registry
        .getProgram()
        .commands.find((cmd: Command) => cmd.name() === 'task');
      const optionNames = taskCmd?.options.map(
        (opt: { long?: string }) => opt.long
      );

      expect(taskCmd).toBeDefined();
      expect(optionNames).toContain('--clean');
    });

    it('includes clean in available unknown command suggestions list', async () => {
      const { AVAILABLE_COMMANDS } =
        await import('../../lib/cli/command-registry.js');

      expect(AVAILABLE_COMMANDS).toContain('clean');
    });

    it('includes canonical clean help examples', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const cleanCmd = registry
        .getProgram()
        .commands.find((cmd: Command) => cmd.name() === 'clean');

      let helpText = '';
      cleanCmd?.configureOutput({
        writeOut: (str) => {
          helpText += str;
        },
      });
      cleanCmd?.outputHelp();

      expect(helpText).toContain('speci clean');
      expect(helpText).toContain('speci c');
      expect(helpText).toContain('speci task --clean -p plan.md');
    });

    it('routes all registered command actions to their command functions', async () => {
      vi.resetModules();
      const initMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });
      const planMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });
      const taskMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });
      const refactorMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });
      const runMock = vi.fn().mockResolvedValue({ success: true, exitCode: 0 });
      const yoloMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });
      const statusMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });
      const cleanMock = vi
        .fn()
        .mockResolvedValue({ success: true, exitCode: 0 });

      vi.doMock('@/commands/init.js', () => ({ init: initMock }));
      vi.doMock('@/commands/plan.js', () => ({ plan: planMock }));
      vi.doMock('@/commands/task.js', () => ({ task: taskMock }));
      vi.doMock('@/commands/refactor.js', () => ({ refactor: refactorMock }));
      vi.doMock('@/commands/run.js', () => ({ run: runMock }));
      vi.doMock('@/commands/yolo.js', () => ({ yolo: yoloMock }));
      vi.doMock('@/commands/status.js', () => ({ status: statusMock }));
      vi.doMock('@/commands/clean.js', () => ({ clean: cleanMock }));

      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');
      const registry = new CommandRegistry(mockContext, mockConfig);

      await registry.execute(['init']);
      await registry.execute(['plan']);
      await registry.execute(['task']);
      await registry.execute(['refactor']);
      await registry.execute(['run']);
      await registry.execute(['yolo']);
      await registry.execute(['status', '--once']);
      await registry.execute(['clean']);

      for (const commandMock of [
        initMock,
        planMock,
        taskMock,
        refactorMock,
        runMock,
        yoloMock,
        statusMock,
        cleanMock,
      ]) {
        expect(commandMock).toHaveBeenCalledWith(
          expect.any(Object),
          mockContext,
          mockConfig
        );
      }

      vi.doUnmock('@/commands/init.js');
      vi.doUnmock('@/commands/plan.js');
      vi.doUnmock('@/commands/task.js');
      vi.doUnmock('@/commands/refactor.js');
      vi.doUnmock('@/commands/run.js');
      vi.doUnmock('@/commands/yolo.js');
      vi.doUnmock('@/commands/status.js');
      vi.doUnmock('@/commands/clean.js');
    });

    it('handles PreflightError thrown by clean command action', async () => {
      vi.resetModules();
      const { PreflightError } = await import('../../lib/utils/preflight.js');
      const preflightError = new PreflightError(
        'Configuration not found',
        'No speci.config.json found',
        ['Run `speci init`']
      );
      const cleanMock = vi.fn().mockRejectedValue(preflightError);
      const exitWithCleanupMock = vi.fn(async () => undefined as never);
      vi.doMock('@/commands/clean.js', () => ({ clean: cleanMock }));
      vi.doMock('@/utils/exit.js', () => ({
        exitWithCleanup: exitWithCleanupMock,
      }));

      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');
      const registry = new CommandRegistry(mockContext, mockConfig);
      const handleSpy = vi.spyOn(
        registry as unknown as {
          handlePreflightError: (err: unknown) => Promise<boolean>;
        },
        'handlePreflightError'
      );

      await registry.execute(['clean']);
      expect(cleanMock).toHaveBeenCalledOnce();
      expect(handleSpy).toHaveBeenCalledWith(preflightError);
      expect(exitWithCleanupMock).toHaveBeenCalledWith(2);

      vi.doUnmock('@/commands/clean.js');
      vi.doUnmock('@/utils/exit.js');
    });

    it('rethrows non-Preflight errors thrown by clean command action', async () => {
      vi.resetModules();
      const genericError = new Error('clean failed');
      const cleanMock = vi.fn().mockRejectedValue(genericError);
      const exitWithCleanupMock = vi.fn(async () => undefined as never);
      vi.doMock('@/commands/clean.js', () => ({ clean: cleanMock }));
      vi.doMock('@/utils/exit.js', () => ({
        exitWithCleanup: exitWithCleanupMock,
      }));

      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');
      const registry = new CommandRegistry(mockContext, mockConfig);
      const handleSpy = vi.spyOn(
        registry as unknown as {
          handlePreflightError: (err: unknown) => Promise<boolean>;
        },
        'handlePreflightError'
      );

      await expect(registry.execute(['clean'])).rejects.toThrow('clean failed');
      expect(cleanMock).toHaveBeenCalledOnce();
      expect(handleSpy).toHaveBeenCalledWith(genericError);
      expect(exitWithCleanupMock).not.toHaveBeenCalled();

      vi.doUnmock('@/commands/clean.js');
      vi.doUnmock('@/utils/exit.js');
    });
  });

  describe('preAction hook', () => {
    it('should enable verbose mode when --verbose flag is set', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');

      // Mock the status command to prevent it from actually running
      vi.mock('../../lib/commands/status.js', () => ({
        status: vi.fn().mockResolvedValue({ success: true, exitCode: 0 }),
      }));

      const registry = new CommandRegistry(mockContext, mockConfig);

      // Create a command with verbose option to test the hook
      const program = registry.getProgram();
      await program.parseAsync([
        'node',
        'speci',
        'status',
        '--verbose',
        '--once',
      ]);

      expect(mockContext.logger.setVerbose).toHaveBeenCalledWith(true);

      vi.unmock('../../lib/commands/status.js');
    });
  });
});
