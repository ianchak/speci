import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeConfigLoader } from '@/adapters/node-config-loader.js';
import { createMockContext } from '@/adapters/test-context.js';
import type { IFileSystem, IProcess } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';
import * as configModule from '@/config/index.js';

vi.mock('@/config/index.js', () => ({
  loadConfig: vi.fn(),
}));

describe('NodeConfigLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates load to loadConfig with proc and fs', async () => {
    const mockProcess = process as unknown as IProcess;
    const mockFs = {} as IFileSystem;
    const adapter = new NodeConfigLoader(
      mockProcess,
      mockFs,
      createMockContext().logger
    );
    const expectedConfig = {
      version: '1.0.0',
    } as unknown as SpeciConfig;
    vi.mocked(configModule.loadConfig).mockReturnValue(expectedConfig);

    const result = await adapter.load();

    expect(configModule.loadConfig).toHaveBeenCalledWith({
      proc: mockProcess,
      fs: mockFs,
      logger: expect.anything(),
    });
    expect(result).toBe(expectedConfig);
  });
});
