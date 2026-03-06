import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeSignalManager } from '@/adapters/node-signal-manager.js';
import {
  createMockContext,
  createMockProcess,
} from '@/adapters/test-context.js';
import type { CleanupFn } from '@/types.js';
import { SignalManager } from '@/utils/infrastructure/signals.js';

describe('NodeSignalManager', () => {
  const manager = new SignalManager();
  const adapter = new NodeSignalManager(manager, createMockContext().logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates install to installSignalHandlers', () => {
    const proc = createMockProcess();
    const spy = vi
      .spyOn(manager, 'installSignalHandlers')
      .mockImplementation(() => {});
    adapter.install(proc);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(proc, expect.anything());
  });

  it('delegates remove to removeSignalHandlers', () => {
    const spy = vi
      .spyOn(manager, 'removeSignalHandlers')
      .mockImplementation(() => {});
    adapter.remove();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('delegates registerCleanup to registerCleanup', () => {
    const spy = vi.spyOn(manager, 'registerCleanup');
    const fn: CleanupFn = async () => {};
    adapter.registerCleanup(fn);
    expect(spy).toHaveBeenCalledWith(fn);
  });

  it('delegates unregisterCleanup to unregisterCleanup', () => {
    const spy = vi.spyOn(manager, 'unregisterCleanup');
    const fn: CleanupFn = async () => {};
    adapter.unregisterCleanup(fn);
    expect(spy).toHaveBeenCalledWith(fn);
  });
});
