/**
 * Plan Command Module
 *
 * Invokes GitHub Copilot CLI in interactive mode for plan generation.
 * Users can have an interactive conversation with Copilot to develop
 * implementation plans for features, projects, or refactoring efforts.
 */

import { resolve } from 'node:path';
import { resolveAgentPath } from '@/config.js';
import { renderBanner } from '@/ui/banner.js';
import { drawBox } from '@/ui/box.js';
import { colorize } from '@/ui/colors.js';
import { getAgentFilename } from '@/constants.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';

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
 * @param context - Dependency injection context (defaults to production)
 * @returns Promise resolving to command result
 */
export async function plan(
  options: PlanOptions = {},
  context: CommandContext = createProductionContext()
): Promise<CommandResult> {
  try {
    // Display banner
    renderBanner();
    console.log();

    // Load configuration
    const config = await context.configLoader.load();

    // Validate agent file exists
    const commandName = 'plan';
    const agentName = (options.agent || getAgentFilename(commandName)).replace(
      /\.agent\.md$/,
      ''
    );
    const agentPath = resolveAgentPath(commandName, options.agent);

    if (!context.fs.existsSync(agentPath)) {
      context.logger.error(`Agent file not found: ${agentPath}`);
      context.logger.info(
        'Run "speci init" to create agents or provide --agent <filename>'
      );
      return {
        success: false,
        exitCode: 1,
        error: `Agent file not found: ${agentPath}`,
      };
    }

    // Require at least --prompt or --input
    if (!options.prompt && (!options.input || options.input.length === 0)) {
      context.logger.error('Missing required input');
      context.logger.info('Provide at least one of:');
      context.logger.info(
        '  --prompt <text>    Initial prompt describing what to plan'
      );
      context.logger.info(
        '  --input <files...> Input files for context (design docs, specs)'
      );
      context.logger.info('');
      context.logger.info('Examples:');
      context.logger.info('  speci plan -p "Build a REST API for users"');
      context.logger.info('  speci plan -i docs/design.md');
      context.logger.info('  speci plan -i spec.md -p "Focus on auth"');
      return {
        success: false,
        exitCode: 1,
        error: 'Missing required input',
      };
    }

    // Validate input files exist
    const inputFiles = options.input || [];
    for (const inputFile of inputFiles) {
      const resolvedPath = resolve(inputFile);
      if (!context.fs.existsSync(resolvedPath)) {
        context.logger.error(`Input file not found: ${inputFile}`);
        return {
          success: false,
          exitCode: 1,
          error: `Input file not found: ${inputFile}`,
        };
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
    const args = context.copilotRunner.buildArgs(config, {
      prompt: fullPrompt || undefined,
      agent: agentName,
      shouldAllowAll: config.copilot.permissions === 'allow-all',
      command: commandName,
    });

    // Add output flag if specified
    if (options.output) {
      args.push('--output', options.output);
    }

    // Spawn Copilot with stdio:inherit
    context.logger.debug(`Spawning: copilot ${args.join(' ')}`);
    const exitCode = await context.copilotRunner.spawn(args, { inherit: true });

    // Return result with exit code
    if (exitCode === 0) {
      return { success: true, exitCode: 0 };
    } else {
      return { success: false, exitCode };
    }
  } catch (error) {
    if (error instanceof Error) {
      context.logger.error(`Plan command failed: ${error.message}`);
      return {
        success: false,
        exitCode: 1,
        error: error.message,
      };
    } else {
      const errorMsg = String(error);
      context.logger.error(`Plan command failed: ${errorMsg}`);
      return {
        success: false,
        exitCode: 1,
        error: errorMsg,
      };
    }
  }
}

export default plan;
