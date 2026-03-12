import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeLogger } from '@/adapters/node-logger.js';
import type { IProcess } from '@/interfaces/index.js';
import * as loggerModule from '@/utils/infrastructure/logger.js';

const mockCreatedLogger = {
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
  setVerbose: vi.fn(),
};

vi.mock('@/utils/infrastructure/logger.js', () => ({
  createLogger: vi.fn(() => mockCreatedLogger),
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
    version: 'v22.0.0',
    argv: ['node', 'speci'],
    stdout: process.stdout,
    stdin: process.stdin,
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe('NodeLogger', () => {
  let mockProcess: IProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();
  });

  it('creates a process-bound logger in constructor', () => {
    new NodeLogger(mockProcess);

    expect(loggerModule.createLogger).toHaveBeenCalledWith(mockProcess);
  });

  it('delegates info', () => {
    const logger = new NodeLogger(mockProcess);
    logger.info('info');
    expect(mockCreatedLogger.info).toHaveBeenCalledWith('info');
  });

  it('delegates error', () => {
    const logger = new NodeLogger(mockProcess);
    logger.error('error');
    expect(mockCreatedLogger.error).toHaveBeenCalledWith('error');
  });

  it('delegates warn', () => {
    const logger = new NodeLogger(mockProcess);
    logger.warn('warn');
    expect(mockCreatedLogger.warn).toHaveBeenCalledWith('warn');
  });

  it('delegates success', () => {
    const logger = new NodeLogger(mockProcess);
    logger.success('success');
    expect(mockCreatedLogger.success).toHaveBeenCalledWith('success');
  });

  it('delegates debug', () => {
    const logger = new NodeLogger(mockProcess);
    logger.debug('debug');
    expect(mockCreatedLogger.debug).toHaveBeenCalledWith('debug');
  });

  it('delegates muted', () => {
    const logger = new NodeLogger(mockProcess);
    logger.muted('muted');
    expect(mockCreatedLogger.muted).toHaveBeenCalledWith('muted');
  });

  it('delegates raw', () => {
    const logger = new NodeLogger(mockProcess);
    logger.raw('raw');
    expect(mockCreatedLogger.raw).toHaveBeenCalledWith('raw');
  });

  it('delegates infoPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.infoPlain('plain-info');
    expect(mockCreatedLogger.infoPlain).toHaveBeenCalledWith('plain-info');
  });

  it('delegates warnPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.warnPlain('plain-warn');
    expect(mockCreatedLogger.warnPlain).toHaveBeenCalledWith('plain-warn');
  });

  it('delegates errorPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.errorPlain('plain-error');
    expect(mockCreatedLogger.errorPlain).toHaveBeenCalledWith('plain-error');
  });

  it('delegates successPlain', () => {
    const logger = new NodeLogger(mockProcess);
    logger.successPlain('plain-success');
    expect(mockCreatedLogger.successPlain).toHaveBeenCalledWith(
      'plain-success'
    );
  });

  it('delegates setVerbose', () => {
    const logger = new NodeLogger(mockProcess);
    logger.setVerbose(true);
    expect(mockCreatedLogger.setVerbose).toHaveBeenCalledWith(true);
  });
});
