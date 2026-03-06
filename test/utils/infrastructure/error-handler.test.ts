import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  failValidation,
  failResult,
  handleCommandError,
  toErrorMessage,
} from '../../../lib/utils/infrastructure/error-handler.js';
import type { ILogger } from '../../../lib/interfaces/index.js';

describe('error-handler', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleCommandError', () => {
    it('should handle ERR-INP-02 error name with init guidance regardless of message content', () => {
      const error = new Error('Some unrelated error message');
      error.name = 'ERR-INP-02';
      const result = handleCommandError(error, 'Task', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(error.message);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Run "speci init" to create agents'
      );
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: error.message,
      });
    });

    it('should handle plain agent file not found errors with generic error path', () => {
      const error = new Error(
        'Agent file not found: /path/to/speci-plan.agent.md'
      );
      const result = handleCommandError(error, 'Plan', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Plan command failed: ${error.message}`
      );
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: error.message,
      });
    });

    it('should not special-case errors when only message includes ERR-INP-02', () => {
      const error = new Error(
        '[ERR-INP-02] Agent file not found: /path/to/speci-task.agent.md'
      );
      const result = handleCommandError(error, 'Task', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Task command failed: ${error.message}`
      );
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: error.message,
      });
    });

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

  describe('toErrorMessage', () => {
    it('should return message for Error instances', () => {
      expect(toErrorMessage(new Error('oops'))).toBe('oops');
    });

    it('should return string values as-is', () => {
      expect(toErrorMessage('raw string')).toBe('raw string');
    });

    it('should convert non-string values to string', () => {
      expect(toErrorMessage(42)).toBe('42');
    });
  });

  describe('failResult', () => {
    it('should create failure result with default exit code', () => {
      expect(failResult('bad input')).toEqual({
        success: false,
        exitCode: 1,
        error: 'bad input',
      });
    });

    it('should create failure result with custom exit code', () => {
      expect(failResult('bad input', 2)).toEqual({
        success: false,
        exitCode: 2,
        error: 'bad input',
      });
    });
  });

  describe('failValidation', () => {
    it('should log error message and suggestions, then return failure result', () => {
      const error = {
        field: 'plan',
        message: 'Plan file is required',
        suggestions: ['Use --plan <path>', 'Check file path'],
      };

      const result = failValidation(error, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith('Plan file is required');
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenNthCalledWith(1, 'Use --plan <path>');
      expect(mockLogger.info).toHaveBeenNthCalledWith(2, 'Check file path');
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: 'Plan file is required',
      });
    });

    it('should not log suggestions when none are provided', () => {
      const error = {
        field: 'scope',
        message: 'Invalid scope',
      };

      const result = failValidation(error, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith('Invalid scope');
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        exitCode: 1,
        error: 'Invalid scope',
      });
    });
  });
});
