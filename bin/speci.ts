#!/usr/bin/env tsx
/**
 * Speci CLI Entry Point
 *
 * Main entry point for the speci CLI tool.
 * Sets up Commander.js command routing and displays the application banner.
 */

import { Command } from 'commander';
import { renderBanner, VERSION } from '../lib/ui/banner.js';
import { animateBanner, shouldAnimate } from '../lib/ui/banner-animation.js';
import { init } from '../lib/commands/init.js';
import { plan } from '../lib/commands/plan.js';
import { task } from '../lib/commands/task.js';
import { refactor } from '../lib/commands/refactor.js';
import { run } from '../lib/commands/run.js';
import { status } from '../lib/commands/status.js';
import { findSimilarCommands } from '../lib/utils/suggest.js';
import { setVerbose, debug, log } from '../lib/utils/logger.js';
import { createProductionContext } from '../lib/adapters/context-factory.js';
import { exitWithCleanup } from '../lib/utils/exit.js';
import { PreflightError } from '../lib/utils/preflight.js';

/**
 * Display the static (non-animated) banner
 *
 * @param options - Optional configuration for banner display
 */
function displayStaticBanner(): void {
  console.log('\n' + renderBanner({ showVersion: true }) + '\n');
}

/**
 * Display the application banner with animation when appropriate
 *
 * Conditionally animates the banner when appropriate conditions are met.
 * Returns a Promise when animation is enabled, or void when displaying static banner.
 *
 * @param options - Optional configuration for banner display
 */
function displayBanner(options?: { color?: boolean }): Promise<void> | void {
  if (shouldAnimate(options)) {
    console.log();
    return animateBanner().then(() => console.log());
  } else {
    displayStaticBanner();
  }
}

const program = new Command();

// Create production context once for all commands
const context = createProductionContext();

// Configure program
program
  .name('speci')
  .version(VERSION, '-V, --version', 'Display version number')
  .description('Speci CLI - AI-powered implementation loop orchestrator')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--no-color', 'Disable colored output')
  .hook('preAction', async (_thisCommand) => {
    // Enable verbose mode if --verbose flag is set
    const opts = _thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
      debug('Verbose mode enabled');
      debug('Node version', process.version);
      debug('Platform', process.platform);
      debug('Arguments', process.argv);
    }

    // Display banner before any command, except for --help, --version, --json output, or status command
    const args = process.argv;
    const isHelpOrVersion =
      args.includes('--help') ||
      args.includes('-h') ||
      args.includes('--version') ||
      args.includes('-V');
    const isJsonOutput = args.includes('--json');
    const isStatusCommand = args.includes('status') || args.includes('s');
    if (!isHelpOrVersion && !isJsonOutput && !isStatusCommand) {
      const result = displayBanner({ color: opts.color });
      if (result instanceof Promise) {
        await result;
      }
    }
  });

// Init Command (alias: i)
program
  .command('init')
  .alias('i')
  .description('Initialize Speci in current project')
  .option('-y, --yes', 'Accept all defaults')
  .option('-u, --update-agents', 'Update agent files even if they exist')
  .option('-v, --verbose', 'Show detailed output')
  .addHelpText(
    'after',
    `
Examples:
  $ speci init              Interactive setup wizard
  $ speci init --yes        Quick setup with defaults
  $ speci i -y              Force initialize with defaults
  $ speci init -u           Update agent files to latest version
`
  )
  .action(async (options) => {
    try {
      const result = await init(options, context);
      if (!result.success) {
        await exitWithCleanup(result.exitCode);
      }
    } catch (err) {
      if (err instanceof PreflightError) {
        log.error(`Preflight check failed: ${err.check}`);
        log.error(err.message);
        log.info('To fix this:');
        for (const step of err.remediation) {
          log.info(`  • ${step}`);
        }
        await exitWithCleanup(err.exitCode);
      }
      throw err;
    }
  });

// Plan Command (alias: p)
program
  .command('plan')
  .alias('p')
  .description('Generate implementation plan interactively')
  .option('-p, --prompt <text>', 'Initial prompt describing what to plan')
  .option(
    '-i, --input <files...>',
    'Input files for context (design docs, specs)'
  )
  .option('-a, --agent <path>', 'Use custom agent file')
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
  $ speci p -a custom-agent.md -p "My feature"    Use custom agent
