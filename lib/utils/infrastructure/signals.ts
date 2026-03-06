/**
 * Signal Handling Module
 *
 * Provides robust signal handling for graceful shutdown when users interrupt
 * long-running operations with Ctrl+C (SIGINT) or when the process receives
 * SIGTERM. Includes cleanup registry for proper resource cleanup.
 */

import { log } from './logger.js';
import { EXIT_CODE } from '@/constants.js';
import type { ILogger, IProcess } from '@/interfaces/index.js';
import type { CleanupFn } from '@/types.js';

// Re-export for backward compatibility
export type { CleanupFn } from '@/types.js';

/**
 * Cleanup timeout configuration
 */
const CLEANUP_TIMEOUT_MS = 5000;

/**
 * Manages process signal handlers and graceful cleanup registration.
 */
export class SignalManager {
  private readonly cleanupRegistry: CleanupFn[] = [];
  private isCleaningUp = false;
  private signalReceived = false;
  private proc?: IProcess;
  private logger?: ILogger;

  /**
   * Returns true when cleanup is currently running.
   */
  isRunningCleanup = (): boolean => this.isCleaningUp;

  /**
   * Register a cleanup function to be called on exit.
   */
  registerCleanup = (fn: CleanupFn): void => {
    this.cleanupRegistry.push(fn);
  };

  /**
   * Remove a cleanup function from the registry.
   */
  unregisterCleanup = (fn: CleanupFn): void => {
    const index = this.cleanupRegistry.indexOf(fn);
    if (index !== -1) {
      this.cleanupRegistry.splice(index, 1);
    }
  };

  /**
   * Execute all registered cleanup functions in reverse order.
   */
  runCleanup = async (logger?: ILogger): Promise<void> => {
    const resolvedLogger = logger ?? this.logger ?? log;
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<{ status: 'timeout' }>((resolve) => {
      timeoutId = setTimeout(
        () => resolve({ status: 'timeout' }),
        CLEANUP_TIMEOUT_MS
      );
    });

    const cleanupPromise = (async () => {
      let hasError = false;
      let firstError: unknown = null;

      for (let i = this.cleanupRegistry.length - 1; i >= 0; i--) {
        try {
          await this.cleanupRegistry[i]();
        } catch (err) {
          resolvedLogger.error(
            `Cleanup error: ${err instanceof Error ? err.message : String(err)}`
          );
          if (!hasError) {
            hasError = true;
            firstError = err;
          }
        }
      }

      this.cleanupRegistry.length = 0;

      if (hasError) {
        throw firstError;
      }
    })();

    const cleanupOutcomePromise = cleanupPromise
      .then(() => ({ status: 'ok' as const }))
      .catch((error) => ({ status: 'error' as const, error }));

    try {
      const result = await Promise.race([
        cleanupOutcomePromise,
        timeoutPromise,
      ]);

      if (result.status === 'timeout') {
        const timeoutError = new Error('Cleanup timeout after 5s');
        resolvedLogger.error(
          `Cleanup did not complete in time: ${timeoutError.message}`
        );
        throw timeoutError;
      }

      if (result.status === 'error') {
        throw result.error;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.isCleaningUp = false;
    }
  };

  /**
   * Handle SIGINT (Ctrl+C).
   */
  handleSigint = (): void => {
    const resolvedLogger = this.logger ?? log;
    if (this.signalReceived) {
      resolvedLogger.errorPlain('\nForce exiting...');
      this.exitWithCode(EXIT_CODE.SIGINT);
    }

    this.signalReceived = true;
    resolvedLogger.infoPlain('\nInterrupted. Cleaning up...');

    this.runCleanup(resolvedLogger)
      .then(() => this.exitWithCode(EXIT_CODE.SIGINT))
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        resolvedLogger.error(
          `Cleanup failed during signal handler: ${errorMessage}`
        );
        if (err instanceof Error && err.stack) {
          resolvedLogger.error(`Stack trace: ${err.stack}`);
        }
        this.exitWithCode(EXIT_CODE.SIGINT);
      });
  };

  /**
   * Handle SIGTERM.
   */
  handleSigterm = (): void => {
    const resolvedLogger = this.logger ?? log;
    resolvedLogger.infoPlain('\nReceived SIGTERM. Shutting down gracefully...');

    this.runCleanup(resolvedLogger)
      .then(() => this.exitWithCode(EXIT_CODE.SIGTERM))
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        resolvedLogger.error(
          `Cleanup failed during signal handler: ${errorMessage}`
        );
        if (err instanceof Error && err.stack) {
          resolvedLogger.error(`Stack trace: ${err.stack}`);
        }
        this.exitWithCode(EXIT_CODE.SIGTERM);
      });
  };

  /**
   * Install signal handlers.
   */
  installSignalHandlers = (proc?: IProcess, logger?: ILogger): void => {
    this.proc = proc;
    this.logger = logger;
    const processRef = this.proc ?? process;
    processRef.on('SIGINT', this.handleSigint);
    processRef.on('SIGTERM', this.handleSigterm);
    if ((this.proc?.platform ?? process.platform) === 'win32') {
      processRef.on('SIGHUP', this.handleSigterm);
    }
  };

  /**
   * Remove signal handlers.
   */
  removeSignalHandlers = (): void => {
    const processRef = this.proc ?? process;
    processRef.off('SIGINT', this.handleSigint);
    processRef.off('SIGTERM', this.handleSigterm);
    if ((this.proc?.platform ?? process.platform) === 'win32') {
      processRef.off('SIGHUP', this.handleSigterm);
    }
    this.signalReceived = false;
  };

  private exitWithCode(code: number): never {
    if (this.proc) {
      return this.proc.exit(code);
    }
    return process.exit(code);
  }
}

export const defaultSignalManager = new SignalManager();

export const isRunningCleanup = (): boolean =>
  defaultSignalManager.isRunningCleanup();
export const registerCleanup = (fn: CleanupFn): void =>
  defaultSignalManager.registerCleanup(fn);
export const unregisterCleanup = (fn: CleanupFn): void =>
  defaultSignalManager.unregisterCleanup(fn);
export const runCleanup = (logger?: ILogger): Promise<void> =>
  defaultSignalManager.runCleanup(logger);
export const installSignalHandlers = (
  proc?: IProcess,
  logger?: ILogger
): void => defaultSignalManager.installSignalHandlers(proc, logger);
export const removeSignalHandlers = (): void =>
  defaultSignalManager.removeSignalHandlers();
