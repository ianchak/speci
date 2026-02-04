/**
 * Task Command Module
 *
 * Invokes GitHub Copilot CLI in one-shot mode for task generation from a plan file.
 * The command validates the plan file exists and is readable before invoking Copilot.
 * Output streams to terminal in real-time using stdio: 'inherit'.
 */

import { existsSync, accessSync, constants } from 'node:fs';
import { relative, resolve } from 'node:path';
import { loadConfig, resolveAgentPath } from '../config.js';
import { buildCopilotArgs, spawnCopilot } from '../copilot.js';
import { preflight } from '../utils/preflight.js';
import { renderBanner } from '../ui/banner.js';
import { log } from '../utils/logger.js';
import { infoBox } from '../ui/box.js';

/**
 * Options for the task command
 */
export interface TaskOptions {
  /** Required: path to plan file */
  plan: string;
  /** Custom agent path override */
  agent?: string;
  /** Show detailed output */
  verbose?: boolean;
}

/**
 * Validate that plan file exists and is readable
 *
 * @param planPath - Absolute path to plan file
 * @throws Will exit process with code 1 if validation fails
 */
function validatePlanFile(planPath: string): void {
  // Check existence
  if (!existsSync(planPath)) {
    log.error(`Plan file not found: ${planPath}`);
    process.exit(1);
  }

  // Check readability
  try {
    accessSync(planPath, constants.R_OK);
  } catch {
    log.error(`Plan file not readable: ${planPath}`);
    log.info('Check file permissions and try again.');
    process.exit(1);
  }
}

/**
 * Task command handler
 * Initializes one-shot Copilot session for task generation
 *
 * @param options - Command options
 */
export async function task(options: TaskOptions): Promise<void> {
  try {
    // Display banner
    renderBanner();
    console.log();

    // Validate required option
    if (!options.plan) {
      log.error('Missing required option: --plan <path>');
      log.info('Usage: speci task --plan <path-to-plan.md>');
      process.exit(2);
    }

    // Resolve and validate plan file
    const planPath = resolve(process.cwd(), options.plan);
    validatePlanFile(planPath);

    // Load configuration
    const config = loadConfig();

    // Run preflight checks
    await preflight(config, {
      requireCopilot: true,
      requireConfig: true,
      requireProgress: false,
      requireGit: false,
    });

    const commandName = 'task';
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
    const displayPlanPath = relative(process.cwd(), planPath) || planPath;
    console.log(
      infoBox('Task Generation', {
        Plan: displayPlanPath,
        Agent: `${agentName}.agent.md`,
        Mode: 'One-shot',
      })
    );
    console.log();

    // Build Copilot args for one-shot mode with plan context
    const args = buildCopilotArgs(config, {
      interactive: false,
      prompt: `Read the plan file at ${planPath} and generate implementation tasks.`,
      agent: agentName,
      allowAll: true,
    });

    // Spawn Copilot with stdio:inherit
    log.debug(`Spawning: copilot ${args.join(' ')}`);
    const exitCode = await spawnCopilot(args, { inherit: true });

    // Exit with Copilot's exit code
    process.exit(exitCode);
  } catch (error) {
    if (error instanceof Error) {
      log.error(`Task command failed: ${error.message}`);
    } else {
      log.error(`Task command failed: ${String(error)}`);
    }
    throw error;
  }
}

export default task;
