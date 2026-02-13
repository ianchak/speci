/**
 * Command Helpers Module
 *
 * Provides shared utilities for command initialization to eliminate duplication
 * across plan, task, and refactor commands. Centralizes agent name resolution,
 * agent file validation, and common initialization sequence.
 */

import { resolveAgentPath } from '@/config.js';
import { preflight } from '@/utils/preflight.js';
import { getAgentFilename } from '@/constants.js';
import { createError } from '@/errors.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { CommandContext } from '@/interfaces.js';
import type { SpeciConfig } from '@/config.js';

/**
 * Agent name type - subset of commands that use agents
 */
type AgentCommandName =
  | 'plan'
  | 'task'
  | 'refactor'
  | 'impl'
  | 'review'
  | 'fix';

/**
 * Options for initializeCommand function
 */
export interface InitializeCommandOptions {
  /** Command name for agent resolution */
  commandName: AgentCommandName;
  /** Pre-loaded configuration (if not provided, will load from context) */
  config?: SpeciConfig;
  /** Skip preflight checks (useful for tests) */
  skipPreflight?: boolean;
  /** Dependency injection context (defaults to production) */
  context?: CommandContext;
}

/**
 * Result of command initialization
 */
export interface InitializeCommandResult {
  /** Loaded configuration */
  config: SpeciConfig;
  /** Normalized agent name without .agent.md suffix */
  agentName: string;
  /** Absolute path to agent file */
  agentPath: string;
}

/**
 * Get agent name for a command
 *
 * @param commandName - Command name for agent resolution
 * @returns Agent name without .agent.md suffix
 *
 * @example
 * ```typescript
 * normalizeAgentName('plan') // 'speci-plan'
 * normalizeAgentName('task') // 'speci-task'
 * ```
 */
export function normalizeAgentName(commandName: AgentCommandName): string {
  return getAgentFilename(commandName);
}

/**
 * Validate that agent file exists
 *
 * @param agentPath - Absolute path to agent file
 * @param context - Command context for filesystem access
 * @throws Error if agent file does not exist
 *
 * @example
 * ```typescript
 * validateAgentFile('/path/to/agent.md', context); // throws if not found
 * ```
 */
export function validateAgentFile(
  agentPath: string,
  context: CommandContext
): void {
  if (!context.fs.existsSync(agentPath)) {
    throw createError('ERR-INP-02', JSON.stringify({ path: agentPath }));
  }
}

/**
 * Initialize command with common setup sequence
 *
 * Orchestrates the full initialization sequence for agent-based commands:
 * 1. Load configuration (or use provided config)
 * 2. Run preflight checks (optional via skipPreflight)
 * 3. Normalize agent name
 * 4. Resolve agent path
 * 5. Validate agent file exists
 *
 * @param options - Initialization options
 * @returns Promise resolving to initialization result with config, agentName, agentPath
 * @throws Error if agent file not found or initialization fails
 *
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const { config, agentName, agentPath } = await initializeCommand({
 *   commandName: 'plan',
 * });
 *
 * // With pre-loaded config (avoids repeated loading)
 * const config = await context.configLoader.load();
 * const result = await initializeCommand({
 *   commandName: 'plan',
 *   config, // Pass pre-loaded config
 * });
 *
 * // For testing (skip preflight)
 * const result = await initializeCommand({
 *   commandName: 'refactor',
 *   skipPreflight: true,
 *   context: mockContext,
 * });
 * ```
 */
export async function initializeCommand(
  options: InitializeCommandOptions
): Promise<InitializeCommandResult> {
  const context = options.context || createProductionContext();

  // Step 1: Load configuration (or use provided config)
  const config = options.config ?? (await context.configLoader.load());

  // Step 2: Run preflight checks (optional)
  if (!options.skipPreflight) {
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
  }

  // Step 3: Normalize agent name
  const agentName = normalizeAgentName(options.commandName);

  // Step 4: Resolve agent path
  const agentPath = resolveAgentPath(options.commandName, context.process);

  // Step 5: Validate agent file exists
  validateAgentFile(agentPath, context);

  return {
    config,
    agentName,
    agentPath,
  };
}
