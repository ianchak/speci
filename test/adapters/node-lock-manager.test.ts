import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeLockManager } from '@/adapters/node-lock-manager.js';
import { createMockContext } from '@/adapters/test-context.js';
import type { IProcess } from '@/interfaces/index.js';
import type { LockInfo, SpeciConfig } from '@/types.js';
import * as lockModule from '@/utils/infrastructure/lock.js';

vi.mock('@/utils/infrastructure/lock.js', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  isLocked: vi.fn(),
  getLockInfo: vi.fn(),
}));

describe('NodeLockManager', () => {
  const config = {
    paths: { lock: '.speci-lock' },
  } as unknown as SpeciConfig;
  const adapter = new NodeLockManager(createMockContext().logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates acquire with optional args omitted', async () => {
    vi.mocked(lockModule.acquireLock).mockResolvedValue();

    await adapter.acquire(config);

    expect(lockModule.acquireLock).toHaveBeenCalledWith(
      config,
      undefined,
      undefined,
      undefined,
      expect.anything()
    );
  });

  it('delegates acquire with all arguments', async () => {
    const mockProcess = process as unknown as IProcess;
    const metadata = { iteration: 3, taskId: 'TASK_035', state: 'IN_PROGRESS' };
    vi.mocked(lockModule.acquireLock).mockResolvedValue();

    await adapter.acquire(config, mockProcess, 'run', metadata);

    expect(lockModule.acquireLock).toHaveBeenCalledWith(
      config,
      mockProcess,
      'run',
      metadata,
      expect.anything()
    );
  });

  it('delegates release to releaseLock', async () => {
    vi.mocked(lockModule.releaseLock).mockResolvedValue();

    await adapter.release(config);

    expect(lockModule.releaseLock).toHaveBeenCalledWith(
      config,
      expect.anything()
    );
  });

  it('delegates isLocked to isLocked', async () => {
    vi.mocked(lockModule.isLocked).mockResolvedValue(true);

    const result = await adapter.isLocked(config);

    expect(lockModule.isLocked).toHaveBeenCalledWith(config);
    expect(result).toBe(true);
  });

  it('delegates getInfo to getLockInfo', async () => {
    const lockInfo = {
      isLocked: true,
      pid: 1234,
      started: new Date('2026-02-24T00:00:00.000Z'),
      elapsed: '1s',
      command: 'run',
      isStale: false,
    } as LockInfo;
    vi.mocked(lockModule.getLockInfo).mockResolvedValue(lockInfo);

    const result = await adapter.getInfo(config);

    expect(lockModule.getLockInfo).toHaveBeenCalledWith(config);
    expect(result).toBe(lockInfo);
  });
});
