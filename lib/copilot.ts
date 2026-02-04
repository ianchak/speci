/**
 * Copilot CLI Wrapper Module
 *
 * Provides a clean interface for invoking GitHub Copilot CLI with:
 * - Interactive mode (-i flag) for full terminal passthrough
 * - One-shot mode (-p flag) for non-interactive agent execution
 * - Retry logic with exponential backoff for transient failures
 * - Proper stdio handling and process spawning
 */

import { spawn } from 'node:child_process';
import type { SpeciConfig } from './config.js';
import { log } from './utils/logger.js';

/**
 * Options for building copilot CLI arguments
 */
export interface CopilotArgsOptions {
  interactive: boolean;
  prompt?: string;
  agent?: string;
  allowAll?: boolean;
}

/**
 * Result of running an agent
 */
export interface AgentRunResult {
  success: boolean;
  exitCode: number;
  error?: string;
}

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
  retryableExitCodes: [429], // Rate limit
};

/**
 * Build copilot CLI arguments from config and options
 *
 * @param config - Speci configuration
 * @param options - Argument building options
 * @returns Array of CLI arguments
 *
 * @example
 * ```typescript
 * const args = buildCopilotArgs(config, { interactive: true });
 * // Returns: ['-i', '--allow-all']
 * ```
 */
export function buildCopilotArgs(
  config: SpeciConfig,
  options: CopilotArgsOptions
): string[] {
  const args: string[] = [];

  // Mode flag - interactive takes optional prompt argument
  // Non-interactive uses -p flag separately
  if (options.interactive) {
    if (options.prompt) {
      // Interactive mode with initial prompt: -i "prompt"
      args.push('-i', options.prompt);
    } else {
      // Interactive mode without prompt
      args.push('-i');
    }
  } else if (options.prompt) {
    // Non-interactive mode with prompt: -p "prompt"
    args.push('-p', options.prompt);
  }

  // Agent flag
  if (options.agent) {
    args.push(`--agent=${options.agent}`);
  }

  // Permission flag
  const { permissions } = config.copilot;
  if (permissions === 'allow-all') {
    args.push('--allow-all');
  } else if (permissions === 'yolo') {
    args.push('--yolo');
  }

  // Model flag
  if (config.copilot.model) {
    args.push('--model', config.copilot.model);
  }

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
      const agentFileName = `speci-${agentName}`;
      const args = buildCopilotArgs(config, {
        interactive: true,
        agent: agentFileName,
      });

      log.debug(`Spawning copilot: copilot ${args.join(' ')}`);
      const exitCode = await spawnCopilot(args);

      if (exitCode === 0) {
        return { success: true, exitCode: 0 };
      }

      lastExitCode = exitCode;

      // Check if retryable
      if (!policy.retryableExitCodes.includes(exitCode)) {
        return {
          success: false,
          exitCode,
          error: `Agent exited with code ${exitCode}`,
        };
      }
    } catch (err) {
      lastError = err as Error;

      // ENOENT is not retryable
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          exitCode: 127,
          error: 'Copilot CLI not found. Is it installed and in PATH?',
        };
      }
    }
  }

  return {
    success: false,
    exitCode: lastExitCode,
    error: lastError?.message ?? `Failed after ${policy.maxRetries} retries`,
  };
}
