/**
 * Constants Module
 *
 * Central repository for all string literals and magic values used throughout the codebase.
 * Reduces duplication, prevents typos, and provides a single source of truth for configuration values.
 */

// ============================================================================
// File System Constants
// ============================================================================

/**
 * Name of the Speci configuration file
 */
export const CONFIG_FILENAME = 'speci.config.json';

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Environment variable names used by Speci
 */
export const ENV = {
  /** Debug mode flag - set to '1' or 'true' to enable verbose logging */
  SPECI_DEBUG: 'SPECI_DEBUG',
  /** Universal color disable flag - set to any value to disable colors */
  NO_COLOR: 'NO_COLOR',
  /** Force color enable flag - set to any value to enable colors in non-TTY */
  FORCE_COLOR: 'FORCE_COLOR',
} as const;

// ============================================================================
// Agent Naming
// ============================================================================

/**
 * Prefix used for agent filenames
 */
export const AGENT_FILENAME_PREFIX = 'speci-';

/**
 * Generates an agent filename with the standard prefix
 *
 * @param agentName - Name of the agent (e.g., 'plan', 'impl', 'review')
 * @returns Full agent filename (e.g., 'speci-plan')
 *
 * @example
 * ```typescript
 * const filename = getAgentFilename('plan'); // 'speci-plan'
 * ```
 */
export function getAgentFilename(agentName: string): string {
  return `${AGENT_FILENAME_PREFIX}${agentName}`;
}

// ============================================================================
// Common Messages
// ============================================================================

/**
 * Commonly used user-facing messages
 */
export const MESSAGES = {
  /** Instruction to run speci init command */
  RUN_INIT: 'Run speci init to create configuration',
} as const;

// ============================================================================
// Exit Codes
// ============================================================================

/**
 * Standard process exit codes
 */
export const EXIT_CODE = {
  /** Successful execution */
  SUCCESS: 0,
  /** Error during execution */
  ERROR: 1,
} as const;
