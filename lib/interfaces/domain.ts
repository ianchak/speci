import type {
  AgentRunResult,
  CleanupFn,
  CopilotArgsOptions,
  CurrentTask,
  MilestoneInfo,
  GateFailureInfo,
  GateResult,
  LockInfo,
  PreflightOptions,
  SpeciConfig,
  STATE,
  StateOptions,
  TaskStats,
} from '@/types.js';

import type { IProcess } from './infrastructure.js';

/**
 * Copilot runner interface
 *
 * Abstracts GitHub Copilot CLI execution to enable testing commands without
 * spawning real copilot processes.
 */
export interface ICopilotRunner {
  /**
   * Build copilot CLI arguments
   * @param config - Speci configuration
   * @param options - Argument building options
   * @returns Array of CLI arguments
   */
  buildArgs(config: SpeciConfig, options: CopilotArgsOptions): string[];

  /**
   * Spawn copilot process and wait for completion
   * @param args - CLI arguments
   * @param options - Spawn options
   * @returns Promise resolving to exit code
   */
  spawn(
    args: string[],
    options?: { inherit?: boolean; cwd?: string }
  ): Promise<number>;

  /**
   * Run agent with retry logic
   * @param config - Speci configuration
   * @param agentName - Name of agent to run
   * @param label - Human-readable label for logging
   * @returns Promise resolving to agent run result
   */
  run(
    config: SpeciConfig,
    agentName: string,
    label: string
  ): Promise<AgentRunResult>;
}

/**
 * State reader interface
 *
 * Abstracts PROGRESS.md state parsing to enable testing without filesystem I/O.
 * Provides state detection, task statistics, and failure note writing.
 */
export interface IStateReader {
  /**
   * Detect current orchestration state from PROGRESS.md
   * @param config - Speci configuration
   * @param options - Cache options
   * @returns Current state
   */
  getState(config: SpeciConfig, options?: StateOptions): Promise<STATE>;

  /**
   * Get aggregated task statistics from PROGRESS.md
   * @param config - Speci configuration
   * @param options - Cache options
   * @returns Task statistics
   */
  getTaskStats(config: SpeciConfig, options?: StateOptions): Promise<TaskStats>;

  /**
   * Get currently active task (IN PROGRESS or IN REVIEW)
   * @param config - Speci configuration
   * @param options - Cache options
   * @returns Current task or undefined
   */
  getCurrentTask(
    config: SpeciConfig,
    options?: StateOptions
  ): Promise<CurrentTask | undefined>;

  /**
   * Write gate failure notes into PROGRESS.md for the fix agent
   * @param config - Speci configuration
   * @param gateFailure - Gate failure information
   */
  writeFailureNotes(
    config: SpeciConfig,
    gateFailure: GateFailureInfo
  ): Promise<void>;

  /**
   * Get milestone-level MVT readiness status from PROGRESS.md
   * @param config - Speci configuration
   * @param options - Cache options
   * @returns Milestone status entries
   */
  getMilestonesMvtStatus(
    config: SpeciConfig,
    options?: StateOptions
  ): Promise<MilestoneInfo[]>;
}

/**
 * Lock manager interface
 *
 * Abstracts lock file operations to prevent concurrent speci run instances.
 * Uses atomic write pattern for race-free lock acquisition.
 */
export interface ILockManager {
  /**
   * Acquire the lock for execution
   * @param config - Speci configuration
   * @param processParam - IProcess instance
   * @param command - Command name
   * @param metadata - Optional lock metadata
   */
  acquire(
    config: SpeciConfig,
    processParam?: IProcess,
    command?: string,
    metadata?: { iteration?: number; taskId?: string; state?: string }
  ): Promise<void>;

  /**
   * Release the lock
   * @param config - Speci configuration
   */
  release(config: SpeciConfig): Promise<void>;

  /**
   * Check if lock file exists
   * @param config - Speci configuration
   * @returns true if locked
   */
  isLocked(config: SpeciConfig): Promise<boolean>;

  /**
   * Get lock information
   * @param config - Speci configuration
   * @returns Lock metadata
   */
  getInfo(config: SpeciConfig): Promise<LockInfo>;
}

/**
 * Gate runner interface
 *
 * Abstracts quality gate execution (lint, typecheck, test) to enable
 * testing without spawning real processes.
 */
export interface IGateRunner {
  /**
   * Run all gate commands
   * @param config - Speci configuration
   * @returns Aggregate gate result
   */
  run(config: SpeciConfig): Promise<GateResult>;

  /**
   * Check if gate can be retried
   * @param config - Speci configuration
   * @param attemptCount - Current number of fix attempts
   * @returns true if under maxFixAttempts limit
   */
  canRetry(config: SpeciConfig, attemptCount: number): boolean;
}

/**
 * Preflight checks interface
 *
 * Abstracts pre-execution environment validation to enable testing
 * without real environment checks.
 */
export interface IPreflight {
  /**
   * Run preflight checks
   * @param config - Speci configuration
   * @param options - Options to customize which checks run
   * @param processParam - IProcess instance
   * @throws {PreflightError} If any check fails
   */
  run(
    config: SpeciConfig,
    options?: PreflightOptions,
    processParam?: IProcess
  ): Promise<void>;
}

/**
 * Signal manager interface
 *
 * Abstracts signal handling for graceful shutdown to enable testing
 * without modifying real process signal handlers.
 */
export interface ISignalManager {
  /**
   * Install signal handlers for SIGINT and SIGTERM
   */
  install(): void;

  /**
   * Remove all signal handlers and reset state
   */
  remove(): void;

  /**
   * Register a cleanup function to be called on exit
   * @param fn - Cleanup function (sync or async)
   */
  registerCleanup(fn: CleanupFn): void;

  /**
   * Remove a cleanup function from the registry
   * @param fn - Cleanup function to remove
   */
  unregisterCleanup(fn: CleanupFn): void;
}
