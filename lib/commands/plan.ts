/**
 * Plan Command Module
 *
 * Invokes GitHub Copilot CLI in interactive mode for plan generation.
 * Users can have an interactive conversation with Copilot to develop
 * implementation plans for features, projects, or refactoring efforts.
 */

import { resolve } from 'node:path';
import { drawBox } from '@/ui/box.js';
import { colorize } from '@/ui/colors.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import { initializeCommand } from '@/utils/command-helpers.js';
import { handleCommandError } from '@/utils/error-handler.js';
import { executeCopilotCommand } from '@/utils/copilot-helper.js';
import { InputValidator } from '@/validation/index.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
import type { SpeciConfig } from '@/config.js';

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
  // Raw output to preserve box formatting
  console.log(
    drawBox(content, { title: 'Plan Generation', borderColor: 'sky500' })
  );
  console.log(); // Empty line for spacing
}

/**
 * Plan command handler
 * Initializes interactive Copilot session for plan generation
 * @param options - Command options with defaults
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to command result
 * @sideEffects Spawns GitHub Copilot CLI process; may write output file if --output specified
 */
export async function plan(
  options: PlanOptions = {},
  context: CommandContext = createProductionContext(),
  config?: SpeciConfig
): Promise<CommandResult> {
  try {
    // Require at least --prompt or --input (validate before initialization)
    if (!options.prompt && (!options.input || options.input.length === 0)) {
      context.logger.error('Missing required input');
      context.logger.info('Provide at least one of:');
      context.logger.muted(
        '  --prompt <text>    Initial prompt describing what to plan'
      );
      context.logger.muted(
        '  --input <files...> Input files for context (design docs, specs)'
      );
      context.logger.raw('');
      context.logger.info('Examples:');
      context.logger.muted('  speci plan -p "Build a REST API for users"');
      context.logger.muted('  speci plan -i docs/design.md');
      context.logger.muted('  speci plan -i spec.md -p "Focus on auth"');
      return {
        success: false,
        exitCode: 1,
        error: 'Missing required input',
      };
    }

    // Validate input using InputValidator
    const inputFiles = options.input || [];
    const validationResult = new InputValidator(context.fs)
      .requireInput(
        inputFiles.length > 0 ? inputFiles : undefined,
        options.prompt
      )
      .validateFiles(inputFiles)
      .validate();

    if (!validationResult.success) {
      context.logger.error(validationResult.error.message);
      validationResult.error.suggestions?.forEach((s) =>
        context.logger.info(s)
      );
      return {
        success: false,
        exitCode: 1,
        error: validationResult.error.message,
      };
    }

    // Initialize command with shared helper (skip preflight as plan doesn't need it)
    const { config: loadedConfig, agentName } = await initializeCommand({
      commandName: 'plan',
      config, // Pass pre-loaded config if provided
      skipPreflight: true,
      context,
    });

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

    // If output file specified, instruct Copilot to write to that file via prompt
    if (options.output) {
      const resolvedOutput = resolve(options.output);
      promptParts.push(
        `\nWhen you are done, write your complete plan to the file: ${resolvedOutput}`
      );
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
    const args = context.copilotRunner.buildArgs(loadedConfig, {
      prompt: fullPrompt || undefined,
      agent: agentName,
      shouldAllowAll: loadedConfig.copilot.permissions === 'allow-all',
      command: 'plan',
    });

    // Execute copilot command with standard pattern
    return await executeCopilotCommand(context, args);
  } catch (error) {
    return handleCommandError(error, 'Plan', context.logger);
  }
}

export default plan;
