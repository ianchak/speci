import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodePreflight } from '@/adapters/node-preflight.js';
import type { IProcess } from '@/interfaces.js';
import type { PreflightOptions, SpeciConfig } from '@/types.js';
import * as preflightModule from '@/utils/preflight.js';

vi.mock('@/utils/preflight.js', () => ({
  preflight: vi.fn(),
}));

describe('NodePreflight', () => {
  const config = {
    version: '1.0.0',
  } as unknown as SpeciConfig;
  const adapter = new NodePreflight();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates run with all arguments', async () => {
    const options: PreflightOptions = { requireGit: false };
    const mockProcess = process as unknown as IProcess;
    vi.mocked(preflightModule.preflight).mockResolvedValue();

    await adapter.run(config, options, mockProcess);

    expect(preflightModule.preflight).toHaveBeenCalledWith(
      config,
      options,
      mockProcess
    );
  });

  it('delegates run with optional args omitted', async () => {
    vi.mocked(preflightModule.preflight).mockResolvedValue();

    await adapter.run(config);

    expect(preflightModule.preflight).toHaveBeenCalledWith(
      config,
      undefined,
      undefined
    );
  });
});
