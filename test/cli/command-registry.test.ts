import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { EventEmitter } from 'node:events';
import type { CommandContext } from '../../lib/interfaces.js';
import type { SpeciConfig } from '../../lib/types.js';
import { createMockContext } from '../../lib/adapters/test-context.js';

type PreflightHandleResult =
  | { handled: true; exitCode: number }
  | { handled: false };

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
          handlePreflightError: (
            err: unknown
          ) => Promise<PreflightHandleResult>;
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
          handlePreflightError: (
            err: unknown
          ) => Promise<PreflightHandleResult>;
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

    describe('handlePreflightError refactor (TASK_003)', () => {
      it('returns handled=true with exitCode for PreflightError', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const { PreflightError } = await import('../../lib/utils/preflight.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const preflightError = new PreflightError(
          'Configuration not found',
          'No speci.config.json found',
          ['Run `speci init`']
        );

        const result = await (
          registry as unknown as {
            handlePreflightError: (
              err: unknown
            ) => Promise<PreflightHandleResult>;
          }
        ).handlePreflightError(preflightError);

        expect(result).toEqual({ handled: true, exitCode: 2 });
      });

      it('returns handled=false for non-Preflight Error', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);

        const result = await (
          registry as unknown as {
            handlePreflightError: (
              err: unknown
            ) => Promise<PreflightHandleResult>;
          }
        ).handlePreflightError(new Error('boom'));

        expect(result).toEqual({ handled: false });
      });

      it('returns handled=false for non-Error throwables', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);

        const result = await (
          registry as unknown as {
            handlePreflightError: (
              err: unknown
            ) => Promise<PreflightHandleResult>;
          }
        ).handlePreflightError('boom');

        expect(result).toEqual({ handled: false });
      });

      it('makeAction closure accepts Command as second arg', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const action = (
          registry as unknown as {
            makeAction: <T>(
              commandFn: (
                options: T,
                context: CommandContext,
                config: SpeciConfig
              ) => Promise<{ success: boolean; exitCode: number }>
            ) => (options: T, command: Command) => Promise<void>;
          }
        ).makeAction(async () => ({ success: true, exitCode: 0 }));

        await expect(action({}, new Command())).resolves.toBeUndefined();
      });
    });

    describe('--sleep-after integration (TASK_004)', () => {
      const createActionWithMocks = async (
        commandFn: (
          options: Record<string, unknown>,
          context: CommandContext,
          config: SpeciConfig
        ) => Promise<{ success: boolean; exitCode: number }>
      ) => {
        vi.resetModules();
        const sleepAfterCommandMock = vi.fn().mockResolvedValue(undefined);
        const exitWithCleanupMock = vi.fn(async () => undefined as never);
        vi.doMock('@/utils/sleep.js', () => ({
          sleepAfterCommand: sleepAfterCommandMock,
        }));
        vi.doMock('@/utils/exit.js', () => ({
          exitWithCleanup: exitWithCleanupMock,
        }));
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const action = (
          registry as unknown as {
            makeAction: (
              fn: (
                options: Record<string, unknown>,
                context: CommandContext,
                config: SpeciConfig
              ) => Promise<{ success: boolean; exitCode: number }>
            ) => (
              options: Record<string, unknown>,
              command: Command
            ) => Promise<void>;
          }
        ).makeAction(commandFn);
        const cleanup = () => {
          vi.doUnmock('@/utils/sleep.js');
          vi.doUnmock('@/utils/exit.js');
        };
        return { action, sleepAfterCommandMock, exitWithCleanupMock, cleanup };
      };

      it('IT-1: calls sleepAfterCommand when --sleep-after is true', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        expect(sleepAfterCommandMock).toHaveBeenCalledWith(
          mockContext.process.platform,
          mockContext.logger
        );
        cleanup();
      });

      it('IT-2: does not call sleepAfterCommand when --sleep-after is absent', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = { opts: () => ({}) } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).not.toHaveBeenCalled();
        cleanup();
      });

      it('IT-3: skips sleep when --dry-run and --sleep-after are both true', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = {
          opts: () => ({ sleepAfter: true, dryRun: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).not.toHaveBeenCalled();
        cleanup();
      });

      it('IT-4: calls sleep before exit on command failure result', async () => {
        const { action, sleepAfterCommandMock, exitWithCleanupMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: false,
            exitCode: 1,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        expect(exitWithCleanupMock).toHaveBeenCalledWith(1);
        expect(sleepAfterCommandMock.mock.invocationCallOrder[0]).toBeLessThan(
          exitWithCleanupMock.mock.invocationCallOrder[0]
        );
        cleanup();
      });

      it('IT-5: calls sleep on generic thrown Error and rethrows', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => {
            throw new Error('boom');
          });
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await expect(action({}, command)).rejects.toThrow('boom');
        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        cleanup();
      });

      it('IT-6: includes --sleep-after on plan command', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const planCmd = registry
          .getProgram()
          .commands.find((cmd: Command) => cmd.name() === 'plan');
        const optionNames = planCmd?.options.map(
          (opt: { long?: string }) => opt.long
        );

        expect(optionNames).toContain('--sleep-after');
      });

      it('IT-7: includes --sleep-after on task command', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const taskCmd = registry
          .getProgram()
          .commands.find((cmd: Command) => cmd.name() === 'task');
        const optionNames = taskCmd?.options.map(
          (opt: { long?: string }) => opt.long
        );

        expect(optionNames).toContain('--sleep-after');
      });

      it('IT-8: includes --sleep-after on run command', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const runCmd = registry
          .getProgram()
          .commands.find((cmd: Command) => cmd.name() === 'run');
        const optionNames = runCmd?.options.map(
          (opt: { long?: string }) => opt.long
        );

        expect(optionNames).toContain('--sleep-after');
      });

      it('IT-9: includes --sleep-after on yolo command', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const yoloCmd = registry
          .getProgram()
          .commands.find((cmd: Command) => cmd.name() === 'yolo');
        const optionNames = yoloCmd?.options.map(
          (opt: { long?: string }) => opt.long
        );

        expect(optionNames).toContain('--sleep-after');
      });

      it('IT-10: preserves original exit code when sleeping on failure', async () => {
        const { action, exitWithCleanupMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: false,
            exitCode: 1,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(exitWithCleanupMock).toHaveBeenCalledWith(1);
        cleanup();
      });

      it('IT-11: invokes sleep after command cleanup work', async () => {
        const cleanupWorkMock = vi.fn();
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => {
            cleanupWorkMock();
            return { success: true, exitCode: 0 };
          });
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(cleanupWorkMock).toHaveBeenCalledOnce();
        expect(cleanupWorkMock.mock.invocationCallOrder[0]).toBeLessThan(
          sleepAfterCommandMock.mock.invocationCallOrder[0]
        );
        cleanup();
      });

      it('IT-12: sleeps before exit for PreflightError path', async () => {
        vi.resetModules();
        const sleepAfterCommandMock = vi.fn().mockResolvedValue(undefined);
        const exitWithCleanupMock = vi.fn(async () => undefined as never);
        vi.doMock('@/utils/sleep.js', () => ({
          sleepAfterCommand: sleepAfterCommandMock,
        }));
        vi.doMock('@/utils/exit.js', () => ({
          exitWithCleanup: exitWithCleanupMock,
        }));
        const { PreflightError } = await import('../../lib/utils/preflight.js');
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const action = (
          registry as unknown as {
            makeAction: (
              fn: (
                options: Record<string, unknown>,
                context: CommandContext,
                config: SpeciConfig
              ) => Promise<{ success: boolean; exitCode: number }>
            ) => (
              options: Record<string, unknown>,
              command: Command
            ) => Promise<void>;
          }
        ).makeAction(async () => {
          throw new PreflightError('Config missing', 'no config', ['run init']);
        });
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        expect(exitWithCleanupMock).toHaveBeenCalledWith(2);
        expect(sleepAfterCommandMock.mock.invocationCallOrder[0]).toBeLessThan(
          exitWithCleanupMock.mock.invocationCallOrder[0]
        );
        vi.doUnmock('@/utils/sleep.js');
        vi.doUnmock('@/utils/exit.js');
      });

      it('IT-13: triggers sleep for instant successful command', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        cleanup();
      });

      it('IT-14: invokes sleep after async command completion', async () => {
        const completeMock = vi.fn();
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => {
            await Promise.resolve();
            completeMock();
            return { success: true, exitCode: 0 };
          });
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(completeMock.mock.invocationCallOrder[0]).toBeLessThan(
          sleepAfterCommandMock.mock.invocationCallOrder[0]
        );
        cleanup();
      });

      it('IT-15: triggers sleep for early-exit success result', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        cleanup();
      });

      it('IT-16: calls sleep for non-Error throwable and rethrows value', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => {
            throw 'unexpected';
          });
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await expect(action({}, command)).rejects.toBe('unexpected');
        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        cleanup();
      });

      it('IT-17: passes DI platform value into sleepAfterCommand', async () => {
        mockContext.process.platform = 'darwin';
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock).toHaveBeenCalledWith(
          'darwin',
          mockContext.logger
        );
        cleanup();
      });

      it('IT-18: passes context logger reference into sleepAfterCommand', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(sleepAfterCommandMock.mock.calls[0][1]).toBe(mockContext.logger);
        cleanup();
      });

      it('IT-19: does not include --sleep-after on init/status/clean/refactor', async () => {
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const commandNames = ['init', 'status', 'clean', 'refactor'];

        for (const commandName of commandNames) {
          const cmd = registry
            .getProgram()
            .commands.find((c: Command) => c.name() === commandName);
          const optionNames = cmd?.options.map(
            (opt: { long?: string }) => opt.long
          );
          expect(optionNames).not.toContain('--sleep-after');
        }
      });

      it('IT-20: preflight handled result is consumed before exit', async () => {
        vi.resetModules();
        const sleepAfterCommandMock = vi.fn().mockResolvedValue(undefined);
        const exitWithCleanupMock = vi.fn(async () => undefined as never);
        vi.doMock('@/utils/sleep.js', () => ({
          sleepAfterCommand: sleepAfterCommandMock,
        }));
        vi.doMock('@/utils/exit.js', () => ({
          exitWithCleanup: exitWithCleanupMock,
        }));
        const { PreflightError } = await import('../../lib/utils/preflight.js');
        const { CommandRegistry } =
          await import('../../lib/cli/command-registry.js');
        const registry = new CommandRegistry(mockContext, mockConfig);
        const action = (
          registry as unknown as {
            makeAction: (
              fn: (
                options: Record<string, unknown>,
                context: CommandContext,
                config: SpeciConfig
              ) => Promise<{ success: boolean; exitCode: number }>
            ) => (
              options: Record<string, unknown>,
              command: Command
            ) => Promise<void>;
          }
        ).makeAction(async () => {
          throw new PreflightError('Copilot missing', 'missing', ['install']);
        });
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({}, command);

        expect(exitWithCleanupMock).toHaveBeenCalledWith(2);
        expect(sleepAfterCommandMock.mock.invocationCallOrder[0]).toBeLessThan(
          exitWithCleanupMock.mock.invocationCallOrder[0]
        );
        vi.doUnmock('@/utils/sleep.js');
        vi.doUnmock('@/utils/exit.js');
      });

      it('IT-21: reads sleepAfter from command.opts(), not options object', async () => {
        const { action, sleepAfterCommandMock, cleanup } =
          await createActionWithMocks(async () => ({
            success: true,
            exitCode: 0,
          }));
        const command = {
          opts: () => ({ sleepAfter: true }),
        } as unknown as Command;

        await action({ sleepAfter: false }, command);

        expect(sleepAfterCommandMock).toHaveBeenCalledOnce();
        cleanup();
      });
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
