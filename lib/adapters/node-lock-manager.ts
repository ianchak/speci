/**
 * Node Lock Manager Adapter
 *
 * Production implementation of ILockManager that delegates to
 * the lock module for lock file operations.
 */

import type { ILockManager, ILogger, IProcess } from '@/interfaces/index.js';
import type { SpeciConfig, LockInfo } from '@/types.js';
import {
  acquireLock,
  releaseLock,
  isLocked,
  getLockInfo,
} from '@/utils/infrastructure/lock.js';

/**
 * Production lock manager using the lock module
 */
export class NodeLockManager implements ILockManager {
  constructor(private readonly logger: ILogger) {}

  async acquire(
    config: SpeciConfig,
    proc?: IProcess,
    command?: string,
    metadata?: { iteration?: number; taskId?: string; state?: string }
  ): Promise<void> {
    return acquireLock(config, proc, command, metadata, this.logger);
  }

  async release(config: SpeciConfig): Promise<void> {
    return releaseLock(config, this.logger);
  }

  async isLocked(config: SpeciConfig): Promise<boolean> {
    return isLocked(config);
  }

  async getInfo(config: SpeciConfig): Promise<LockInfo> {
    return getLockInfo(config);
  }
}
