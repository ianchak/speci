/**
 * Command Registry Module
 *
 * Handles command registration and routing for the CLI.
 * Extracted from bin/speci.ts to improve separation of concerns.
 */

import { Command } from 'commander';
import { VERSION } from '@/ui/banner.js';
import { init } from '@/commands/init.js';
import { plan } from '@/commands/plan.js';
import { task } from '@/commands/task.js';
import { refactor } from '@/commands/refactor.js';
import { run } from '@/commands/run.js';
import { yolo } from '@/commands/yolo.js';
import { status } from '@/commands/status.js';
import { clean } from '@/commands/clean.js';
import { findSimilarCommands } from '@/utils/helpers/suggest.js';
import { log } from '@/utils/infrastructure/logger.js';
import { exitWithCleanup } from '@/utils/infrastructure/exit.js';
import { PreflightError } from '@/utils/helpers/preflight.js';
import { sleepAfterCommand } from '@/utils/infrastructure/sleep.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';

export const AVAILABLE_COMMANDS = [
  'init',
  'plan',
  'task',
  'refactor',
  'run',
  'yolo',
  'status',
  'clean',
] as const;

/**
 * CommandRegistry manages CLI command registration and execution
 */
export class CommandRegistry {
  private program: Command;
  private context: CommandContext;
  private config?: SpeciConfig;

  constructor(context: CommandContext, config?: SpeciConfig) {
    this.context = context;
    this.config = config;
    this.program = new Command();
    this.setupProgram();
    this.registerCommands();
    this.registerUnknownCommandHandler();
  }

  /**
   * Configure the commander program with metadata and options
   */
  private setupProgram(): void {
    this.program
      .name('speci')
      .version(VERSION, '-V, --version', 'Display version number')
      .helpOption('-h, --help', 'Display help for command')
      .helpCommand('help [command]', 'Display help for command')
      .description('Speci CLI - AI-powered implementation loop orchestrator')
      .option('-v, --verbose', 'Enable verbose output')
      .option('--no-color', 'Disable colored output')
      .hook('preAction', async (_thisCommand) => {
        // Enable verbose mode if --verbose flag is set
        const opts = _thisCommand.opts();
        if (opts.verbose) {
          this.context.logger.setVerbose(true);
          this.context.logger.debug('Verbose mode enabled');
          this.context.logger.debug(
            `Node version: ${this.context.process.version}`
          );
          this.context.logger.debug(
            `Platform: ${this.context.process.platform}`
          );
          this.context.logger.debug(
            `Arguments: ${this.context.process.argv.join(' ')}`
          );
        }
      });
  }

  /**
   * Register all CLI commands
   */
  private registerCommands(): void {
    this.registerInitCommand();
    this.registerPlanCommand();
    this.registerTaskCommand();
    this.registerRefactorCommand();
    this.registerRunCommand();
    this.registerYoloCommand();
    this.registerStatusCommand();
    this.registerCleanCommand();
  }

  /**
   * Build a command action with standardized result and preflight error handling.
   */
  private makeAction<T>(
    commandFn: (
      options: T,
      context: CommandContext,
      config?: SpeciConfig
    ) => Promise<CommandResult>
  ): (options: T, command: Command) => Promise<void> {
    return async (options: T, command: Command) => {
      const { sleepAfter, dryRun } = command.opts() as {
        sleepAfter?: boolean;
        dryRun?: boolean;
      };
      let exitCode: number | undefined;
      try {
        const result = await commandFn(options, this.context, this.config);
        if (!result.success) {
          exitCode = result.exitCode;
        }
      } catch (err) {
        const handled = await this.handlePreflightError(err);
        if (handled.handled) {
          exitCode = handled.exitCode;
        } else {
          if (sleepAfter && !dryRun) {
            await sleepAfterCommand(
              this.context.process.platform,
              this.context.logger
            );
          }
          throw err;
        }
      }
      if (sleepAfter && !dryRun) {
        await sleepAfterCommand(
          this.context.process.platform,
          this.context.logger
        );
      }
      if (exitCode !== undefined) {
        await exitWithCleanup(exitCode);
      }
    };
  }

