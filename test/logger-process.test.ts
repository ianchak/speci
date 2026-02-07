import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setLoggerProcess, log } from '../lib/utils/logger.js';
import type { IProcess } from '../lib/interfaces.js';

describe('logger with IProcess', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    // Reset to real process
    setLoggerProcess(process);
  });

  it('should use mock process.env for debug mode detection', () => {
    const mockProcess: IProcess = {
      env: {
        SPECI_DEBUG: '1',
      },
      cwd: () => '/test',
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
    };

    setLoggerProcess(mockProcess);
    log.debug('test debug message');

    // Should output debug message when SPECI_DEBUG=1
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should not output debug when SPECI_DEBUG not set', () => {
    const mockProcess: IProcess = {
      env: {},
      cwd: () => '/test',
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
    };

    setLoggerProcess(mockProcess);
    log.debug('test debug message');

    // Should not output debug message when SPECI_DEBUG not set
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should recognize SPECI_DEBUG=true', () => {
    const mockProcess: IProcess = {
      env: {
        SPECI_DEBUG: 'true',
      },
      cwd: () => '/test',
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
    };

    setLoggerProcess(mockProcess);
    log.debug('test debug message');

    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should work with real process when not set', () => {
    // Don't set mock process, should use real one
    log.info('test message');

    // Should work without errors
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
