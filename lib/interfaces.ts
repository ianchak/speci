/**
 * Dependency Injection Interfaces
 *
 * Defines the foundational interface contracts for dependency injection across
 * the Speci codebase. These interfaces enable testable, loosely-coupled commands
 * by abstracting external dependencies (filesystem, process, logger, config, etc.).
 *
 * @see TASK_005_dependency_injection_interfaces.md
 */

import type {
  SpeciConfig,
  CopilotArgsOptions,
  AgentRunResult,
  STATE,
  TaskStats,
  CurrentTask,
  GateResult,
  GateFailureInfo,
  LockInfo,
  PreflightOptions,
  StateOptions,
  CleanupFn,
} from '@/types.js';

/**
 * Filesystem operations interface
 *
 * Abstracts node:fs operations to enable testing without actual filesystem I/O.
 * Includes both synchronous and asynchronous variants matching Node.js fs API.
 */
export interface IFileSystem {
  /**
   * Check if a file or directory exists (synchronous)
   * @param path - Path to check
   * @returns true if path exists
   */
  existsSync(path: string): boolean;

  /**
   * Read file contents (synchronous)
   * @param path - File path to read
   * @param encoding - Optional encoding (defaults to utf8)
   * @returns File contents as string
   */
  readFileSync(path: string, encoding?: BufferEncoding): string;

  /**
   * Write file contents (synchronous)
   * @param path - File path to write
   * @param data - Data to write
   * @param encoding - Optional encoding (defaults to utf8)
   */
  writeFileSync(
    path: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): void;

  /**
   * Create directory (synchronous)
   * @param path - Directory path to create
   * @param options - Options for directory creation
   */
  mkdirSync(path: string, options?: { recursive?: boolean }): void;

  /**
   * Delete file (synchronous)
   * @param path - File path to delete
   */
  unlinkSync(path: string): void;

  /**
   * Remove file or directory (synchronous)
   * @param path - Path to remove
   * @param options - Options for removal
   */
  rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean }
  ): void;

  /**
   * Read directory contents (synchronous)
   * @param path - Directory path to read
   * @returns Array of filenames in directory
   */
  readdirSync(path: string): string[];

  /**
   * Get file or directory statistics (synchronous)
   * @param path - Path to stat
   * @returns File stats object
   */
  statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
  };

  /**
   * Copy file (synchronous)
   * @param src - Source file path
   * @param dest - Destination file path
   */
  copyFileSync(src: string, dest: string): void;

  /**
   * Read file contents (asynchronous)
   * @param path - File path to read
   * @param encoding - Optional encoding (defaults to utf8)
   * @returns Promise resolving to file contents
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;

  /**
   * Write file contents (asynchronous)
   * @param path - File path to write
   * @param data - Data to write
   * @param encoding - Optional encoding (defaults to utf8)
   */
  writeFile(
    path: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ): Promise<void>;
}

/**
 * Process global abstraction interface
 *
 * Abstracts Node.js process global to enable testing without process manipulation.
 * Includes environment variables, working directory, exit, streams, platform info, and events.
 */
export interface IProcess {
  /**
   * Environment variables
   */
  env: NodeJS.ProcessEnv;

  /**
   * Get current working directory
   * @returns Current working directory path
   */
  cwd(): string;

  /**
   * Exit the process
   * @param code - Exit code (0 for success, non-zero for failure)
   */
  exit(code?: number): never;

  /**
   * Process ID
   */
  pid: number;

  /**
   * Operating system platform
   */
  platform: NodeJS.Platform;

  /**
   * Standard output stream
   */
  stdout: NodeJS.WriteStream;

  /**
   * Standard input stream
   */
  stdin: NodeJS.ReadStream;

  /**
   * Register event listener
   * @param event - Event name
   * @param listener - Event handler
   */
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Logger interface
 *
 * Standardized logging interface with semantic methods for different log levels.
 * Wraps existing logger utility to enable log capturing in tests.
 */
export interface ILogger {
  /**
   * Log informational message
   * @param message - Message to log
   */
  info(message: string): void;

  /**
   * Log informational message without glyph prefix
   * @param message - Message to log
   */
  infoPlain(message: string): void;

  /**
   * Log warning message without glyph prefix
   * @param message - Warning message to log
   */
  warnPlain(message: string): void;

  /**
   * Log error message without glyph prefix
   * @param message - Error message to log
   */
  errorPlain(message: string): void;

  /**
   * Log success message without glyph prefix
   * @param message - Success message to log
   */
  successPlain(message: string): void;

  /**
   * Log error message
   * @param message - Error message to log
   */
  error(message: string): void;

  /**
   * Log warning message
   * @param message - Warning message to log
   */
  warn(message: string): void;

  /**
   * Log success message
   * @param message - Success message to log
   */
  success(message: string): void;

  /**
   * Log debug message (only when verbose mode enabled)
   * @param message - Debug message to log
   */
  debug(message: string): void;

  /**
   * Log muted message
   * @param message - Message to log in muted style
   */
  muted(message: string): void;

  /**
   * Log raw message without any formatting or glyphs
   * @param message - Message to log as-is
   */
  raw(message: string): void;

  /**
   * Enable or disable verbose mode
   * @param enabled - Whether to enable verbose mode
   */
  setVerbose(enabled: boolean): void;
}

/**
 * Configuration loader interface
 *
 * Abstracts configuration loading to enable injecting test configurations.
 */
export interface IConfigLoader {
  /**
   * Load configuration from disk
   * @returns Promise resolving to Speci configuration
   */
  load(): Promise<SpeciConfig>;
}

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

/**
 * Command result type
 *
 * Standard return type for commands after migration to DI pattern.
 * Commands return results instead of calling process.exit(), enabling
 * better error handling and testability.
 */
export interface CommandResult {
  /**
   * Whether command completed successfully
   */
  success: boolean;

  /**
   * Exit code (0 for success, non-zero for failure)
   */
  exitCode: number;

  /**
   * Optional error message (when success is false)
   */
  error?: string;
}

/**
 * Command context container
 *
 * Single parameter to pass to commands, containing all dependencies.
 * Simplifies function signatures and makes dependency injection explicit.
 */
export interface CommandContext {
  /**
   * Filesystem operations
   */
  fs: IFileSystem;

  /**
   * Process abstraction
   */
  process: IProcess;

  /**
   * Logger
   */
  logger: ILogger;

  /**
   * Configuration loader
   */
  configLoader: IConfigLoader;

  /**
   * Copilot runner
   */
  copilotRunner: ICopilotRunner;

  /**
   * State reader (PROGRESS.md parsing)
   */
  stateReader: IStateReader;

  /**
   * Lock file manager
   */
  lockManager: ILockManager;

  /**
   * Quality gate runner
   */
  gateRunner: IGateRunner;

  /**
   * Preflight checks
   */
  preflight: IPreflight;

  /**
   * Signal/cleanup handler
   */
  signalManager: ISignalManager;
}