`
  )
  .action(async (options) => {
    try {
      const result = await plan(options, context);
      if (!result.success) {
        await exitWithCleanup(result.exitCode);
      }
    } catch (err) {
      if (err instanceof PreflightError) {
        log.error(`Preflight check failed: ${err.check}`);
        log.error(err.message);
        log.info('To fix this:');
        for (const step of err.remediation) {
          log.info(`  • ${step}`);
        }
        await exitWithCleanup(err.exitCode);
      }
      throw err;
    }
  });

// Task Command (alias: t)
program
  .command('task')
  .alias('t')
  .description('Generate tasks from implementation plan')
  .requiredOption('-p, --plan <path>', 'Path to plan file')
  .option('-a, --agent <path>', 'Use custom agent file')
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
      const result = await task(options, context);
      if (!result.success) {
        await exitWithCleanup(result.exitCode);
      }
    } catch (err) {
      if (err instanceof PreflightError) {
        log.error(`Preflight check failed: ${err.check}`);
        log.error(err.message);
        log.info('To fix this:');
        for (const step of err.remediation) {
          log.info(`  • ${step}`);
        }
        await exitWithCleanup(err.exitCode);
      }
      throw err;
    }
  });

// Refactor Command (alias: r)
program
  .command('refactor')
  .alias('r')
  .description('Analyze codebase for refactoring opportunities')
  .option('-s, --scope <path>', 'Directory or glob pattern to analyze')
  .option('-o, --output <path>', 'Output refactoring plan to file')
  .option('-a, --agent <path>', 'Use custom agent file')
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
      const result = await refactor(options, context);
      if (!result.success) {
        await exitWithCleanup(result.exitCode);
      }
    } catch (err) {
      if (err instanceof PreflightError) {
        log.error(`Preflight check failed: ${err.check}`);
        log.error(err.message);
        log.info('To fix this:');
        for (const step of err.remediation) {
          log.info(`  • ${step}`);
        }
        await exitWithCleanup(err.exitCode);
      }
      throw err;
    }
  });

// Run Command (no short alias - intentionally verbose for safety)
program
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
      const result = await run(options, context);
      if (!result.success) {
        await exitWithCleanup(result.exitCode);
      }
    } catch (err) {
      if (err instanceof PreflightError) {
        log.error(`Preflight check failed: ${err.check}`);
        log.error(err.message);
        log.info('To fix this:');
        for (const step of err.remediation) {
          log.info(`  • ${step}`);
        }
        await exitWithCleanup(err.exitCode);
      }
      throw err;
    }
  });

// Status Command (alias: s)
program
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
      const result = await status(options, context);
      if (!result.success) {
        await exitWithCleanup(result.exitCode);
      }
    } catch (err) {
      if (err instanceof PreflightError) {
        log.error(`Preflight check failed: ${err.check}`);
        log.error(err.message);
        log.info('To fix this:');
        for (const step of err.remediation) {
          log.info(`  • ${step}`);
        }
        await exitWithCleanup(err.exitCode);
      }
      throw err;
    }
  });

// List of all available commands (for unknown command handling)
const availableCommands = ['init', 'plan', 'task', 'refactor', 'run', 'status'];

// Unknown command handler
program.on('command:*', async (operands) => {
  const unknownCmd = operands[0];
  const suggestions = findSimilarCommands(unknownCmd, availableCommands);

  console.error(`Error: Unknown command '${unknownCmd}'`);

  if (suggestions.length > 0) {
    console.error(`\nDid you mean: speci ${suggestions[0]}?`);
  }

  console.error('\nAvailable commands:');
  availableCommands.forEach((cmd) => console.error(`  ${cmd}`));

  await exitWithCleanup(2);
});

// Check if help or version is being requested
const args = process.argv.slice(2);
const isHelpRequest =
  args.includes('-h') || args.includes('--help') || args[0] === 'help';
const isVersionRequest = args.includes('-V') || args.includes('--version');

if (process.argv.length <= 2) {
  // No arguments: show animated banner + help
  (async () => {
    const result = displayBanner({ color: program.opts().color });
    if (result instanceof Promise) {
      await result;
    }
    program.help();
  })();
} else if (isHelpRequest) {
  // Help request: show static banner + help
  displayStaticBanner();
  program.parse(process.argv);
} else if (isVersionRequest) {
  // Version request: just show version (no banner)
  program.parse(process.argv);
} else {
  // Regular command: parse normally (preAction hook handles banner)
  program.parse(process.argv);
}
