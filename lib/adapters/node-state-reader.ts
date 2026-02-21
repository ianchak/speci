/**
 * Node State Reader Adapter
 *
 * Production implementation of IStateReader that delegates to
 * the state module for PROGRESS.md parsing and manipulation.
 */

import type { IStateReader } from '@/interfaces.js';
import type {
  SpeciConfig,
  STATE,
  TaskStats,
  CurrentTask,
  GateFailureInfo,
  StateOptions,
} from '@/types.js';
import {
  getState,
  getTaskStats,
  getCurrentTask,
  writeFailureNotes,
} from '@/state.js';

/**
 * Production state reader using the state module
 */
export class NodeStateReader implements IStateReader {
  async getState(config: SpeciConfig, options?: StateOptions): Promise<STATE> {
    return getState(config, options);
  }

  async getTaskStats(
    config: SpeciConfig,
    options?: StateOptions
  ): Promise<TaskStats> {
    return getTaskStats(config, options);
  }

  async getCurrentTask(
    config: SpeciConfig,
    options?: StateOptions
  ): Promise<CurrentTask | undefined> {
    return getCurrentTask(config, options);
  }

  async writeFailureNotes(
    config: SpeciConfig,
    gateFailure: GateFailureInfo
  ): Promise<void> {
    return writeFailureNotes(config, gateFailure);
  }
}