  /**
   * Register the init command
   */
  private registerInitCommand(): void {
    this.program
      .command('init')
      .alias('i')
      .description('Initialize Speci in current project')
      .option('-u, --update-agents', 'Update agent files even if they exist')
      .option('-v, --verbose', 'Show detailed output')
      .addHelpText(
        'after',
        `
Examples:
  $ speci init              Set up Speci in current project
  $ speci init -u           Update agent files to latest version
`
      )
      .action(this.makeAction(init));
  }

  /**
   * Register the plan command
   */
  private registerPlanCommand(): void {
    this.program
      .command('plan')
      .alias('p')
      .description(
        'Generate implementation plan from prompt and/or input files'
      )
      .option('-p, --prompt <text>', 'Initial prompt describing what to plan')
      .option(
        '-i, --input <files...>',
        'Input files for context (design docs, specs)'
      )
      .option('-o, --output <path>', 'Output plan to file')
      .option('-v, --verbose', 'Show detailed output')
      .option('--sleep-after', 'Put machine to sleep after command completes')
      .addHelpText(
        'after',
        `
Examples:
  $ speci plan -p "Build a REST API"              Plan with initial prompt
  $ speci plan -i docs/design.md                  Plan using design doc as context
  $ speci plan -i spec.md -p "Focus on auth"      Combine input files with prompt
  $ speci plan -i design.md -o docs/plan.md       Save plan to specific file
`
      )
      .action(this.makeAction(plan));
  }

  /**
   * Register the task command
   */
  private registerTaskCommand(): void {
    this.program
      .command('task')
      .alias('t')
      .description('Generate tasks and progress file from implementation plan')
      .option('-p, --plan <path>', 'Path to plan file')
      .option('-v, --verbose', 'Show detailed output')
      .option('-c, --clean', 'Clean task files and progress before generating')
      .option('--sleep-after', 'Put machine to sleep after command completes')
      .addHelpText(
        'after',
        `
Examples:
  $ speci task --plan docs/plan.md     Generate tasks from plan
  $ speci t -p docs/plan.md            Short alias version
`
      )
      .action(this.makeAction(task));
  }

  /**
   * Register the refactor command
   */
  private registerRefactorCommand(): void {
    this.program
      .command('refactor')
      .alias('r')
      .description('Analyze codebase for refactoring opportunities')
      .option('-s, --scope <path>', 'Directory or glob pattern to analyze')
      .option('-o, --output <path>', 'Output refactoring plan to file')
      .option('-v, --verbose', 'Show detailed output')
      .addHelpText(
        'after',
        `
Examples:
  $ speci refactor                     Analyze entire project
  $ speci refactor --scope lib/        Analyze specific directory
  $ speci r -s "lib/**/*.ts"           Analyze TypeScript files only
`
      )
      .action(this.makeAction(refactor));
  }

  /**
   * Register the run command
   */
  private registerRunCommand(): void {
    this.program
      .command('run')
      .description('Execute the implementation loop')
      .option('--max-iterations <n>', 'Maximum loop iterations', parseInt)
      .option('--dry-run', 'Show what would execute without running')
      .option('--force', 'Override existing lock')
      .option('-y, --yes', 'Skip confirmation prompt')
      .option('-v, --verbose', 'Show detailed output')
      .option('--sleep-after', 'Put machine to sleep after command completes')
      .option(
        '--verify',
        'Pause on manual verification tasks (MVTs) at milestone boundaries'
      )
      .addHelpText(
        'after',
        `
Examples:
  $ speci run                          Start implementation loop
  $ speci run --max-iterations 5       Limit to 5 iterations
  $ speci run --dry-run                Preview actions without executing
`
      )
      .action(this.makeAction(run));
  }

