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
  agents: {
    plan: string | null;
    task: string | null;
    refactor: string | null;
    impl: string | null;
    review: string | null;
    fix: string | null;
    tidy: string | null;
  };
  copilot: {
    permissions: 'allow-all' | 'yolo' | 'strict' | 'none';
    model: string | null;
    models: {
      plan: string | null;
      task: string | null;
      refactor: string | null;
      impl: string | null;
      review: string | null;
      fix: string | null;
      tidy: string | null;
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
