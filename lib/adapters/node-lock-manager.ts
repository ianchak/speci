/**
 * Node Lock Manager Adapter
 *
 * Production implementation of ILockManager that delegates to
 * the lock module for lock file operations.
 */

import type { ILockManager, IProcess } from '@/interfaces.js';
import type { SpeciConfig, LockInfo } from '@/types.js';
import {
  acquireLock,
  releaseLock,
  isLocked,
  getLockInfo,
} from '@/utils/lock.js';

/**
 * Production lock manager using the lock module
 */
export class NodeLockManager implements ILockManager {
  async acquire(
    config: SpeciConfig,
    processParam?: IProcess,
    command?: string,
    metadata?: { iteration?: number; taskId?: string; state?: string }
  ): Promise<void> {
    return acquireLock(config, processParam, command, metadata);
  }

  async release(config: SpeciConfig): Promise<void> {
    return releaseLock(config);
  }

  async isLocked(config: SpeciConfig): Promise<boolean> {
    return isLocked(config);
  }

  async getInfo(config: SpeciConfig): Promise<LockInfo> {
    return getLockInfo(config);
  }
}
