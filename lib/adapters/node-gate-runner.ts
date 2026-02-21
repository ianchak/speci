/**
 * Node Gate Runner Adapter
 *
 * Production implementation of IGateRunner that delegates to
 * the gate module for quality gate execution.
 */

import type { IGateRunner } from '@/interfaces.js';
import type { SpeciConfig, GateResult } from '@/types.js';
import { runGate, canRetryGate } from '@/utils/gate.js';

/**
 * Production gate runner using the gate module
 */
export class NodeGateRunner implements IGateRunner {
  async run(config: SpeciConfig): Promise<GateResult> {
    return runGate(config);
  }

  canRetry(config: SpeciConfig, attemptCount: number): boolean {
    return canRetryGate(config, attemptCount);
  }
}
