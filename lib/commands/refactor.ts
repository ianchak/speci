/**
 * Refactor Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for codebase refactoring analysis.
 * The command can optionally scope analysis to specific directories or file patterns.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 */

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { loadConfig, resolveAgentPath } from '@/config.js';
import { buildCopilotArgs, spawnCopilot } from '@/copilot.js';
import { preflight } from '@/utils/preflight.js';
import { renderBanner } from '@/ui/banner.js';
import { log } from '@/utils/logger.js';
import { infoBox } from '@/ui/box.js';

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
 * @returns Validated scope string
 */
function validateScope(scope: string): string {
  const cwd = process.cwd();

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
    log.error(`Scope path must be within project: ${scope}`);
    process.exit(1);
  }

  // Check existence for directories
  if (existsSync(resolved)) {
    const stats = statSync(resolved);
    if (!stats.isDirectory() && !stats.isFile()) {
      log.warn(`Scope path is neither file nor directory: ${scope}`);
    }
  } else {
    log.warn(
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
 */
export async function refactor(options: RefactorOptions = {}): Promise<void> {
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

    // Validate and resolve scope if provided
    let scopePath: string | undefined;
    if (options.scope) {
      scopePath = validateScope(options.scope);
    }

    const commandName = 'refactor';
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
    const args = buildCopilotArgs(config, {
      prompt,
      agent: agentName,
      allowAll: true,
      command: commandName,
    });

    // Spawn Copilot with stdio:inherit
    log.debug(`Spawning: copilot ${args.join(' ')}`);
    const exitCode = await spawnCopilot(args, { inherit: true });

    // Exit with Copilot's exit code
    process.exit(exitCode);
  } catch (error) {
    if (error instanceof Error) {
      log.error(`Refactor command failed: ${error.message}`);
    } else {
      log.error(`Refactor command failed: ${String(error)}`);
    }
    throw error;
  }
}

export default refactor;
