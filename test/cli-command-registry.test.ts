import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { EventEmitter } from 'node:events';
import type { CommandContext } from '../lib/interfaces.js';
import type { SpeciConfig } from '../lib/types.js';

describe('CommandRegistry', () => {
  let mockContext: CommandContext;
  let mockConfig: SpeciConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create minimal mock context
    mockContext = {
      logger: {
        info: vi.fn(),
        infoPlain: vi.fn(),
        warnPlain: vi.fn(),
        errorPlain: vi.fn(),
        successPlain: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
        raw: vi.fn(),
        setVerbose: vi.fn(),
      },
      configLoader: {
        load: vi.fn(),
      },
      fileSystem: {
        exists: vi.fn(),
        read: vi.fn(),
        write: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn(),
      },
      process: {
        exit: vi.fn(),
        cwd: vi.fn().mockReturnValue('/test/dir'),
        env: {},
        argv: ['node', 'speci'],
        platform: 'linux',
        stdout: { isTTY: true },
        stderr: { isTTY: true },
      },
    } as unknown as CommandContext;

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CommandRegistry', () => {
    it('should create a CommandRegistry instance', async () => {
      const { CommandRegistry } =
        await import('../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);

      expect(registry).toBeDefined();
      expect(registry).toBeInstanceOf(CommandRegistry);
    });

    it('should register all core commands', async () => {
      const { CommandRegistry } =
        await import('../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      const commands = program.commands.map((cmd: Command) => cmd.name());
      expect(commands).toContain('init');
      expect(commands).toContain('plan');
      expect(commands).toContain('task');
      expect(commands).toContain('refactor');
      expect(commands).toContain('run');
      expect(commands).toContain('status');
    });

    it('should register command aliases', async () => {
      const { CommandRegistry } =
        await import('../lib/cli/command-registry.js');

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
        await import('../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const program = registry.getProgram();

      expect(program.name()).toBe('speci');
      expect(program.description()).toContain(
        'implementation loop orchestrator'
      );
    });

    it('should have version option configured', async () => {
      const { CommandRegistry } =
        await import('../lib/cli/command-registry.js');

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
        await import('../lib/cli/command-registry.js');

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
        await import('../lib/cli/command-registry.js');

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
        await import('../lib/cli/command-registry.js');

      const registry = new CommandRegistry(mockContext, mockConfig);
      const parseSpy = vi.spyOn(registry.getProgram(), 'parseAsync');

      // Use a command that won't actually execute (mock the status command)
      vi.mock('../lib/commands/status.js', () => ({
        status: vi.fn().mockResolvedValue({ success: true, exitCode: 0 }),
      }));

      await registry.execute(['status', '--once']);

      expect(parseSpy).toHaveBeenCalled();

      vi.unmock('../lib/commands/status.js');
    });

    it('should handle empty arguments (show help)', async () => {
      const { CommandRegistry } =
        await import('../lib/cli/command-registry.js');

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
        await import('../lib/cli/command-registry.js');

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
      const { findSimilarCommands } = await import('../lib/utils/suggest.js');

      const suggestions = findSimilarCommands('runn', ['run', 'init', 'plan']);
      expect(suggestions).toContain('run');
    });
  });

  describe('preAction hook', () => {
    it('should enable verbose mode when --verbose flag is set', async () => {
      const { CommandRegistry } =
        await import('../lib/cli/command-registry.js');

      // Mock the status command to prevent it from actually running
      vi.mock('../lib/commands/status.js', () => ({
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

      vi.unmock('../lib/commands/status.js');
    });
  });
});
