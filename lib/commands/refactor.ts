/**
 * Refactor Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for codebase refactoring analysis.
 * The command can optionally scope analysis to specific directories or file patterns.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 */

import { isAbsolute, resolve } from 'node:path';
import { resolveAgentPath } from '@/config.js';
import { preflight } from '@/utils/preflight.js';
import { renderBanner } from '@/ui/banner.js';
import { infoBox } from '@/ui/box.js';
import { getAgentFilename } from '@/constants.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';

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

  // Security: Ensure scope is within project
  if (!resolved.startsWith(cwd)) {
    context.logger.error(`Scope path must be within project: ${scope}`);
    return {
      success: false,
      exitCode: 1,
      error: `Scope path must be within project: ${scope}`,
    };
  }

  // Check existence for directories
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
 * @param options - Command options
 * @param context - Dependency injection context (defaults to production)
 * @returns Promise resolving to command result
 */
export async function refactor(
  options: RefactorOptions = {},
  context: CommandContext = createProductionContext()
): Promise<CommandResult> {
  try {
    // Display banner
    renderBanner();
    console.log();

    // Load configuration
    const config = await context.configLoader.load();

    // Run preflight checks
    await preflight(
      config,
      {
        requireCopilot: true,
        requireConfig: true,
        requireProgress: false,
        requireGit: false,
      },
      context.process
    );

    // Validate and resolve scope if provided
    let scopePath: string | undefined;
    if (options.scope) {
      const validationResult = validateScope(options.scope, context);
      if (typeof validationResult === 'object') {
        // It's a CommandResult error
        return validationResult;
      }
      scopePath = validationResult;
    }

    const commandName = 'refactor';
    const agentName = (options.agent || getAgentFilename(commandName)).replace(
      /\.agent\.md$/,
      ''
    );
    const agentPath = resolveAgentPath(commandName, options.agent);

    // Validate agent file exists
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

    // Display command info
    console.log(
      infoBox('Refactor Analysis', {
        Scope: scopePath || 'Entire project',
        Agent: `${agentName}.agent.md`,
        Mode: 'One-shot',
        Output: options.output || 'stdout',
      })
    );
    console.log();

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
      shouldAllowAll: true,
      command: commandName,
    });

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
      context.logger.error(`Refactor command failed: ${error.message}`);
      return {
        success: false,
        exitCode: 1,
        error: error.message,
      };
    } else {
      const errorMsg = String(error);
      context.logger.error(`Refactor command failed: ${errorMsg}`);
      return {
        success: false,
        exitCode: 1,
        error: errorMsg,
      };
    }
  }
}

export default refactor;
