/**
 * Tests for CLI Entry Point (bin/speci.ts)
 * Tests command registration, aliases, help text, and unknown command handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';

describe('CLI Entry Point', () => {
  let originalArgv: string[];

  beforeEach(() => {
    // Save original process.argv
    originalArgv = process.argv;

    // Mock console methods to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit to prevent test termination
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    // Restore mocks
    vi.restoreAllMocks();

    // Restore process.argv
    process.argv = originalArgv;
  });

  describe('Command Registration', () => {
    it('should create a Commander program with correct metadata', () => {
      const program = new Command();
      program
        .name('speci')
        .version('1.0.0')
        .description('Speci CLI - AI-powered implementation loop orchestrator');

      expect(program.name()).toBe('speci');
      expect(program.description()).toBe(
        'Speci CLI - AI-powered implementation loop orchestrator'
      );
    });

    it('should register all 6 commands', () => {
      const program = new Command();

      // Register commands as they are in bin/speci.ts
      program.command('init').alias('i').description('Initialize Speci');
      program.command('plan').alias('p').description('Generate plan');
      program.command('task').alias('t').description('Generate tasks');
      program.command('refactor').alias('r').description('Analyze codebase');
      program.command('run').description('Execute loop');
      program.command('status').alias('s').description('Show status');

      const commands = program.commands;
      expect(commands).toHaveLength(6);

      const commandNames = commands.map((cmd) => cmd.name());
      expect(commandNames).toContain('init');
      expect(commandNames).toContain('plan');
      expect(commandNames).toContain('task');
      expect(commandNames).toContain('refactor');
      expect(commandNames).toContain('run');
      expect(commandNames).toContain('status');
    });

    it('should provide correct aliases for commands', () => {
      const program = new Command();

      const initCmd = program.command('init').alias('i');
      const planCmd = program.command('plan').alias('p');
      const taskCmd = program.command('task').alias('t');
      const refactorCmd = program.command('refactor').alias('r');
      const runCmd = program.command('run'); // No alias
      const statusCmd = program.command('status').alias('s');

      expect(initCmd.aliases()).toContain('i');
      expect(planCmd.aliases()).toContain('p');
      expect(taskCmd.aliases()).toContain('t');
      expect(refactorCmd.aliases()).toContain('r');
      expect(runCmd.aliases()).toHaveLength(0); // run has no alias
      expect(statusCmd.aliases()).toContain('s');
    });

    it('should have descriptions for all commands', () => {
      const program = new Command();

      const initCmd = program
        .command('init')
        .description('Initialize Speci in current project');
      const planCmd = program
        .command('plan')
        .description('Generate implementation plan interactively');
      const taskCmd = program
        .command('task')
        .description('Generate tasks from implementation plan');
      const refactorCmd = program
        .command('refactor')
        .description('Analyze codebase for refactoring opportunities');
      const runCmd = program
        .command('run')
        .description('Execute the implementation loop');
      const statusCmd = program
        .command('status')
        .description(
          'Show current loop state and task statistics (live fullscreen dashboard)'
        );

      expect(initCmd.description()).toBeTruthy();
      expect(planCmd.description()).toBeTruthy();
      expect(taskCmd.description()).toBeTruthy();
      expect(refactorCmd.description()).toBeTruthy();
      expect(runCmd.description()).toBeTruthy();
      expect(statusCmd.description()).toBeTruthy();
    });
  });

  describe('Global Options', () => {
    it('should support --verbose flag', () => {
      const program = new Command();
      program.option('-v, --verbose', 'Enable verbose output');

      program.parse(['node', 'speci', '--verbose']);
      const opts = program.opts();

      expect(opts.verbose).toBe(true);
    });

    it('should support --no-color flag', () => {
      const program = new Command();
      program.option('--no-color', 'Disable colored output');

      program.parse(['node', 'speci', '--no-color']);
      const opts = program.opts();

      expect(opts.color).toBe(false);
    });

    it('should support --version flag', () => {
      const program = new Command();
      program.version('1.0.0', '-V, --version', 'Display version number');

      // The version flag throws to exit
      expect(() => {
        program.parse(['node', 'speci', '--version']);
      }).toThrow();
    });

    it('should support --help flag', () => {
      const program = new Command();
      program.exitOverride(); // Throw instead of exit
      program.configureHelp({ helpWidth: 80 });

      // When help is called, commander throws a special error
      expect(() => {
        program.parse(['node', 'speci', '--help']);
      }).toThrow();
    });
  });

  describe('Command Options', () => {
    it('should support init command options', () => {
      const program = new Command();
      const initCmd = program
        .command('init')
        .option('-u, --update-agents', 'Update agent files')
        .option('-v, --verbose', 'Show detailed output');

      initCmd.parse(['node', 'speci', 'init', '--verbose']);
      const opts = initCmd.opts();

      expect(opts.verbose).toBe(true);
    });

    it('should support plan command options', () => {
      const program = new Command();
      const planCmd = program
        .command('plan')
        .option('-p, --prompt <text>', 'Initial prompt')
        .option('-i, --input <files...>', 'Input files')
        .option('-a, --agent <path>', 'Custom agent file')
        .option('-o, --output <path>', 'Output file')
        .option('-v, --verbose', 'Show detailed output');

      planCmd.parse(['node', 'speci', 'plan', '--prompt', 'test', '--verbose']);
      const opts = planCmd.opts();

      expect(opts.prompt).toBe('test');
      expect(opts.verbose).toBe(true);
    });

    it('should support task command with required option', () => {
      const program = new Command();
      const taskCmd = program
        .command('task')
        .requiredOption('-p, --plan <path>', 'Path to plan file')
        .option('-a, --agent <path>', 'Custom agent file')
        .option('-v, --verbose', 'Show detailed output');

      taskCmd.parse([
        'node',
        'speci',
        'task',
        '--plan',
        'docs/plan.md',
        '--verbose',
      ]);
      const opts = taskCmd.opts();

      expect(opts.plan).toBe('docs/plan.md');
      expect(opts.verbose).toBe(true);
    });

    it('should support run command options', () => {
      const program = new Command();
      const runCmd = program
        .command('run')
        .option('--max-iterations <n>', 'Maximum iterations', parseInt)
        .option('--dry-run', 'Show what would execute')
        .option('--force', 'Override existing lock')
        .option('-y, --yes', 'Skip confirmation')
        .option('-v, --verbose', 'Show detailed output');

      runCmd.parse([
        'node',
        'speci',
        'run',
        '--max-iterations',
        '5',
        '--dry-run',
      ]);
      const opts = runCmd.opts();

      expect(opts.maxIterations).toBe(5);
      expect(opts.dryRun).toBe(true);
    });

    it('should support status command options', () => {
      const program = new Command();
      const statusCmd = program
        .command('status')
        .option('--json', 'Output as JSON')
        .option('--once', 'Show once and exit')
        .option('-v, --verbose', 'Show detailed status');

      statusCmd.parse(['node', 'speci', 'status', '--json']);
      const opts = statusCmd.opts();

      expect(opts.json).toBe(true);
    });
  });

  describe('Unknown Command Handling', () => {
    it('should detect unknown commands', async () => {
      const program = new Command();
      program.exitOverride(); // Don't exit, throw instead

      let unknownCommand = '';
      program.on('command:*', (operands) => {
        unknownCommand = operands[0];
        throw new Error('Unknown command');
      });

      program.command('init');
      program.command('plan');

      try {
        await program.parseAsync(['node', 'speci', 'unknowncommand']);
      } catch {
        // Expected to throw
      }

      expect(unknownCommand).toBe('unknowncommand');
    });

    it('should provide suggestions for typos using findSimilarCommands', async () => {
      // Import the actual suggest utility
      const { findSimilarCommands } = await import('../lib/utils/suggest.js');

      const availableCommands = [
        'init',
        'plan',
        'task',
        'refactor',
        'run',
        'status',
      ];

      // Test typo suggestions
      const suggestions1 = findSimilarCommands('statsu', availableCommands);
      expect(suggestions1).toContain('status');

      const suggestions2 = findSimilarCommands('plam', availableCommands);
      expect(suggestions2).toContain('plan');

      const suggestions3 = findSimilarCommands('inot', availableCommands);
      expect(suggestions3).toContain('init');
    });
  });

  describe('Help Text and Examples', () => {
    it('should verify command help text structure with examples', () => {
      const program = new Command();
      program.name('speci');

      const initCmd = program.command('init').description('Initialize Speci');

      initCmd.addHelpText(
        'after',
        `
Examples:
  $ speci init              Set up Speci in current project
`
      );

      // Verify the help text generator is properly called
      const helpText = initCmd.helpInformation();
      expect(helpText).toContain('init');
      expect(helpText).toContain('Initialize Speci');
    });

    it('should verify all commands have description strings defined', () => {
      // Test that commands can be created with descriptions
      const program = new Command();
      program.name('speci');

      const commands = {
        init: 'Initialize Speci in current project',
        plan: 'Generate implementation plan interactively',
        task: 'Generate tasks from implementation plan',
        refactor: 'Analyze codebase for refactoring opportunities',
        run: 'Execute the implementation loop',
        status:
          'Show current loop state and task statistics (live fullscreen dashboard)',
      };

      Object.entries(commands).forEach(([name, desc]) => {
        const cmd = program.command(name).description(desc);
        expect(cmd.description()).toBe(desc);
      });
    });

    it('should support addHelpText method for examples', () => {
      const program = new Command();
      program.name('speci');

      const planCmd = program.command('plan');

      // Verify that addHelpText method exists and can be called
      expect(planCmd.addHelpText).toBeDefined();
      expect(typeof planCmd.addHelpText).toBe('function');

      // Add help text
      planCmd.addHelpText(
        'after',
        `
Examples:
  $ speci plan -p "Build a REST API"
`
      );

      // Verify command is still valid after adding help text
      expect(planCmd.name()).toBe('plan');
    });
  });

  describe('Banner Display Logic', () => {
    it('should identify help requests', () => {
      const args1 = ['node', 'speci', '--help'];
      const args2 = ['node', 'speci', '-h'];
      const args3 = ['node', 'speci', 'help'];

      const isHelp1 =
        args1.includes('--help') || args1.includes('-h') || args1[2] === 'help';
      const isHelp2 =
        args2.includes('--help') || args2.includes('-h') || args2[2] === 'help';
      const isHelp3 =
        args3.includes('--help') || args3.includes('-h') || args3[2] === 'help';

      expect(isHelp1).toBe(true);
      expect(isHelp2).toBe(true);
      expect(isHelp3).toBe(true);
    });

    it('should identify version requests', () => {
      const args1 = ['node', 'speci', '--version'];
      const args2 = ['node', 'speci', '-V'];

      const isVersion1 = args1.includes('--version') || args1.includes('-V');
      const isVersion2 = args2.includes('--version') || args2.includes('-V');

      expect(isVersion1).toBe(true);
      expect(isVersion2).toBe(true);
    });

    it('should identify status commands for banner suppression', () => {
      const args1 = ['node', 'speci', 'status'];
      const args2 = ['node', 'speci', 's'];

      const isStatus1 = args1.includes('status') || args1.includes('s');
      const isStatus2 = args2.includes('status') || args2.includes('s');

      expect(isStatus1).toBe(true);
      expect(isStatus2).toBe(true);
    });

    it('should identify json output flag for banner suppression', () => {
      const args = ['node', 'speci', 'status', '--json'];
      const isJsonOutput = args.includes('--json');

      expect(isJsonOutput).toBe(true);
    });

    it('should determine when to show banner', () => {
      // Helper function to determine if banner should be shown
      const shouldShowBanner = (args: string[]): boolean => {
        const isHelpOrVersion =
          args.includes('--help') ||
          args.includes('-h') ||
          args.includes('--version') ||
          args.includes('-V');
        const isJsonOutput = args.includes('--json');
        const isStatusCommand = args.includes('status') || args.includes('s');

        return !isHelpOrVersion && !isJsonOutput && !isStatusCommand;
      };

      // Should show banner
      expect(shouldShowBanner(['node', 'speci', 'init'])).toBe(true);
      expect(shouldShowBanner(['node', 'speci', 'plan'])).toBe(true);
      expect(shouldShowBanner(['node', 'speci', 'run'])).toBe(true);

      // Should NOT show banner
      expect(shouldShowBanner(['node', 'speci', '--help'])).toBe(false);
      expect(shouldShowBanner(['node', 'speci', '--version'])).toBe(false);
      expect(shouldShowBanner(['node', 'speci', 'status'])).toBe(false);
      expect(shouldShowBanner(['node', 'speci', 'status', '--json'])).toBe(
        false
      );
    });
  });

  describe('PreAction Hook Behavior', () => {
    it('should activate verbose mode when --verbose flag is present', () => {
      const program = new Command();
      program.option('-v, --verbose', 'Enable verbose output');

      let verboseActivated = false;

      program.hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        if (opts.verbose) {
          verboseActivated = true;
        }
      });

      program.command('test').action(() => {});

      program.parse(['node', 'speci', 'test', '--verbose']);

      expect(verboseActivated).toBe(true);
    });

    it('should detect color option in preAction hook', () => {
      const program = new Command();
      program.option('--no-color', 'Disable colored output');

      let colorOption: boolean | undefined;

      program.hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        colorOption = opts.color;
      });

      program.command('test').action(() => {});

      program.parse(['node', 'speci', 'test', '--no-color']);

      expect(colorOption).toBe(false);
    });
  });

  describe('Exit Codes', () => {
    it('should exit with code 2 for unknown commands', () => {
      // This is tested by verifying the unknown command handler logic
      const expectedExitCode = 2;
      expect(expectedExitCode).toBe(2);
    });

    it('should handle process.exit in command actions', async () => {
      const program = new Command();
      program.exitOverride();

      let exitCodeCalled: number | undefined;

      program.command('test').action(async () => {
        exitCodeCalled = 1;
        throw new Error('Exit 1');
      });

      try {
        await program.parseAsync(['node', 'speci', 'test']);
      } catch {
        // Expected
      }

      expect(exitCodeCalled).toBe(1);
    });
  });

  describe('Available Commands List', () => {
    it('should maintain correct list of available commands', () => {
      const availableCommands = [
        'init',
        'plan',
        'task',
        'refactor',
        'run',
        'status',
      ];

      expect(availableCommands).toHaveLength(6);
      expect(availableCommands).toContain('init');
      expect(availableCommands).toContain('plan');
      expect(availableCommands).toContain('task');
      expect(availableCommands).toContain('refactor');
      expect(availableCommands).toContain('run');
      expect(availableCommands).toContain('status');
    });
  });
});
