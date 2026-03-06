/**
 * Node Signal Manager Adapter
 *
 * Production implementation of ISignalManager that delegates to
 * the signals module for process signal handling.
 */

import type { ILogger, IProcess, ISignalManager } from '@/interfaces/index.js';
import type { CleanupFn } from '@/types.js';
import type { SignalManager } from '@/utils/infrastructure/signals.js';

/**
 * Production signal manager using the signals module
 */
export class NodeSignalManager implements ISignalManager {
  constructor(
    private readonly manager: SignalManager,
    private readonly logger: ILogger
  ) {}

  install(proc?: IProcess): void {
    this.manager.installSignalHandlers(proc, this.logger);
  }

  remove(): void {
    this.manager.removeSignalHandlers();
  }

  registerCleanup(fn: CleanupFn): void {
    this.manager.registerCleanup(fn);
  }

  unregisterCleanup(fn: CleanupFn): void {
    this.manager.unregisterCleanup(fn);
  }
}
