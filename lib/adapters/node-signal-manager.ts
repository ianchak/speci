/**
 * Node Signal Manager Adapter
 *
 * Production implementation of ISignalManager that delegates to
 * the signals module for process signal handling.
 */

import type { ISignalManager } from '@/interfaces.js';
import type { CleanupFn } from '@/types.js';
import {
  installSignalHandlers,
  removeSignalHandlers,
  registerCleanup,
  unregisterCleanup,
} from '@/utils/signals.js';

/**
 * Production signal manager using the signals module
 */
export class NodeSignalManager implements ISignalManager {
  install(): void {
    installSignalHandlers();
  }

  remove(): void {
    removeSignalHandlers();
  }

  registerCleanup(fn: CleanupFn): void {
    registerCleanup(fn);
  }

  unregisterCleanup(fn: CleanupFn): void {
    unregisterCleanup(fn);
  }
}
