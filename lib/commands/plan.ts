/**
 * Plan Command Module
 *
 * Invokes GitHub Copilot CLI in interactive mode for plan generation.
 * Users can have an interactive conversation with Copilot to develop
 * implementation plans for features, projects, or refactoring efforts.
 */

import { existsSync } from 'node:fs';
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
  /** Show detailed output */
  verbose?: boolean;
}

/**
 * Display information box about command invocation
 * @param agentPath - Path to agent being used
 * @param outputPath - Output path or 'stdout'
 */
function displayCommandInfo(agentPath: string, outputPath: string): void {
  const content = [
    colorize('Agent:', 'sky400') + ` ${agentPath}`,
    colorize('Mode:', 'sky400') + ' Interactive',
    colorize('Output:', 'sky400') + ` ${outputPath}`,
  ];
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

    // Resolve agent path (override or config)
    const agentPath = options.agent
      ? options.agent
      : resolveAgentPath(config, 'plan');

    // Validate agent file exists
    if (!existsSync(agentPath)) {
      log.error(`Agent file not found: ${agentPath}`);
      log.info('Check config.agents.plan or provide --agent flag');
      process.exit(1);
    }

    // Display command info
    displayCommandInfo(agentPath, options.output || 'stdout');

    // Build Copilot args
    const args = buildCopilotArgs(config, {
      interactive: true,
      agent: agentPath,
      allowAll: config.copilot.permissions === 'allow-all',
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
