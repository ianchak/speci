import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeConfigLoader } from '@/adapters/node-config-loader.js';
import type { IProcess } from '@/interfaces.js';
import type { SpeciConfig } from '@/types.js';
import * as configModule from '@/config.js';

vi.mock('@/config.js', () => ({
  loadConfig: vi.fn(),
}));

describe('NodeConfigLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates load to loadConfig with processParam', async () => {
    const mockProcess = process as unknown as IProcess;
    const adapter = new NodeConfigLoader(mockProcess);
    const expectedConfig = {
      version: '1.0.0',
    } as unknown as SpeciConfig;
    vi.mocked(configModule.loadConfig).mockReturnValue(expectedConfig);

    const result = await adapter.load();

    expect(configModule.loadConfig).toHaveBeenCalledWith({
      processParam: mockProcess,
    });
    expect(result).toBe(expectedConfig);
  });
});
