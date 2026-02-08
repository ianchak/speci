import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleCommandError } from '../lib/utils/error-handler.js';
import type { ILogger } from '../lib/interfaces.js';

describe('error-handler', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
      debug: vi.fn(),
      muted: vi.fn(),
      raw: vi.fn(),
      setVerbose: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleCommandError', () => {
    it('should log error message and return result for Error instance', () => {
      const error = new Error('Test error message');
      const result = handleCommandError(error, 'TestCommand', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'TestCommand command failed: Test error message'
      );
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: 'Test error message',
      });
    });

    it('should log error message and return result for string error', () => {
      const error = 'String error message';
      const result = handleCommandError(error, 'AnotherCommand', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'AnotherCommand command failed: String error message'
      );
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: 'String error message',
      });
    });

    it('should log error message and return result for number error', () => {
      const error = 42;
      const result = handleCommandError(error, 'NumCommand', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'NumCommand command failed: 42'
      );
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: '42',
      });
    });

    it('should log error message and return result for object error', () => {
      const error = { code: 'ERR', details: 'Something went wrong' };
      const result = handleCommandError(error, 'ObjCommand', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'ObjCommand command failed: [object Object]'
      );
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: '[object Object]',
      });
    });

    it('should log error message and return result for null error', () => {
      const error = null;
      const result = handleCommandError(error, 'NullCommand', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'NullCommand command failed: null'
      );
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: 'null',
      });
    });

    it('should log error message and return result for undefined error', () => {
      const error = undefined;
      const result = handleCommandError(error, 'UndefCommand', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'UndefCommand command failed: undefined'
      );
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: 'undefined',
      });
    });

    it('should preserve command name in error message', () => {
      const error = new Error('Test');
      handleCommandError(error, 'SpecialCommand', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'SpecialCommand command failed: Test'
      );
    });

    it('should handle errors with multiline messages', () => {
      const error = new Error('Line 1\nLine 2\nLine 3');
      const result = handleCommandError(error, 'MultiLine', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'MultiLine command failed: Line 1\nLine 2\nLine 3'
      );
      expect(result.error).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle errors with empty messages', () => {
      const error = new Error('');
      const result = handleCommandError(error, 'EmptyMsg', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'EmptyMsg command failed: '
      );
      expect(result.error).toBe('');
    });
  });
});
