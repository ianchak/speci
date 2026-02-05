#!/usr/bin/env tsx
/**
 * Speci CLI Entry Point
 *
 * Main entry point for the speci CLI tool.
 * Sets up Commander.js command routing and displays the application banner.
 */

import { Command } from 'commander';
import { renderBanner, VERSION } from '../lib/ui/banner.js';
import { init } from '../lib/commands/init.js';
import { plan } from '../lib/commands/plan.js';
import { task } from '../lib/commands/task.js';
import { refactor } from '../lib/commands/refactor.js';
import { run } from '../lib/commands/run.js';
import { status } from '../lib/commands/status.js';
import monitor from '../lib/commands/monitor.js';
import { findSimilarCommands } from '../lib/utils/suggest.js';
import { setVerbose, debug } from '../lib/utils/logger.js';

/**
 * Display the application banner
 *
 * Conditionally animates the banner when appropriate conditions are met.
 * Returns a Promise when animation is enabled, or void when displaying static banner.
 */
function displayBanner(): Promise<void> | void {
  const {
    animateBanner,
    shouldAnimate,
  } = require('../lib/ui/banner-animation.js'); // eslint-disable-line @typescript-eslint/no-require-imports
  if (shouldAnimate()) {
    return animateBanner();
  } else {
    console.log('\n' + renderBanner({ showVersion: true }) + '\n');
  }
}

const program = new Command();

// Configure program
program
  .name('speci')
  .version(VERSION, '-V, --version', 'Display version number')
  .description('Speci CLI - AI-powered implementation loop orchestrator')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--no-color', 'Disable colored output')
  .hook('preAction', (_thisCommand) => {
    // Enable verbose mode if --verbose flag is set
    const opts = _thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
      debug('Verbose mode enabled');
      debug('Node version', process.version);
      debug('Platform', process.platform);
      debug('Arguments', process.argv);
    }

    // Display banner before any command, except for --help and --version
    const args = process.argv;
    const isHelpOrVersion =
      args.includes('--help') ||
      args.includes('-h') ||
      args.includes('--version') ||
      args.includes('-V');
    if (!isHelpOrVersion) {
      displayBanner();
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
  .action(init);

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
  .action(plan);

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
  .action(task);

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
  .action(refactor);

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
  .action(run);

// Status Command (alias: s)
program
  .command('status')
  .alias('s')
  .description('Show current loop state and task statistics')
  .option('--json', 'Output status as JSON')
  .option('-v, --verbose', 'Show detailed status')
  .addHelpText(
    'after',
    `
Examples:
  $ speci status                       Show current status
  $ speci s --json                     Output as JSON for scripts
  $ speci status --verbose             Detailed status information
`
  )
  .action(status);

// Monitor Command (alias: m)
program
  .command('monitor')
  .alias('m')
  .description('Real-time log viewer with TUI')
  .option('-l, --log-file <path>', 'Custom log file to monitor')
  .option('--poll-interval <ms>', 'Polling interval in milliseconds', parseInt)
  .option('--max-lines <n>', 'Maximum lines to display', parseInt)
  .option('-v, --verbose', 'Show detailed output')
  .addHelpText(
    'after',
    `
Examples:
  $ speci monitor                      Monitor default log file
  $ speci m                            Short alias version
  $ speci monitor --max-lines 1000     Limit display buffer
`
  )
  .action(monitor);

// List of all available commands (for unknown command handling)
const availableCommands = [
  'init',
  'plan',
  'task',
  'refactor',
  'run',
  'status',
  'monitor',
];

// Unknown command handler
program.on('command:*', (operands) => {
  const unknownCmd = operands[0];
  const suggestions = findSimilarCommands(unknownCmd, availableCommands);

  console.error(`Error: Unknown command '${unknownCmd}'`);

  if (suggestions.length > 0) {
    console.error(`\nDid you mean: speci ${suggestions[0]}?`);
  }

  console.error('\nAvailable commands:');
  availableCommands.forEach((cmd) => console.error(`  ${cmd}`));

  process.exit(2);
});

// Show banner and help when no arguments provided
if (process.argv.length <= 2) {
  displayBanner();
  program.help();
}

// Parse command line arguments
program.parse(process.argv);
