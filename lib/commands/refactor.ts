/**
 * Refactor Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for codebase refactoring analysis.
 * The command can optionally scope analysis to specific directories or file patterns.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 */

import { isAbsolute, resolve } from 'node:path';
import { infoBox } from '@/ui/box.js';
import { initializeCommand } from '@/utils/helpers/command-helpers.js';
import {
  failValidation,
  handleCommandError,
} from '@/utils/infrastructure/error-handler.js';
import { executeCopilotCommand } from '@/utils/helpers/copilot-helper.js';
import { PathValidator } from '@/validation/index.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';

/**
 * Options for the refactor command
 */
export interface RefactorOptions {
  /** Directory or glob pattern to analyze */
  scope?: string;
  /** Output file path for refactoring plan */
  output?: string;
  /** Custom agent path override */
  agent?: string;
  /** Show detailed output */
  verbose?: boolean;
}

/**
 * Validate and resolve scope path or glob pattern
 *
 * @param scope - User-provided scope path or pattern
 * @param context - Command context for filesystem and logging
 * @returns Validated scope string or CommandResult if validation fails
 */
function validateScope(
  scope: string,
  context: CommandContext
): string | CommandResult {
  const cwd = context.process.cwd();

  // Check if it's a glob pattern (contains *, ?, [, ])
  const isGlob = /[*?[\]]/.test(scope);

  if (isGlob) {
    // For globs, just validate syntax and return as-is
    // Actual file matching is done by the agent/Copilot
    return scope;
  }

  // For directory paths, resolve and validate
  const resolved = isAbsolute(scope) ? scope : resolve(cwd, scope);

  // Use PathValidator for validation
  const result = new PathValidator(resolved).isWithinProject(cwd).validate();

  if (!result.success) {
    return failValidation(result.error, context.logger);
  }

  // Check existence for directories (warn if doesn't exist, but don't fail)
  if (context.fs.existsSync(resolved)) {
    const stats = context.fs.statSync(resolved);
    if (!stats.isDirectory() && !stats.isFile()) {
      context.logger.warn(`Scope path is neither file nor directory: ${scope}`);
    }
  } else {
    context.logger.warn(
      `Scope path does not exist: ${scope}. Agent will handle accordingly.`
    );
  }

  return resolved;
}

/**
 * Refactor command handler
 * Initializes one-shot Copilot session for refactoring analysis
 *
 * @param options - Command options with defaults
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to command result
 * @sideEffects Spawns GitHub Copilot CLI process; reads codebase files; may write output file if --output specified
 */
export async function refactor(
  options: RefactorOptions = {},
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult> {
  try {
    // Validate and resolve scope if provided (must come before initialization)
    let scopePath: string | undefined;
    if (options.scope) {
      const validationResult = validateScope(options.scope, context);
      if (typeof validationResult === 'object') {
        // It's a CommandResult error
        return validationResult;
      }
      scopePath = validationResult;
    }

    // Initialize command (config + preflight + agent validation)
    const { config, agentName } = await initializeCommand({
      commandName: 'refactor',
      config: preloadedConfig, // Pass pre-loaded config if provided
      context,
    });

    // Display command info
    context.logger.raw(
      infoBox('Refactor Analysis', {
        Scope: scopePath || 'Entire project',
        Agent: `${agentName}.agent.md`,
        ...(options.output ? { Output: options.output } : {}),
      })
    );
    context.logger.raw('');

    // Build prompt with scope context if provided
    let prompt =
      'Analyze the codebase and generate refactoring recommendations.';
    if (scopePath) {
      prompt = `Analyze the codebase at scope "${scopePath}" and generate refactoring recommendations.`;
    }

    // Build Copilot args for one-shot mode
    const args = context.copilotRunner.buildArgs(config, {
      prompt,
      agent: agentName,
      command: 'refactor',
    });

    // Execute copilot command with standard pattern
    return await executeCopilotCommand(context, args);
  } catch (error) {
    return handleCommandError(error, 'Refactor', context.logger);
  }
}

export default refactor;
