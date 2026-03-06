/**
 * Node State Reader Adapter
 *
 * Production implementation of IStateReader that delegates to
 * the state module for PROGRESS.md parsing and manipulation.
 */

import type { IFileSystem, IStateReader } from '@/interfaces/index.js';
import type {
  SpeciConfig,
  STATE,
  TaskStats,
  CurrentTask,
  MilestoneInfo,
  GateFailureInfo,
  StateOptions,
} from '@/types.js';
import {
  StateCache,
  getState,
  getTaskStats,
  getCurrentTask,
  getMilestonesMvtStatus,
  writeFailureNotes,
} from '@/state.js';

/**
 * Production state reader using the state module
 */
export class NodeStateReader implements IStateReader {
  private readonly cache = new StateCache();

  constructor(private readonly fs: IFileSystem) {}

  async getState(config: SpeciConfig, options?: StateOptions): Promise<STATE> {
    const requestOptions: StateOptions & { cache: StateCache } = {
      ...options,
      fs: this.fs,
      cache: this.cache,
    };
    return getState(config, requestOptions);
  }

  async getTaskStats(
    config: SpeciConfig,
    options?: StateOptions
  ): Promise<TaskStats> {
    const requestOptions: StateOptions & { cache: StateCache } = {
      ...options,
      fs: this.fs,
      cache: this.cache,
    };
    return getTaskStats(config, requestOptions);
  }

  async getCurrentTask(
    config: SpeciConfig,
    options?: StateOptions
  ): Promise<CurrentTask | undefined> {
    const requestOptions: StateOptions & { cache: StateCache } = {
      ...options,
      fs: this.fs,
      cache: this.cache,
    };
    return getCurrentTask(config, requestOptions);
  }

  async writeFailureNotes(
    config: SpeciConfig,
    gateFailure: GateFailureInfo
  ): Promise<void> {
    return writeFailureNotes(config, gateFailure, { fs: this.fs });
  }

  async getMilestonesMvtStatus(
    config: SpeciConfig,
    options?: StateOptions
  ): Promise<MilestoneInfo[]> {
    const requestOptions: StateOptions & { cache: StateCache } = {
      ...options,
      fs: this.fs,
      cache: this.cache,
    };
    return getMilestonesMvtStatus(config, requestOptions);
  }

  resetCache(): void {
    this.cache.reset();
  }
}
