/**
 * Command Registry Module
 *
 * Handles command registration and routing for the CLI.
 * Extracted from bin/speci.ts to improve separation of concerns.
 */

import { Command } from 'commander';
import { VERSION } from '../ui/banner.js';
import { init } from '../commands/init.js';
import { plan } from '../commands/plan.js';
import { task } from '../commands/task.js';
import { refactor } from '../commands/refactor.js';
import { run } from '../commands/run.js';
import { yolo } from '../commands/yolo.js';
import { status } from '../commands/status.js';
import { findSimilarCommands } from '../utils/suggest.js';
import { debug, log } from '../utils/logger.js';
import { exitWithCleanup } from '../utils/exit.js';
import { PreflightError } from '../utils/preflight.js';
import type { CommandContext } from '../interfaces.js';
import type { SpeciConfig } from '../types.js';

/**
 * CommandRegistry manages CLI command registration and execution
 */
export class CommandRegistry {
  private program: Command;
  private context: CommandContext;
  private config: SpeciConfig;

  constructor(context: CommandContext, config: SpeciConfig) {
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
      .description('Speci CLI - AI-powered implementation loop orchestrator')
      .option('-v, --verbose', 'Enable verbose output')
      .option('--no-color', 'Disable colored output')
      .hook('preAction', async (_thisCommand) => {
        // Enable verbose mode if --verbose flag is set
        const opts = _thisCommand.opts();
        if (opts.verbose) {
          this.context.logger.setVerbose(true);
          debug('Verbose mode enabled');
          debug('Node version', process.version);
          debug('Platform', process.platform);
          debug('Arguments', process.argv);
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
      .action(async (options) => {
        try {
          const result = await init(options, this.context, this.config);
          if (!result.success) {
            await exitWithCleanup(result.exitCode);
          }
        } catch (err) {
          this.handlePreflightError(err);
        }
      });
  }

  /**
   * Register the plan command
   */
  private registerPlanCommand(): void {
    this.program
      .command('plan')
      .alias('p')
      .description('Generate implementation plan interactively')
      .option('-p, --prompt <text>', 'Initial prompt describing what to plan')
      .option(
        '-i, --input <files...>',
        'Input files for context (design docs, specs)'
      )
      .option('-o, --output <path>', 'Output plan to file')
      .option('-v, --verbose', 'Show detailed output')
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
      .action(async (options) => {
        try {
          const result = await plan(options, this.context, this.config);
          if (!result.success) {
            await exitWithCleanup(result.exitCode);
          }
        } catch (err) {
          this.handlePreflightError(err);
        }
      });
  }

  /**
   * Register the task command
   */
  private registerTaskCommand(): void {
    this.program
      .command('task')
      .alias('t')
      .description('Generate tasks from implementation plan')
      .option('-p, --plan <path>', 'Path to plan file')
      .option('-v, --verbose', 'Show detailed output')
      .addHelpText(
        'after',
        `
Examples:
  $ speci task --plan docs/plan.md     Generate tasks from plan
  $ speci t -p docs/plan.md            Short alias version
`
      )
      .action(async (options) => {
        try {
          const result = await task(options, this.context, this.config);
          if (!result.success) {
            await exitWithCleanup(result.exitCode);
          }
        } catch (err) {
          this.handlePreflightError(err);
        }
      });
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
      .action(async (options) => {
        try {
          const result = await refactor(options, this.context, this.config);
          if (!result.success) {
            await exitWithCleanup(result.exitCode);
          }
        } catch (err) {
          this.handlePreflightError(err);
        }
      });
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
      .addHelpText(
        'after',
        `
Examples:
  $ speci run                          Start implementation loop
  $ speci run --max-iterations 5       Limit to 5 iterations
  $ speci run --dry-run                Preview actions without executing
`
      )
      .action(async (options) => {
        try {
          const result = await run(options, this.context, this.config);
          if (!result.success) {
            await exitWithCleanup(result.exitCode);
          }
        } catch (err) {
          this.handlePreflightError(err);
        }
      });
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
      .option('-a, --agent <path>', 'Custom agent path override')
      .option('--force', 'Override existing lock')
      .option('-v, --verbose', 'Show detailed output')
      .addHelpText(
        'after',
        `
Examples:
  $ speci yolo -p "Build a REST API"              Run full pipeline from prompt
  $ speci yolo -i docs/design.md                  Run using design docs as context
  $ speci yolo -i spec.md --agent .github/agents/speci-plan.agent.md
`
      )
      .action(async (options) => {
        try {
          const result = await yolo(options, this.context, this.config);
          if (!result.success) {
            await exitWithCleanup(result.exitCode);
          }
        } catch (err) {
          this.handlePreflightError(err);
        }
      });
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
      .action(async (options) => {
        try {
          const result = await status(options, this.context, this.config);
          if (!result.success) {
            await exitWithCleanup(result.exitCode);
          }
        } catch (err) {
          this.handlePreflightError(err);
        }
      });
  }

  /**
   * Register handler for unknown commands
   */
  private registerUnknownCommandHandler(): void {
    const availableCommands = [
      'init',
      'plan',
      'task',
      'refactor',
      'run',
      'yolo',
      'status',
    ];

    this.program.on('command:*', async (operands) => {
      const unknownCmd = operands[0];
      const suggestions = findSimilarCommands(unknownCmd, availableCommands);

      log.error(`Unknown command '${unknownCmd}'`);

      if (suggestions.length > 0) {
        log.infoPlain(`Did you mean: speci ${suggestions[0]}?`);
      }

      log.info('Available commands:');
      availableCommands.forEach((cmd) => log.muted(`  ${cmd}`));

      await exitWithCleanup(2);
    });
  }

  /**
   * Handle preflight errors consistently across all commands
   */
  private handlePreflightError(err: unknown): void {
    if (err instanceof PreflightError) {
      log.error(`Preflight check failed: ${err.check}`);
      log.error(err.message);
      log.infoPlain('\nTo fix this:');
      for (const step of err.remediation) {
        log.muted(`  • ${step}`);
      }
      exitWithCleanup(err.exitCode);
    }
    throw err;
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
