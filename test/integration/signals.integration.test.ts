import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductionContext } from '@/adapters/context-factory.js';
import { EXIT_CODE } from '@/constants.js';
import {
  installSignalHandlers,
  removeSignalHandlers,
} from '@/utils/infrastructure/signals.js';

const PROCESS_EXIT_CALLED_ERROR = 'process.exit called';

function createExitErrorListener(): Promise<unknown> {
  return new Promise((resolve) => {
    const onUnhandledRejection = (reason: unknown): void => {
      process.off('uncaughtException', onUncaughtException);
      resolve(reason);
    };
    const onUncaughtException = (error: Error): void => {
      process.off('unhandledRejection', onUnhandledRejection);
      resolve(error);
    };

    process.once('unhandledRejection', onUnhandledRejection);
    process.once('uncaughtException', onUncaughtException);
  });
}

async function emitSignalAndWait(signal: NodeJS.Signals): Promise<unknown> {
  const exitError = createExitErrorListener();
  process.emit(signal, signal);
  return Promise.race([
    exitError,
    new Promise((resolve) => setTimeout(resolve, 100)),
  ]);
}

describe('Signals Integration', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error(PROCESS_EXIT_CALLED_ERROR);
    });
  });

  afterEach(() => {
    removeSignalHandlers();
    vi.restoreAllMocks();
  });

  it('Test 1: registerCleanup via context.signalManager invokes cleanup on SIGINT', async () => {
    const context = createProductionContext();
    const cleanupFn = vi.fn();

    context.signalManager.registerCleanup(cleanupFn);
    installSignalHandlers();
    const exitError = await emitSignalAndWait('SIGINT');

    expect(cleanupFn).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODE.SIGINT);
    expect(String(exitError)).toContain(PROCESS_EXIT_CALLED_ERROR);
  });

  it('Test 2: registerCleanup via context.signalManager invokes cleanup on SIGTERM', async () => {
    const context = createProductionContext();
    const cleanupFn = vi.fn();

    context.signalManager.registerCleanup(cleanupFn);
    installSignalHandlers();
    const exitError = await emitSignalAndWait('SIGTERM');

    expect(cleanupFn).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODE.SIGTERM);
    expect(String(exitError)).toContain(PROCESS_EXIT_CALLED_ERROR);
  });

  it('Test 3: double SIGINT forces exit with SIGINT code', async () => {
    installSignalHandlers();

    await emitSignalAndWait('SIGINT');
    exitSpy.mockClear();

    expect(() => process.emit('SIGINT', 'SIGINT')).toThrow(
      PROCESS_EXIT_CALLED_ERROR
    );
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODE.SIGINT);
  });

  it('Test 4: removeSignalHandlers removes listeners and prevents second cleanup call', async () => {
    const context = createProductionContext();
    const cleanupFn = vi.fn();

    context.signalManager.registerCleanup(cleanupFn);
    installSignalHandlers();
    await emitSignalAndWait('SIGINT');
    const callsBeforeRemoval = cleanupFn.mock.calls.length;
    const listenersBeforeRemoval = process.listenerCount('SIGINT');

    removeSignalHandlers();
    const listenersAfterRemoval = process.listenerCount('SIGINT');
    process.emit('SIGINT', 'SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(listenersAfterRemoval).toBeLessThan(listenersBeforeRemoval);
    expect(cleanupFn).toHaveBeenCalledTimes(callsBeforeRemoval);
  });

  it('Test 5: cleanup errors still exit with SIGINT code', async () => {
    const context = createProductionContext();

    context.signalManager.registerCleanup(async () => {
      throw new Error('deliberate cleanup failure');
    });
    installSignalHandlers();
    const exitError = await emitSignalAndWait('SIGINT');

    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODE.SIGINT);
    expect(String(exitError)).toContain(PROCESS_EXIT_CALLED_ERROR);
  });
});
