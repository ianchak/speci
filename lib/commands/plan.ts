/**
 * Plan Command Module
 *
 * Invokes GitHub Copilot CLI in interactive mode for plan generation.
 * Users can have an interactive conversation with Copilot to develop
 * implementation plans for features, projects, or refactoring efforts.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, resolveAgentPath } from '../config.js';
import { buildCopilotArgs, spawnCopilot } from '../copilot.js';
import { preflight } from '../utils/preflight.js';
import { renderBanner } from '../ui/banner.js';
import { log } from '../utils/logger.js';
import { drawBox } from '../ui/box.js';
import { colorize } from '../ui/colors.js';

/**
 * Options for the plan command
 */
export interface PlanOptions {
  /** Output file path for plan */
  output?: string;
  /** Custom agent path override */
  agent?: string;
  /** Initial prompt for plan generation */
  prompt?: string;
  /** Input files to include as context (design docs, specs, etc.) */
  input?: string[];
  /** Show detailed output */
  verbose?: boolean;
}

/**
 * Display information box about command invocation
 * @param agentPath - Path to agent being used
 * @param outputPath - Output path or 'stdout'
 * @param inputFiles - Array of input file paths
 */
function displayCommandInfo(
  agentPath: string,
  outputPath: string,
  inputFiles?: string[]
): void {
  const content = [
    colorize('Agent:', 'sky400') + ` ${agentPath}`,
    colorize('Mode:', 'sky400') + ' One-shot',
    colorize('Output:', 'sky400') + ` ${outputPath}`,
  ];
  if (inputFiles && inputFiles.length > 0) {
    content.push(colorize('Input:', 'sky400') + ` ${inputFiles.join(', ')}`);
  }
  console.log(
    drawBox(content, { title: 'Plan Generation', borderColor: 'sky500' })
  );
  console.log();
}

/**
 * Plan command handler
 * Initializes interactive Copilot session for plan generation
 * @param options - Command options
 */
export async function plan(options: PlanOptions = {}): Promise<void> {
  try {
    // Display banner
    renderBanner();
    console.log();

    // Load configuration
    const config = loadConfig();

    // Run preflight checks
    await preflight(config, {
      requireCopilot: true,
      requireConfig: true,
      requireProgress: false,
      requireGit: false,
    });

    const commandName = 'plan';
    const agentName = (options.agent || `speci-${commandName}`).replace(
      /\.agent\.md$/,
      ''
    );
    const agentPath = resolveAgentPath(commandName, options.agent);

    // Validate agent file exists
    if (!existsSync(agentPath)) {
      log.error(`Agent file not found: ${agentPath}`);
      log.info(
        'Run "speci init" to create agents or provide --agent <filename>'
      );
      process.exit(1);
    }

    // Require at least --prompt or --input
    if (!options.prompt && (!options.input || options.input.length === 0)) {
      log.error('Missing required input');
      log.info('Provide at least one of:');
      log.info('  --prompt <text>    Initial prompt describing what to plan');
      log.info(
        '  --input <files...> Input files for context (design docs, specs)'
      );
      log.info('');
      log.info('Examples:');
      log.info('  speci plan -p "Build a REST API for users"');
      log.info('  speci plan -i docs/design.md');
      log.info('  speci plan -i spec.md -p "Focus on auth"');
      process.exit(1);
    }

    // Validate input files exist
    const inputFiles = options.input || [];
    for (const inputFile of inputFiles) {
      const resolvedPath = resolve(inputFile);
      if (!existsSync(resolvedPath)) {
        log.error(`Input file not found: ${inputFile}`);
        process.exit(1);
      }
    }

    // Build prompt referencing input files (Copilot will read them)
    const promptParts: string[] = [];

    if (inputFiles.length > 0) {
      promptParts.push(
        'Please read and analyze the following input files for context:'
      );
      for (const inputFile of inputFiles) {
        const resolvedPath = resolve(inputFile);
        promptParts.push(`- ${resolvedPath}`);
      }
      promptParts.push('');
    }

    if (options.prompt) {
      if (inputFiles.length > 0) {
        promptParts.push('Then, based on that context:');
      }
      promptParts.push(options.prompt);
    }

    const fullPrompt = promptParts.join('\n');

    displayCommandInfo(
      `${agentName}.agent.md`,
      options.output || 'stdout',
      inputFiles
    );

    // Display the initial prompt being sent
    console.log(colorize('─'.repeat(60), 'dim'));
    console.log(colorize('Initial prompt:', 'sky400'));
    console.log();
    console.log(fullPrompt);
    console.log();
    console.log(colorize('─'.repeat(60), 'dim'));
    console.log();

    // Build Copilot args - one-shot mode with prompt
    const args = buildCopilotArgs(config, {
      prompt: fullPrompt || undefined,
      agent: agentName,
      allowAll: config.copilot.permissions === 'allow-all',
      command: commandName,
    });

    // Add output flag if specified
    if (options.output) {
      args.push('--output', options.output);
    }

    // Spawn Copilot with stdio:inherit
    log.debug(`Spawning: copilot ${args.join(' ')}`);
    const exitCode = await spawnCopilot(args, { inherit: true });

    // Exit with Copilot's exit code
    process.exit(exitCode);
  } catch (error) {
    if (error instanceof Error) {
      log.error(`Plan command failed: ${error.message}`);
    } else {
      log.error(`Plan command failed: ${String(error)}`);
    }
    throw error;
  }
}

export default plan;
