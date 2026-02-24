import type {
  IConfigLoader,
  IFileSystem,
  ILogger,
  IProcess,
} from './infrastructure.js';
import type {
  ICopilotRunner,
  IGateRunner,
  ILockManager,
  IPreflight,
  ISignalManager,
  IStateReader,
} from './domain.js';

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