  /**
   * Register the yolo command
   */
  private registerYoloCommand(): void {
    this.program
      .command('yolo')
      .description('Execute plan -> task -> run pipeline in unattended mode')
      .option('-p, --prompt <text>', 'Initial prompt describing what to plan')
      .option(
        '-i, --input <files...>',
        'Input files for context (design docs, specs)'
      )
      .option('-o, --output <path>', 'Output plan to file')
      .option('--force', 'Override existing lock')
      .option('-v, --verbose', 'Show detailed output')
      .option('--sleep-after', 'Put machine to sleep after command completes')
      .addHelpText(
        'after',
        `
Examples:
  $ speci yolo -p "Build a REST API"              Run full pipeline from prompt
  $ speci yolo -i docs/design.md                  Run using design docs as context
`
      )
      .action(this.makeAction(yolo));
  }

  /**
   * Register the status command
   */
  private registerStatusCommand(): void {
    this.program
      .command('status')
      .alias('s')
      .description(
        'Show current loop state and task statistics (live fullscreen dashboard)'
      )
      .option('--json', 'Output status as JSON and exit')
      .option('--once', 'Show status once and exit (non-interactive)')
      .option('-v, --verbose', 'Show detailed status')
      .addHelpText(
        'after',
        `
Examples:
  $ speci status                       Live fullscreen dashboard (press q to quit)
  $ speci s --once                     Show status once and exit
  $ speci s --json                     Output as JSON for scripts
  $ speci status --verbose             Detailed status information
`
      )
      .action(this.makeAction(status));
  }

  /**
   * Register the clean command
   */
  private registerCleanCommand(): void {
    this.program
      .command('clean')
      .alias('c')
      .description('Remove generated task files and progress file')
      .option('-v, --verbose', 'Show detailed output')
      .option('-y, --yes', 'Skip confirmation prompt')
      .addHelpText(
        'after',
        `
Examples:
  $ speci clean                        Remove generated task files and progress file
  $ speci clean --yes                  Skip confirmation prompt
  $ speci c                            Short alias version
  $ speci task --clean -p plan.md      Clean before generating tasks
`
      )
      .action(this.makeAction(clean));
  }

  /**
   * Register handler for unknown commands
   */
  private registerUnknownCommandHandler(): void {
    this.program.on('command:*', async (operands) => {
      const unknownCmd = operands[0];
      const suggestions = findSimilarCommands(unknownCmd, [
        ...AVAILABLE_COMMANDS,
      ]);

      log.error(`Unknown command '${unknownCmd}'`);

      if (suggestions.length > 0) {
        log.infoPlain(`Did you mean: speci ${suggestions[0]}?`);
      }

      log.info('Available commands:');
      AVAILABLE_COMMANDS.forEach((cmd) => log.muted(`  ${cmd}`));

      await exitWithCleanup(2);
    });
  }

  /**
   * Handle preflight errors consistently across all commands.
   * Returns handled metadata for caller-controlled exit handling.
   */
  private async handlePreflightError(
    err: unknown
  ): Promise<{ handled: true; exitCode: number } | { handled: false }> {
    if (err instanceof PreflightError) {
      log.error(`Preflight check failed: ${err.check}`);
      log.error(err.message);
      log.infoPlain('\nTo fix this:');
      for (const step of err.remediation) {
        log.muted(`  • ${step}`);
      }
      return { handled: true, exitCode: err.exitCode };
    }
    return { handled: false };
  }

  /**
   * Get the Commander program instance
   */
  public getProgram(): Command {
    return this.program;
  }

  /**
   * Execute the CLI with the given arguments
   *
   * @param args - Command line arguments (without node and script path)
   */
  public async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.program.help();
      return;
    }

    await this.program.parseAsync(['node', 'speci', ...args]);
  }
}
