/**
 * Shared Type Definitions
 *
 * Central module for shared interfaces and types used across the Speci codebase.
 * This module has NO runtime dependencies - only pure type definitions and the STATE enum.
 *
 * Purpose:
 * - Reduce cross-module coupling by providing shared types in one location
 * - Enable dependency inversion (modules depend on interfaces, not implementations)
 * - Prevent circular dependencies by extracting types from implementation modules
 * - Improve testability by allowing interface-based mocking
 *
 * Design Principles:
 * - NO imports from other lib/ modules (except re-exports for compatibility)
 * - Only type definitions and enums (minimal runtime code)
 * - Interfaces should be stable and change infrequently
 * - Keep focused on most commonly used types (limit to ~10 interfaces)
 *
 * @see TASK_018_reduce_cross_module_coupling.md
 */

/**
 * State enum representing the current orchestration state
 *
 * The orchestrator reads PROGRESS.md and determines which state the loop is in:
 * - WORK_LEFT: Tasks exist that are NOT STARTED or IN PROGRESS
 * - IN_REVIEW: A task is marked IN REVIEW awaiting review agent
 * - BLOCKED: Tasks exist but all are BLOCKED on dependencies
 * - DONE: All tasks are COMPLETE
 * - NO_PROGRESS: No PROGRESS.md file exists
 */
export enum STATE {
  WORK_LEFT = 'WORK_LEFT',
  IN_REVIEW = 'IN_REVIEW',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
  NO_PROGRESS = 'NO_PROGRESS',
}

/**
 * Speci configuration interface
 *
 * Represents the structure of speci.config.json after loading and validation.
 * Configuration is loaded from the config file, merged with defaults, and
 * optionally overridden by environment variables.
 */
export interface SpeciConfig {
  version: string;
  paths: {
    progress: string;
    tasks: string;
    logs: string;
    lock: string;
  };
  copilot: {
    permissions: 'allow-all' | 'yolo' | 'strict' | 'none';
    models: {
      plan: string;
      task: string;
      refactor: string;
      impl: string;
      review: string;
      fix: string;
      tidy: string;
    };
    extraFlags: string[];
  };
  gate: {
    commands: string[];
    maxFixAttempts: number;
    strategy?: 'sequential' | 'parallel';
  };
  loop: {
    maxIterations: number;
  };
}

/**
 * Task statistics interface
 *
 * Aggregated statistics about tasks in PROGRESS.md.
 * Used by the status command and orchestrator for decision-making.
 */
export interface TaskStats {
  total: number;
  completed: number;
  remaining: number;
  inReview: number;
  blocked: number;
}

/**
 * Current task information
 *
 * Metadata about the currently active task (IN PROGRESS or IN REVIEW).
 * Used by the orchestrator to identify which task to process next.
 */
export interface CurrentTask {
  id: string;
  title: string;
  status: string;
}

/**
 * Command names that can have per-command model configuration
 *
 * These match the agent types defined in the config and correspond to
 * the agent prompt templates in templates/agents/.
 */
export type CommandName =
  | 'plan'
  | 'task'
  | 'refactor'
  | 'impl'
  | 'review'
  | 'fix'
  | 'tidy';

/**
 * Options for building copilot CLI arguments
 *
 * Used when invoking the GitHub Copilot CLI to run an agent.
 * Supports one-shot mode (-p flag), agent selection, and permission control.
 */
export interface CopilotArgsOptions {
  prompt?: string;
  agent: string;
  shouldAllowAll?: boolean;
  command: CommandName;
  /** Directory for session share logs (--share flag). When set, Copilot writes session markdown here. */
  logsDir?: string;
}

/**
 * Result of running an agent
 *
 * This is a discriminated union type that uses the `isSuccess` property as the discriminator.
 * When `isSuccess` is `true`, the result is guaranteed to have `exitCode: 0` with no error.
 * When `isSuccess` is `false`, the result is guaranteed to have a non-zero `exitCode` and an `error` message.
 *
 * This pattern enables type-safe error handling without optional chaining:
 *
 * @example
 * ```typescript
 * const result = await runAgent(config, 'impl', 'Implementation');
 * if (result.isSuccess) {
 *   // TypeScript knows exitCode is 0, error doesn't exist
 *   console.log('Success!');
 * } else {
 *   // TypeScript knows error exists (no optional chaining needed)
 *   console.error(result.error);
 * }
 * ```
 */
export type AgentRunResult =
  | { isSuccess: true; exitCode: 0 }
  | { isSuccess: false; exitCode: number; error: string };

// ============================================================================
// Gate Types
// ============================================================================

/**
 * Result from a single gate command execution
 *
 * Note: This interface keeps error as a string field (not optional) because
 * gate commands always return stderr output. On success, error will be empty string.
 */
export interface GateCommandResult {
  command: string;
  isSuccess: boolean;
  exitCode: number;
  output: string;
  error: string;
  duration: number;
}

/**
 * Aggregate result from all gate commands
 *
 * Discriminated union using `isSuccess` as discriminator.
 * When `isSuccess` is `true`, all commands passed and there is no error.
 * When `isSuccess` is `false`, at least one command failed and `error` contains the first failure message.
 */
export type GateResult =
  | { isSuccess: true; results: GateCommandResult[]; totalDuration: number }
  | {
      isSuccess: false;
      results: GateCommandResult[];
      error: string;
      totalDuration: number;
    };

/**
 * Minimal gate failure info needed to populate the For Fix Agent section.
 *
 * Intentionally narrow — avoids coupling state module to the full GateResult
 * discriminated union from the gate module.
 */
export interface GateFailureInfo {
  results: ReadonlyArray<{
    command: string;
    isSuccess: boolean;
    exitCode: number;
    error: string;
  }>;
  error: string;
}

// ============================================================================
// Lock Types
// ============================================================================

/**
 * Lock file data structure (JSON format)
 */
export interface LockFileData {
  version: string;
  pid: number;
  started: string; // ISO 8601 timestamp
  command: string;
  metadata?: {
    iteration?: number;
    taskId?: string;
    state?: string;
  };
}

/**
 * Lock information interface
 */
export interface LockInfo {
  isLocked: boolean;
  started: Date | null;
  pid: number | null;
  elapsed: string | null;
  command?: string;
  isStale?: boolean;
  metadata?: {
    iteration?: number;
    taskId?: string;
    state?: string;
  };
}

// ============================================================================
// Preflight Types
// ============================================================================

/**
 * Options for customizing which preflight checks to run
 */
export interface PreflightOptions {
  /** Check if Copilot CLI is installed (default: true) */
  requireCopilot?: boolean;
  /** Check if speci.config.json exists (default: true) */
  requireConfig?: boolean;
  /** Check if PROGRESS.md exists (default: false) */
  requireProgress?: boolean;
  /** Check if in git repository (default: true) */
  requireGit?: boolean;
  /** Check if agent files are present and up-to-date (default: true) */
  requireAgents?: boolean;
}

// ============================================================================
// State Types
// ============================================================================

/**
 * Options for state functions
 */
export interface StateOptions {
  /** Force cache bypass and read file */
  forceRefresh?: boolean;
  /** Cache TTL in milliseconds (default: 200ms) */
  ttl?: number;
}

// ============================================================================
// Signal Types
// ============================================================================

/**
 * Cleanup function type — sync or async
 */
export interface CleanupFn {
  (): Promise<void> | void;
}
