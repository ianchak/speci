import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeSignalManager } from '@/adapters/node-signal-manager.js';
import type { CleanupFn } from '@/types.js';
import * as signalsModule from '@/utils/signals.js';

vi.mock('@/utils/signals.js', () => ({
  installSignalHandlers: vi.fn(),
  removeSignalHandlers: vi.fn(),
  registerCleanup: vi.fn(),
  unregisterCleanup: vi.fn(),
}));

describe('NodeSignalManager', () => {
  const adapter = new NodeSignalManager();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates install to installSignalHandlers', () => {
    adapter.install();
    expect(signalsModule.installSignalHandlers).toHaveBeenCalledTimes(1);
  });

  it('delegates remove to removeSignalHandlers', () => {
    adapter.remove();
    expect(signalsModule.removeSignalHandlers).toHaveBeenCalledTimes(1);
  });

  it('delegates registerCleanup to registerCleanup', () => {
    const fn: CleanupFn = async () => {};
    adapter.registerCleanup(fn);
    expect(signalsModule.registerCleanup).toHaveBeenCalledWith(fn);
  });

  it('delegates unregisterCleanup to unregisterCleanup', () => {
    const fn: CleanupFn = async () => {};
    adapter.unregisterCleanup(fn);
    expect(signalsModule.unregisterCleanup).toHaveBeenCalledWith(fn);
  });
});
