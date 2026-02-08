import { describe, it, expect } from 'vitest';
import type { ValidationResult, ValidationError } from '@/validation/types.js';

describe('ValidationResult type', () => {
  it('should accept success result', () => {
    const result: ValidationResult<string> = {
      success: true,
      value: 'test-value',
    };

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('test-value');
    }
  });

  it('should accept failure result', () => {
    const result: ValidationResult<string> = {
      success: false,
      error: {
        field: 'test',
        message: 'Test error',
        suggestions: ['Fix it'],
      },
    };

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('test');
      expect(result.error.message).toBe('Test error');
      expect(result.error.suggestions).toEqual(['Fix it']);
    }
  });

  it('should work with different value types', () => {
    const stringResult: ValidationResult<string> = {
      success: true,
      value: 'string',
    };
    const numberResult: ValidationResult<number> = {
      success: true,
      value: 42,
    };
    const objectResult: ValidationResult<{ key: string }> = {
      success: true,
      value: { key: 'value' },
    };

    expect(stringResult.success).toBe(true);
    expect(numberResult.success).toBe(true);
    expect(objectResult.success).toBe(true);
  });
});

describe('ValidationError type', () => {
  it('should accept error with all fields', () => {
    const error: ValidationError = {
      field: 'username',
      message: 'Username is required',
      suggestions: ['Provide a username', 'Use --user flag'],
    };

    expect(error.field).toBe('username');
    expect(error.message).toBe('Username is required');
    expect(error.suggestions).toHaveLength(2);
  });

  it('should accept error with optional field undefined', () => {
    const error: ValidationError = {
      message: 'Something went wrong',
      suggestions: ['Try again'],
    };

    expect(error.field).toBeUndefined();
    expect(error.message).toBe('Something went wrong');
  });

  it('should accept error with optional suggestions undefined', () => {
    const error: ValidationError = {
      field: 'config',
      message: 'Invalid configuration',
    };

    expect(error.suggestions).toBeUndefined();
  });

  it('should accept error with only message', () => {
    const error: ValidationError = {
      message: 'Error occurred',
    };

    expect(error.field).toBeUndefined();
    expect(error.suggestions).toBeUndefined();
    expect(error.message).toBe('Error occurred');
  });
});
