/**
 * Tests for Documentation Task (TASK_028)
 *
 * Tests verbose mode, error codes, and JSDoc functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setVerbose, isVerbose, debug, logError } from '../lib/utils/logger.js';
import {
  ERROR_CODES,
  getErrorDefinition,
  formatError,
  createError,
} from '../lib/errors.js';

describe('Verbose Mode', () => {
  beforeEach(() => {
    // Reset verbose mode before each test
    setVerbose(false);
    delete process.env.SPECI_DEBUG;
  });

  afterEach(() => {
    // Clean up after each test
    setVerbose(false);
    delete process.env.SPECI_DEBUG;
  });

  it('should be disabled by default', () => {
    expect(isVerbose()).toBe(false);
  });

  it('should enable verbose mode via setVerbose()', () => {
    setVerbose(true);
    expect(isVerbose()).toBe(true);
  });

  it('should disable verbose mode via setVerbose()', () => {
    setVerbose(true);
    setVerbose(false);
    expect(isVerbose()).toBe(false);
  });

  it('should enable verbose mode via SPECI_DEBUG=1', () => {
    process.env.SPECI_DEBUG = '1';
    expect(isVerbose()).toBe(true);
  });

  it('should enable verbose mode via SPECI_DEBUG=true', () => {
    process.env.SPECI_DEBUG = 'true';
    expect(isVerbose()).toBe(true);
  });

  it('should not enable verbose mode via SPECI_DEBUG=0', () => {
    process.env.SPECI_DEBUG = '0';
    expect(isVerbose()).toBe(false);
  });

  it('should prioritize setVerbose over environment', () => {
    process.env.SPECI_DEBUG = '0';
    setVerbose(true);
    expect(isVerbose()).toBe(true);
  });
});

describe('Debug Logging', () => {
  beforeEach(() => {
    setVerbose(false);
  });

  afterEach(() => {
    setVerbose(false);
  });

  it('should not throw when verbose is disabled', () => {
    expect(() => debug('test message')).not.toThrow();
  });

  it('should not throw when verbose is enabled', () => {
    setVerbose(true);
    expect(() => debug('test message')).not.toThrow();
  });

  it('should handle data parameter', () => {
    setVerbose(true);
    expect(() => debug('test', { foo: 'bar' })).not.toThrow();
  });

  it('should handle undefined data', () => {
    setVerbose(true);
    expect(() => debug('test', undefined)).not.toThrow();
  });
});

describe('Error Logging', () => {
  it('should log error without stack trace when verbose disabled', () => {
    const error = new Error('Test error');
    expect(() => logError(error)).not.toThrow();
  });

  it('should log error with stack trace when verbose enabled', () => {
    setVerbose(true);
    const error = new Error('Test error');
    expect(() => logError(error)).not.toThrow();
  });

  it('should handle error with context', () => {
    const error = new Error('Test error');
    expect(() => logError(error, 'Test context')).not.toThrow();
  });

  it('should handle error without stack', () => {
    const error = new Error('Test error');
    delete error.stack;
    setVerbose(true);
    expect(() => logError(error)).not.toThrow();
  });
});

describe('Error Codes', () => {
  it('should contain all documented error codes', () => {
    expect(ERROR_CODES).toBeDefined();
    expect(Object.keys(ERROR_CODES).length).toBeGreaterThan(0);
  });

  it('should have prerequisite error codes', () => {
    expect(ERROR_CODES['ERR-PRE-01']).toBeDefined();
    expect(ERROR_CODES['ERR-PRE-02']).toBeDefined();
    expect(ERROR_CODES['ERR-PRE-03']).toBeDefined();
  });

  it('should have input error codes', () => {
    expect(ERROR_CODES['ERR-INP-01']).toBeDefined();
    expect(ERROR_CODES['ERR-INP-02']).toBeDefined();
    expect(ERROR_CODES['ERR-INP-03']).toBeDefined();
  });

  it('should have state error codes', () => {
    expect(ERROR_CODES['ERR-STA-01']).toBeDefined();
    expect(ERROR_CODES['ERR-STA-02']).toBeDefined();
  });

  it('should have execution error codes', () => {
    expect(ERROR_CODES['ERR-EXE-01']).toBeDefined();
    expect(ERROR_CODES['ERR-EXE-02']).toBeDefined();
  });

  it('should have message, cause, and solution for each code', () => {
    Object.values(ERROR_CODES).forEach((def) => {
      expect(def.message).toBeDefined();
      expect(def.message.length).toBeGreaterThan(0);
      expect(def.cause).toBeDefined();
      expect(def.cause.length).toBeGreaterThan(0);
      expect(def.solution).toBeDefined();
      expect(def.solution.length).toBeGreaterThan(0);
    });
  });
});

describe('getErrorDefinition', () => {
  it('should return definition for valid code', () => {
    const def = getErrorDefinition('ERR-PRE-01');
    expect(def).toBeDefined();
    expect(def?.message).toBe('Copilot CLI is not installed');
  });

  it('should return undefined for invalid code', () => {
    const def = getErrorDefinition('ERR-INVALID-99');
    expect(def).toBeUndefined();
  });

  it('should return definition with all fields', () => {
    const def = getErrorDefinition('ERR-PRE-01');
    expect(def).toHaveProperty('message');
    expect(def).toHaveProperty('cause');
    expect(def).toHaveProperty('solution');
  });
});

describe('formatError', () => {
  it('should format error with code', () => {
    const formatted = formatError('ERR-PRE-01');
    expect(formatted).toContain('[ERR-PRE-01]');
    expect(formatted).toContain('Copilot CLI is not installed');
    expect(formatted).toContain('Cause:');
    expect(formatted).toContain('Solution:');
  });

  it('should format error with context', () => {
    const formatted = formatError('ERR-PRE-01', 'during init command');
    expect(formatted).toContain('[ERR-PRE-01]');
    expect(formatted).toContain('Context: during init command');
  });

  it('should handle unknown error code', () => {
    const formatted = formatError('ERR-UNKNOWN-99');
    expect(formatted).toContain('Unknown error code');
  });

  it('should format multiline message', () => {
    const formatted = formatError('ERR-PRE-01');
    const lines = formatted.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('createError', () => {
  it('should create Error object', () => {
    const error = createError('ERR-PRE-01');
    expect(error).toBeInstanceOf(Error);
  });

  it('should set error name to code', () => {
    const error = createError('ERR-PRE-01');
    expect(error.name).toBe('ERR-PRE-01');
  });

  it('should set error message from formatError', () => {
    const error = createError('ERR-PRE-01');
    expect(error.message).toContain('[ERR-PRE-01]');
    expect(error.message).toContain('Copilot CLI is not installed');
  });

  it('should include context in message', () => {
    const error = createError('ERR-PRE-01', 'test context');
    expect(error.message).toContain('Context: test context');
  });

  it('should be throwable', () => {
    expect(() => {
      throw createError('ERR-PRE-01');
    }).toThrow();
  });

  it('should be catchable', () => {
    try {
      throw createError('ERR-PRE-01');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('ERR-PRE-01');
    }
  });
});

describe('Error Code Categories', () => {
  it('should group prerequisite errors correctly', () => {
    const preErrors = Object.keys(ERROR_CODES).filter((code) =>
      code.startsWith('ERR-PRE-')
    );
    expect(preErrors.length).toBeGreaterThanOrEqual(5);
  });

  it('should group input errors correctly', () => {
    const inpErrors = Object.keys(ERROR_CODES).filter((code) =>
      code.startsWith('ERR-INP-')
    );
    expect(inpErrors.length).toBeGreaterThanOrEqual(5);
  });

  it('should group state errors correctly', () => {
    const staErrors = Object.keys(ERROR_CODES).filter((code) =>
      code.startsWith('ERR-STA-')
    );
    expect(staErrors.length).toBeGreaterThanOrEqual(3);
  });

  it('should group execution errors correctly', () => {
    const exeErrors = Object.keys(ERROR_CODES).filter((code) =>
      code.startsWith('ERR-EXE-')
    );
    expect(exeErrors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Error Messages', () => {
  it('should provide actionable solutions', () => {
    Object.values(ERROR_CODES).forEach((def) => {
      // Solutions should contain actionable verbs or commands
      const hasAction =
        def.solution.includes('Run') ||
        def.solution.includes('Install') ||
        def.solution.includes('Check') ||
        def.solution.includes('Fix') ||
        def.solution.includes('Verify') ||
        def.solution.includes('Wait') ||
        def.solution.includes('Review') ||
        def.solution.includes('Provide');

      expect(hasAction).toBe(true);
    });
  });

  it('should have clear causes', () => {
    Object.values(ERROR_CODES).forEach((def) => {
      // Causes should be descriptive
      expect(def.cause.length).toBeGreaterThan(10);
    });
  });

  it('should have concise messages', () => {
    Object.values(ERROR_CODES).forEach((def) => {
      // Messages should be relatively short
      expect(def.message.length).toBeLessThan(100);
    });
  });
});
