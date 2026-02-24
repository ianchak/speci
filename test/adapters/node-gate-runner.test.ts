import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeGateRunner } from '@/adapters/node-gate-runner.js';
import type { GateResult, SpeciConfig } from '@/types.js';
import * as gateModule from '@/utils/gate.js';

vi.mock('@/utils/gate.js', () => ({
  runGate: vi.fn(),
  canRetryGate: vi.fn(),
}));

describe('NodeGateRunner', () => {
  const config = {
    gate: { maxFixAttempts: 3 },
  } as unknown as SpeciConfig;
  const adapter = new NodeGateRunner();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates run to runGate', async () => {
    const expected: GateResult = {
      isSuccess: true,
      results: [],
      totalDuration: 0,
    };
    vi.mocked(gateModule.runGate).mockResolvedValue(expected);

    const result = await adapter.run(config);

    expect(gateModule.runGate).toHaveBeenCalledWith(config);
    expect(result).toBe(expected);
  });

  it('delegates canRetry to canRetryGate', () => {
    vi.mocked(gateModule.canRetryGate).mockReturnValue(true);

    const result = adapter.canRetry(config, 2);

    expect(gateModule.canRetryGate).toHaveBeenCalledWith(config, 2);
    expect(result).toBe(true);
  });
});
