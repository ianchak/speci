/**
 * Copilot CLI Wrapper Module
 *
 * Provides a clean interface for invoking GitHub Copilot CLI with:
 * - One-shot mode (-p flag) for agent execution
 * - Retry logic with exponential backoff for transient failures
 * - Proper stdio handling and process spawning
 */

import { spawn } from 'node:child_process';
import type {
  SpeciConfig,
  CommandName,
  CopilotArgsOptions,
  AgentRunResult,
} from '@/types.js';
import { log } from '@/utils/logger.js';
import { getAgentFilename } from '@/constants.js';

// Re-export types for backward compatibility
export type {
  CommandName,
  CopilotArgsOptions,
  AgentRunResult,
} from '@/types.js';

/**
 * Retry policy for transient failures
 */
interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableExitCodes: number[];
}

/**
 * Default retry policy
 */
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 4000,
  retryableExitCodes: [
    429, // Rate limit
    52, // Network error (CURLE_GOT_NOTHING)
    124, // Timeout
    7, // Connection failure (CURLE_COULDNT_CONNECT)
    6, // DNS resolution failure (CURLE_COULDNT_RESOLVE_HOST)
  ],
};

/**
 * Build copilot CLI arguments from config and options
 *
 * @param config - Speci configuration
 * @param options - Argument building options
 * @returns Array of CLI arguments
 */
export function buildCopilotArgs(
  config: SpeciConfig,
  options: CopilotArgsOptions
): string[] {
  const args: string[] = [];

  args.push('-p', options.prompt || 'Execute agent instructions');

  // Agent flag
  args.push(`--agent=${options.agent}`);

  // Permission flag
  const { permissions } = config.copilot;
  if (permissions === 'allow-all') {
    args.push('--allow-all');
  } else if (permissions === 'yolo') {
    args.push('--yolo');
  }

  // Model flag - only per-command model is used
  const model = config.copilot.models[options.command];
  args.push('--model', model);

  args.push('--no-ask-user');

  // Extra flags
  args.push(...config.copilot.extraFlags);

  return args;
}

/**
 * Spawn copilot CLI process
 *
 * @param args - CLI arguments
 * @param options - Spawn options
 * @returns Promise that resolves with exit code
 * @throws {Error} If copilot process fails to spawn
 */
export async function spawnCopilot(
  args: string[],
  options: { inherit?: boolean; cwd?: string } = {}
): Promise<number> {
  const { inherit = true, cwd = process.cwd() } = options;

  return new Promise((resolve, reject) => {
    const child = spawn('copilot', args, {
      stdio: inherit ? 'inherit' : 'pipe',
      cwd,
      env: process.env,
      shell: false,
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an agent with retry logic for transient failures
 *
 * @param config - Speci configuration
 * @param agentName - Name of agent to run
 * @param label - Human-readable label for logging
 * @param policy - Retry policy (uses default if not specified)
 * @returns Promise that resolves with agent run result
 * @throws {Error} If agent file not found or execution fails
 */
export async function runAgent(
  config: SpeciConfig,
  agentName: string,
  _label: string,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): Promise<AgentRunResult> {
  let lastError: Error | undefined;
  let lastExitCode = 1;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(
        policy.baseDelay * Math.pow(2, attempt - 1),
        policy.maxDelay
      );
      log.warn(`Retry ${attempt}/${policy.maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }

    try {
      // Use the agent name directly (e.g., 'speci-plan')
      // Copilot CLI looks for agents in .github/copilot/agents/
      const agentFileName = getAgentFilename(agentName);
      const args = buildCopilotArgs(config, {
        agent: agentFileName,
        command: agentName as CommandName,
      });

      log.debug(`Spawning copilot: copilot ${args.join(' ')}`);
      const exitCode = await spawnCopilot(args);

      if (exitCode === 0) {
        return { isSuccess: true, exitCode: 0 };
      }

      lastExitCode = exitCode;

      // Check if retryable
      if (!policy.retryableExitCodes.includes(exitCode)) {
        return {
          isSuccess: false,
          exitCode,
          error: `Agent exited with code ${exitCode}`,
        };
      }
    } catch (err) {
      lastError = err as Error;

      // ENOENT is not retryable
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          isSuccess: false,
          exitCode: 127,
          error: 'Copilot CLI not found. Is it installed and in PATH?',
        };
      }
    }
  }

  return {
    isSuccess: false,
    exitCode: lastExitCode,
    error: lastError?.message ?? `Failed after ${policy.maxRetries} retries`,
  };
}
