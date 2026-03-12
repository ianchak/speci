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
import { initializeCommand } from '@/utils/helpers/command-helpers.js';
import {
  failValidation,
  handleCommandError,
} from '@/utils/infrastructure/error-handler.js';
import { executeCopilotCommand } from '@/utils/helpers/copilot-helper.js';
import { InputValidator } from '@/validation/index.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';

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
 * @param context - Command context for output
 */
function displayCommandInfo(
  agentPath: string,
  outputPath: string,
  inputFiles: string[] | undefined,
  context: CommandContext
): void {
  const content = [colorize('Agent:', 'sky400') + ` ${agentPath}`];
  if (outputPath && outputPath !== 'stdout') {
    content.push(colorize('Output:', 'sky400') + ` ${outputPath}`);
  }
  if (inputFiles && inputFiles.length > 0) {
    content.push(colorize('Input:', 'sky400') + ` ${inputFiles.join(', ')}`);
  }
  // Raw output to preserve box formatting
  context.logger.raw(
    drawBox(content, { title: 'Plan Generation', borderColor: 'sky500' })
  );
  context.logger.raw(''); // Empty line for spacing
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
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult> {
  try {
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
      return failValidation(validationResult.error, context.logger);
    }

    // Initialize command with shared helper (skip preflight as plan doesn't need it)
    const { config, agentName } = await initializeCommand({
      commandName: 'plan',
      config: preloadedConfig, // Pass pre-loaded config if provided
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

    // If output file specified, tell the agent which path to use as the plan document
    // throughout all phases (do NOT say "when done" — the plan agent creates and
    // updates the file incrementally from Phase 1, not just at the end)
    if (options.output) {
      const resolvedOutput = resolve(options.output);
      promptParts.push(
        `\nIMPORTANT: Use this exact path as the plan document file for ALL phases (create it in Phase 1 and update it throughout): ${resolvedOutput}`
      );
    }

    const fullPrompt = promptParts.join('\n');

    displayCommandInfo(
      `${agentName}.agent.md`,
      options.output || 'stdout',
      inputFiles,
      context
    );

    // Display the initial prompt being sent
    context.logger.raw(colorize('─'.repeat(60), 'dim'));
    context.logger.raw(colorize('Initial prompt:', 'sky400'));
    context.logger.raw('');
    context.logger.raw(fullPrompt);
    context.logger.raw('');
    context.logger.raw(colorize('─'.repeat(60), 'dim'));
    context.logger.raw('');

    // Build Copilot args - one-shot mode with prompt
    const args = context.copilotRunner.buildArgs(config, {
      prompt: fullPrompt || undefined,
      agent: agentName,
      allowAll: config.copilot.permissions === 'allow-all',
      command: 'plan',
    });

    // Execute copilot command with standard pattern
    return await executeCopilotCommand(context, args);
  } catch (error) {
    return handleCommandError(error, 'Plan', context.logger);
  }
}

export default plan;
