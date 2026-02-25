import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '../../lib/constants.js';
import {
  SLEEP_DELAY_SECONDS,
  getSleepCommand,
  sleepAfterCommand,
} from '../../lib/utils/sleep.js';
import type { ILogger } from '../../lib/interfaces.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn(
    (
      _ms: number,
      _value?: unknown,
      options?: { signal?: AbortSignal }
    ): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          return;
        }

        const onAbort = (): void => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        };

        signal?.addEventListener('abort', onAbort, { once: true });
        queueMicrotask(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        });
      })
  ),
}));

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    infoPlain: vi.fn(),
    warnPlain: vi.fn(),
    errorPlain: vi.fn(),
    successPlain: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    muted: vi.fn(),
    raw: vi.fn(),
    setVerbose: vi.fn(),
  };
}

function getLatestSigintListener(
  baseline: NodeJS.SignalsListener[]
): (() => void) | null {
  const current = process.listeners('SIGINT');
  const added = current.find((listener) => !baseline.includes(listener));
  return added ? () => added('SIGINT') : null;
}

describe('sleep utility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('UT-1: getSleepCommand returns Windows command', () => {
    expect(getSleepCommand('win32')).toBe(
      'rundll32.exe powrprof.dll,SetSuspendState 0,1,0'
    );
  });

  it('UT-2: getSleepCommand returns macOS command', () => {
    expect(getSleepCommand('darwin')).toBe('pmset sleepnow');
  });

  it('UT-3: getSleepCommand returns Linux command', () => {
    expect(getSleepCommand('linux')).toBe('systemctl suspend');
  });

  it('UT-4: getSleepCommand returns null for unsupported platform', () => {
    expect(getSleepCommand('freebsd')).toBeNull();
  });

  it('UT-5: sleepAfterCommand logs countdown message', async () => {
    const logger = createLogger();
    const execFn = vi.fn();

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.info).toHaveBeenCalledWith(
      MESSAGES.SLEEP_COUNTDOWN.replace('{seconds}', String(SLEEP_DELAY_SECONDS))
    );
  });

  it('UT-6: sleepAfterCommand calls execFn with Linux command', async () => {
    const logger = createLogger();
    const execFn = vi.fn();

    await sleepAfterCommand('linux', logger, execFn);

    expect(execFn).toHaveBeenCalledWith('systemctl suspend');
  });

  it('UT-7: sleepAfterCommand calls execFn with macOS command', async () => {
    const logger = createLogger();
    const execFn = vi.fn();

    await sleepAfterCommand('darwin', logger, execFn);

    expect(execFn).toHaveBeenCalledWith('pmset sleepnow');
  });

  it('UT-8: sleepAfterCommand calls execFn with Windows command', async () => {
    const logger = createLogger();
    const execFn = vi.fn();

    await sleepAfterCommand('win32', logger, execFn);

    expect(execFn).toHaveBeenCalledWith(
      'rundll32.exe powrprof.dll,SetSuspendState 0,1,0'
    );
  });

  it('UT-9: unsupported platform warns and does not execute command', async () => {
    const logger = createLogger();
    const execFn = vi.fn();

    await sleepAfterCommand('freebsd', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_UNSUPPORTED.replace('{platform}', 'freebsd')
    );
    expect(execFn).not.toHaveBeenCalled();
  });

  it('UT-10: exec error is caught and logged', async () => {
    const logger = createLogger();
    const execFn = vi.fn(() => {
      throw new Error('exec failed');
    });

    await expect(sleepAfterCommand('linux', logger, execFn)).resolves.toBe(
      undefined
    );
    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'exec failed')
    );
  });

  it('UT-11: successful exec logs sleep success', async () => {
    const logger = createLogger();
    const execFn = vi.fn();

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.info).toHaveBeenCalledWith(MESSAGES.SLEEP_SUCCESS);
  });

  it('UT-12: SLEEP_DELAY_SECONDS is 5', () => {
    expect(SLEEP_DELAY_SECONDS).toBe(5);
  });

  it('UT-13: SIGINT during countdown aborts sleep', async () => {
    const logger = createLogger();
    const execFn = vi.fn();
    const baseline = process.listeners('SIGINT');

    const sleepPromise = sleepAfterCommand('linux', logger, execFn);
    getLatestSigintListener(baseline)?.();
    await sleepPromise;

    expect(execFn).not.toHaveBeenCalled();
  });

  it('UT-14: immediate cancellation during countdown aborts cleanly', async () => {
    const logger = createLogger();
    const execFn = vi.fn();
    const baseline = process.listeners('SIGINT');

    const sleepPromise = sleepAfterCommand('linux', logger, execFn);
    getLatestSigintListener(baseline)?.();
    getLatestSigintListener(baseline)?.();
    await sleepPromise;

    expect(execFn).not.toHaveBeenCalled();
  });

  it('UT-15: non-Error throwable from execFn is logged', async () => {
    const logger = createLogger();
    const execFn = vi.fn(() => {
      throw 'boom';
    });

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'boom')
    );
  });

  it('UT-16: empty platform string returns null', () => {
    expect(getSleepCommand('' as NodeJS.Platform)).toBeNull();
  });

  it('UT-17: no-op logger still calls execFn', async () => {
    const logger = createLogger();
    const execFn = vi.fn();

    await sleepAfterCommand('linux', logger, execFn);

    expect(execFn).toHaveBeenCalledWith('systemctl suspend');
  });

  it('UT-18: ETIMEDOUT from execFn logs SLEEP_FAILED', async () => {
    const logger = createLogger();
    const timeoutError = new Error('timed out') as Error & { code?: string };
    timeoutError.code = 'ETIMEDOUT';
    const execFn = vi.fn(() => {
      throw timeoutError;
    });

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'timed out')
    );
  });

  it('UT-19: sleep inhibited error from execFn logs SLEEP_FAILED', async () => {
    const logger = createLogger();
    const execFn = vi.fn(() => {
      throw new Error('sleep inhibited');
    });

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'sleep inhibited')
    );
  });

  it('UT-20: double SIGINT during countdown does not crash', async () => {
    const logger = createLogger();
    const execFn = vi.fn();
    const baseline = process.listeners('SIGINT');

    const sleepPromise = sleepAfterCommand('linux', logger, execFn);
    const listener = getLatestSigintListener(baseline);
    listener?.();
    listener?.();
    await sleepPromise;

    expect(execFn).not.toHaveBeenCalled();
  });

  it('UT-21: SIGINT-like exec error is logged', async () => {
    const logger = createLogger();
    const execFn = vi.fn(() => {
      throw new Error('SIGINT');
    });

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'SIGINT')
    );
  });

  it('UT-22: unsupported platforms return null', () => {
    expect(getSleepCommand('aix')).toBeNull();
    expect(getSleepCommand('sunos')).toBeNull();
    expect(getSleepCommand('openbsd')).toBeNull();
  });

  it('UT-23: non-AbortError countdown failure logs SLEEP_FAILED', async () => {
    vi.resetModules();
    vi.doMock('node:timers/promises', () => ({
      setTimeout: vi.fn().mockRejectedValue(new Error('timer fail')),
    }));
    const { sleepAfterCommand: mockedSleepAfterCommand } =
      await import('../../lib/utils/infrastructure/sleep.js');

    const logger = createLogger();
    const execFn = vi.fn();
    await mockedSleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'timer fail')
    );
    expect(execFn).not.toHaveBeenCalled();
  });

  it('UT-24: ENOENT error from execFn logs SLEEP_FAILED', async () => {
    const logger = createLogger();
    const enoentError = new Error('spawn ENOENT') as Error & { code?: string };
    enoentError.code = 'ENOENT';
    const execFn = vi.fn(() => {
      throw enoentError;
    });

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'spawn ENOENT')
    );
  });

  it('UT-25: permission denied from execFn logs SLEEP_FAILED', async () => {
    const logger = createLogger();
    const execFn = vi.fn(() => {
      throw new Error('Operation not permitted');
    });

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'Operation not permitted')
    );
  });

  it('UT-26: SIGINT listener is removed after completion', async () => {
    const logger = createLogger();
    const execFn = vi.fn();
    const before = process.listenerCount('SIGINT');

    await sleepAfterCommand('linux', logger, execFn);

    const after = process.listenerCount('SIGINT');
    expect(after).toBe(before);
  });

  it('UT-27: null throwable from execFn is logged', async () => {
    const logger = createLogger();
    const execFn = vi.fn(() => {
      throw null;
    });

    await sleepAfterCommand('linux', logger, execFn);

    expect(logger.warn).toHaveBeenCalledWith(
      MESSAGES.SLEEP_FAILED.replace('{error}', 'null')
    );
  });
});
