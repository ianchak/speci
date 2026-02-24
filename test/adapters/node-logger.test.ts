import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeLogger } from '@/adapters/node-logger.js';
import type { IProcess } from '@/interfaces.js';
import * as loggerModule from '@/utils/logger.js';

vi.mock('@/utils/logger.js', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    muted: vi.fn(),
    raw: vi.fn(),
    infoPlain: vi.fn(),
    warnPlain: vi.fn(),
    errorPlain: vi.fn(),
    successPlain: vi.fn(),
  },
  setLoggerProcess: vi.fn(),
  setVerbose: vi.fn(),
}));

function createMockProcess(): IProcess {
  return {
    env: {},
    cwd: () => 'C:\\mock',
    exit: (_code?: number): never => {
      throw new Error('exit');
    },
    pid: 123,
    platform: 'win32',
    stdout: process.stdout,
    stdin: process.stdin,
    on: vi.fn(),
  };
}

describe('NodeLogger', () => {
  let mockProcess: IProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
  });

  it('calls setLoggerProcess in constructor', () => {
    new NodeLogger(mockProcess);

    expect(loggerModule.setLoggerProcess).toHaveBeenCalledWith(mockProcess);
  });

  it('delegates info', () => {
    const logger = new NodeLogger(mockProcess);
    logger.info('info');
    expect(loggerModule.log.info).toHaveBeenCalledWith('info');
  });

  it('delegates error', () => {
    const logger = new NodeLogger(mockProcess);
    logger.error('error');
    expect(loggerModule.log.error).toHaveBeenCalledWith('error');
  });

  it('delegates warn', () => {
    const logger = new NodeLogger(mockProcess);
    logger.warn('warn');
    expect(loggerModule.log.warn).toHaveBeenCalledWith('warn');
  });

  it('delegates success', () => {
    const logger = new NodeLogger(mockProcess);
    logger.success('success');
    expect(loggerModule.log.success).toHaveBeenCalledWith('success');
  });

  it('delegates debug', () => {
    const logger = new NodeLogger(mockProcess);
    logger.debug('debug');
    expect(loggerModule.log.debug).toHaveBeenCalledWith('debug');
  });

  it('delegates muted', () => {
    const logger = new NodeLogger(mockProcess);
    logger.muted('muted');
    expect(loggerModule.log.muted).toHaveBeenCalledWith('muted');
  });

  it('delegates raw', () => {
    const logger = new NodeLogger(mockProcess);
    logger.raw('raw');
    expect(loggerModule.log.raw).toHaveBeenCalledWith('raw');
  });

  it('delegates infoPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.infoPlain('plain-info');
    expect(loggerModule.log.infoPlain).toHaveBeenCalledWith('plain-info');
  });

  it('delegates warnPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.warnPlain('plain-warn');
    expect(loggerModule.log.warnPlain).toHaveBeenCalledWith('plain-warn');
  });

  it('delegates errorPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.errorPlain('plain-error');
    expect(loggerModule.log.errorPlain).toHaveBeenCalledWith('plain-error');
  });

  it('delegates successPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.successPlain('plain-success');
    expect(loggerModule.log.successPlain).toHaveBeenCalledWith('plain-success');
  });

  it('delegates setVerbose', () => {
    const logger = new NodeLogger(mockProcess);
    logger.setVerbose(true);
    expect(loggerModule.setVerbose).toHaveBeenCalledWith(true);
  });
});
