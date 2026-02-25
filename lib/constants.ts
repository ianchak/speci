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
  MVT_PAUSE: 'MVT verification required',
  MVT_PAUSE_INSTRUCTION:
    'Complete the MVT in PROGRESS.md, then re-run: speci run --verify',
  MVT_WARNING_HEADER: 'Incomplete MVTs from completed milestones',
  MVT_VERIFY_ENABLED: 'Human-in-the-loop mode (--verify) enabled',
  MVT_EXIT_CANCELLED:
    'Exiting. Complete the listed MVTs before re-running with --verify.',
  MVT_NON_TTY_ABORT:
    'Human-in-the-loop mode requires an interactive terminal. Use --yes to auto-continue past warnings.',
  MVT_AUTO_CONTINUE: 'Auto-continuing past MVT warnings (--yes)',
  // Sleep
  SLEEP_COUNTDOWN: 'Putting machine to sleep in {seconds} seconds...',
  SLEEP_SUCCESS: 'Sleep command dispatched successfully',
  SLEEP_FAILED: 'Failed to put machine to sleep: {error}',
  SLEEP_UNSUPPORTED: 'Sleep is not supported on platform: {platform}',
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
  /** Interrupted by SIGINT (128 + 2) */
  SIGINT: 130,
  /** Terminated by SIGTERM (128 + 15) */
  SIGTERM: 143,
} as const;

// ============================================================================
// Default Paths
// ============================================================================

/**
 * Default file and directory paths used by Speci
 */
export const DEFAULT_PATHS = {
  /** Default PROGRESS.md location */
  PROGRESS: 'docs/PROGRESS.md',
  /** Default tasks directory */
  TASKS: 'docs/tasks',
  /** Default logs directory */
  LOGS: '.speci-logs',
  /** Default lock file path */
  LOCK: '.speci-lock',
} as const;

/**
 * GitHub agents directory path
 */
export const GITHUB_AGENTS_DIR = '.github/agents';
