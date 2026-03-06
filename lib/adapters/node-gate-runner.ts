/**
 * Node Gate Runner Adapter
 *
 * Production implementation of IGateRunner that delegates to
 * the gate module for quality gate execution.
 */

import type { IGateRunner, ILogger } from '@/interfaces/index.js';
import type { SpeciConfig, GateResult } from '@/types.js';
import { runGate, canRetryGate } from '@/utils/infrastructure/gate.js';

/**
 * Production gate runner using the gate module
 */
export class NodeGateRunner implements IGateRunner {
  constructor(private readonly logger: ILogger) {}

  async run(config: SpeciConfig): Promise<GateResult> {
    return runGate(config, this.logger);
  }

  canRetry(config: SpeciConfig, attemptCount: number): boolean {
    return canRetryGate(config, attemptCount);
  }
}
