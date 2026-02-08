/**
 * Tests for error catalog module (lib/errors.ts)
 *
 * Verifies error code definitions, formatting, and error creation
 * for all 17 error codes in the catalog.
 */

import { describe, it, expect } from 'vitest';
import {
  ERROR_CODES,
  getErrorDefinition,
  formatError,
  createError,
} from '@/errors.js';

describe('Error Catalog', () => {
  describe('ERROR_CODES', () => {
    it('should define all required error codes', () => {
      // Verify all expected error codes exist
      const expectedCodes = [
        'ERR-PRE-01',
        'ERR-PRE-02',
        'ERR-PRE-03',
        'ERR-PRE-04',
        'ERR-PRE-05',
        'ERR-PRE-06',
        'ERR-INP-01',
        'ERR-INP-02',
        'ERR-INP-03',
        'ERR-INP-04',
        'ERR-INP-05',
        'ERR-INP-06',
        'ERR-INP-07',
        'ERR-INP-08',
        'ERR-INP-09',
        'ERR-INP-10',
        'ERR-INP-11',
        'ERR-STA-01',
        'ERR-STA-02',
        'ERR-STA-03',
        'ERR-EXE-01',
        'ERR-EXE-02',
        'ERR-EXE-03',
        'ERR-EXE-04',
        'ERR-EXE-05',
        'ERR-EXE-06',
        'ERR-EXE-07',
        'ERR-EXE-08',
        'ERR-UI-01',
      ];

      expect(Object.keys(ERROR_CODES)).toHaveLength(29);
      for (const code of expectedCodes) {
        expect(ERROR_CODES).toHaveProperty(code);
      }
    });

    it('should have message, cause, and solution properties for each error code', () => {
      for (const [code, def] of Object.entries(ERROR_CODES)) {
        expect(def, `${code} should have all properties`).toEqual(
          expect.objectContaining({
            message: expect.any(String),
            cause: expect.any(String),
            solution: expect.any(String),
          })
        );
      }
    });

    it('should have non-empty strings for all properties', () => {
      for (const [code, def] of Object.entries(ERROR_CODES)) {
        expect(
          def.message.length,
          `${code} message should not be empty`
        ).toBeGreaterThan(0);
        expect(
          def.cause.length,
          `${code} cause should not be empty`
        ).toBeGreaterThan(0);
        expect(
          def.solution.length,
          `${code} solution should not be empty`
        ).toBeGreaterThan(0);
      }
    });

    it('should follow ERR-XXX-## naming convention', () => {
      const pattern = /^ERR-(PRE|INP|STA|EXE|UI)-\d{2}$/;
      for (const code of Object.keys(ERROR_CODES)) {
        expect(code, `${code} should match pattern ERR-XXX-##`).toMatch(
          pattern
        );
      }
    });

    it('should have valid category codes', () => {
      const validCategories = ['PRE', 'INP', 'STA', 'EXE', 'UI'];
      for (const code of Object.keys(ERROR_CODES)) {
        const category = code.split('-')[1];
        expect(
          validCategories,
          `${code} category should be one of: ${validCategories.join(', ')}`
        ).toContain(category);
      }
    });

    it('should not have duplicate error codes', () => {
      const codes = Object.keys(ERROR_CODES);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('getErrorDefinition()', () => {
    it('should return definition for valid error code ERR-PRE-01', () => {
      const def = getErrorDefinition('ERR-PRE-01');
      expect(def).toBeDefined();
      expect(def).toMatchObject({
        message: 'Copilot CLI is not installed',
        cause: 'The copilot command was not found in PATH',
        solution: 'Run: npm install -g @github/copilot',
      });
    });

    it('should return definition for valid error code ERR-INP-03', () => {
      const def = getErrorDefinition('ERR-INP-03');
      expect(def).toBeDefined();
      expect(def?.message).toBe('Config file is malformed');
    });

    it('should return definition for valid error code ERR-STA-01', () => {
      const def = getErrorDefinition('ERR-STA-01');
      expect(def).toBeDefined();
      expect(def?.message).toContain('Another speci instance is running');
    });

    it('should return definition for valid error code ERR-EXE-02', () => {
      const def = getErrorDefinition('ERR-EXE-02');
      expect(def).toBeDefined();
      expect(def?.message).toBe('Copilot execution failed');
    });

    it('should return definition for each of the 29 error codes', () => {
      const allCodes = Object.keys(ERROR_CODES);
      expect(allCodes.length).toBe(29);
      for (const code of allCodes) {
        const def = getErrorDefinition(code);
        expect(def, `${code} should have a definition`).toBeDefined();
      }
    });

    it('should return undefined for non-existent error code', () => {
      const def = getErrorDefinition('ERR-INVALID-99');
      expect(def).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const def = getErrorDefinition('');
      expect(def).toBeUndefined();
    });

    it('should return undefined for code with wrong format', () => {
      const def = getErrorDefinition('INVALID-CODE');
      expect(def).toBeUndefined();
    });
  });

  describe('formatError()', () => {
    it('should format error with code, message, cause, and solution', () => {
      const formatted = formatError('ERR-PRE-01');
      expect(formatted).toContain('[ERR-PRE-01]');
      expect(formatted).toContain('Copilot CLI is not installed');
      expect(formatted).toContain(
        'Cause: The copilot command was not found in PATH'
      );
      expect(formatted).toContain(
        'Solution: Run: npm install -g @github/copilot'
      );
    });

    it('should include context when provided', () => {
      const formatted = formatError('ERR-PRE-01', 'Running in CI environment');
      expect(formatted).toContain('[ERR-PRE-01]');
      expect(formatted).toContain('Context: Running in CI environment');
      expect(formatted).toContain('Copilot CLI is not installed');
    });

    it('should not include context line when context is not provided', () => {
      const formatted = formatError('ERR-PRE-01');
      expect(formatted).not.toContain('Context:');
    });

    it('should handle unknown error codes gracefully', () => {
      const formatted = formatError('ERR-UNKNOWN-99');
      expect(formatted).toBe('Unknown error code: ERR-UNKNOWN-99');
    });

    it('should handle empty error code', () => {
      const formatted = formatError('');
      expect(formatted).toBe('Unknown error code: ');
    });

    it('should format all error codes without throwing', () => {
      const allCodes = Object.keys(ERROR_CODES);
      for (const code of allCodes) {
        expect(() => formatError(code)).not.toThrow();
      }
    });

    it('should produce multi-line output with proper structure', () => {
      const formatted = formatError('ERR-STA-01');
      const lines = formatted.split('\n');
      expect(lines.length).toBeGreaterThan(2);
      expect(lines[0]).toMatch(/^\[ERR-STA-01\]/);
      expect(lines.some((line) => line.includes('Cause:'))).toBe(true);
      expect(lines.some((line) => line.includes('Solution:'))).toBe(true);
    });

    it('should include context on separate line', () => {
      const formatted = formatError('ERR-INP-01', 'Missing --plan argument');
      const lines = formatted.split('\n');
      expect(
        lines.some((line) => line.includes('Context: Missing --plan argument'))
      ).toBe(true);
    });
  });

  describe('createError()', () => {
    it('should return Error object', () => {
      const error = createError('ERR-PRE-01');
      expect(error).toBeInstanceOf(Error);
    });

    it('should set error name to error code', () => {
      const error = createError('ERR-PRE-01');
      expect(error.name).toBe('ERR-PRE-01');
    });

    it('should set error message to formatted error', () => {
      const error = createError('ERR-PRE-01');
      const expected = formatError('ERR-PRE-01');
      expect(error.message).toBe(expected);
    });

    it('should include context in error message when provided', () => {
      const error = createError('ERR-PRE-01', 'Custom context');
      expect(error.message).toContain('Context: Custom context');
    });

    it('should work for all error codes', () => {
      const allCodes = Object.keys(ERROR_CODES);
      for (const code of allCodes) {
        const error = createError(code);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe(code);
      }
    });

    it('should create error with unknown code', () => {
      const error = createError('ERR-UNKNOWN-99');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ERR-UNKNOWN-99');
      expect(error.message).toContain('Unknown error code');
    });

    it('should preserve stack trace', () => {
      const error = createError('ERR-PRE-01');
      expect(error.stack).toBeDefined();
    });
  });

  describe('Error Categories', () => {
    it('should have ERR-PRE-* codes for prerequisite errors', () => {
      const prereqCodes = Object.keys(ERROR_CODES).filter((code) =>
        code.startsWith('ERR-PRE-')
      );
      expect(prereqCodes.length).toBeGreaterThan(0);
      expect(prereqCodes).toContain('ERR-PRE-01'); // Copilot not installed
      expect(prereqCodes).toContain('ERR-PRE-02'); // Not authenticated
      expect(prereqCodes).toContain('ERR-PRE-03'); // Not a git repo
      expect(prereqCodes).toContain('ERR-PRE-04'); // Config not found
      expect(prereqCodes).toContain('ERR-PRE-05'); // PROGRESS.md not found
    });

    it('should have ERR-INP-* codes for input errors', () => {
      const inputCodes = Object.keys(ERROR_CODES).filter((code) =>
        code.startsWith('ERR-INP-')
      );
      expect(inputCodes.length).toBeGreaterThan(0);
      expect(inputCodes).toContain('ERR-INP-01'); // Required argument missing
      expect(inputCodes).toContain('ERR-INP-02'); // Agent file not found
      expect(inputCodes).toContain('ERR-INP-03'); // Config malformed
      expect(inputCodes).toContain('ERR-INP-04'); // Config validation failed
      expect(inputCodes).toContain('ERR-INP-05'); // Plan file not found
    });

    it('should have ERR-STA-* codes for state errors', () => {
      const stateCodes = Object.keys(ERROR_CODES).filter((code) =>
        code.startsWith('ERR-STA-')
      );
      expect(stateCodes.length).toBeGreaterThan(0);
      expect(stateCodes).toContain('ERR-STA-01'); // Lock file exists
      expect(stateCodes).toContain('ERR-STA-02'); // Cannot parse PROGRESS.md
      expect(stateCodes).toContain('ERR-STA-03'); // Invalid state transition
    });

    it('should have ERR-EXE-* codes for execution errors', () => {
      const execCodes = Object.keys(ERROR_CODES).filter((code) =>
        code.startsWith('ERR-EXE-')
      );
      expect(execCodes.length).toBeGreaterThan(0);
      expect(execCodes).toContain('ERR-EXE-01'); // Gate command failed
      expect(execCodes).toContain('ERR-EXE-02'); // Copilot execution failed
      expect(execCodes).toContain('ERR-EXE-03'); // Max iterations reached
      expect(execCodes).toContain('ERR-EXE-04'); // Max fix attempts exceeded
    });

    it('should have ERR-UI-* codes for UI errors', () => {
      const uiCodes = Object.keys(ERROR_CODES).filter((code) =>
        code.startsWith('ERR-UI-')
      );
      expect(uiCodes.length).toBeGreaterThan(0);
      expect(uiCodes).toContain('ERR-UI-01'); // Invalid hex color
    });
  });

  describe('Error Messages Quality', () => {
    it('should have user-friendly messages', () => {
      for (const [code, def] of Object.entries(ERROR_CODES)) {
        // Messages should start with capital letter
        expect(
          def.message[0],
          `${code} message should start with capital letter`
        ).toMatch(/[A-Z]/);
        // Messages should not end with punctuation
        expect(
          def.message[def.message.length - 1],
          `${code} message should not end with period`
        ).not.toBe('.');
      }
    });

    it('should have actionable solutions', () => {
      for (const [code, def] of Object.entries(ERROR_CODES)) {
        // Solutions should provide guidance
        expect(
          def.solution.length,
          `${code} solution should be substantial`
        ).toBeGreaterThan(10);
      }
    });

    it('should explain causes clearly', () => {
      for (const [code, def] of Object.entries(ERROR_CODES)) {
        // Causes should explain what went wrong
        expect(
          def.cause.length,
          `${code} cause should be substantial`
        ).toBeGreaterThan(10);
      }
    });
  });

  describe('Context Interpolation', () => {
    it('should interpolate single context variable', () => {
      const formatted = formatError(
        'ERR-INP-02',
        JSON.stringify({ path: '/path/to/agent.md' })
      );
      expect(formatted).toContain('/path/to/agent.md');
    });

    it('should interpolate multiple context variables', () => {
      const formatted = formatError(
        'ERR-STA-01',
        JSON.stringify({
          pid: '12345',
          elapsed: '5 minutes',
        })
      );
      expect(formatted).toContain('12345');
      expect(formatted).toContain('5 minutes');
    });

    it('should handle missing context variables gracefully', () => {
      const formatted = formatError(
        'ERR-INP-03',
        JSON.stringify({ someOtherField: 'value' })
      );
      expect(formatted).toBeDefined();
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should handle empty context object', () => {
      const formatted = formatError('ERR-PRE-01', JSON.stringify({}));
      expect(formatted).toContain('[ERR-PRE-01]');
    });

    it('should work with all error codes when context provided', () => {
      const allCodes = Object.keys(ERROR_CODES);
      for (const code of allCodes) {
        expect(() =>
          formatError(code, JSON.stringify({ test: 'value' }))
        ).not.toThrow();
      }
    });
  });

  describe('New Error Codes Coverage', () => {
    it('should have ERR-INP-06 for config version incompatibility', () => {
      const def = getErrorDefinition('ERR-INP-06');
      expect(def).toBeDefined();
      expect(def?.message).toContain('version');
    });

    it('should have ERR-INP-07 for unsafe path errors', () => {
      const def = getErrorDefinition('ERR-INP-07');
      expect(def).toBeDefined();
      expect(def?.message).toContain('path');
    });

    it('should have ERR-INP-08 for invalid permission values', () => {
      const def = getErrorDefinition('ERR-INP-08');
      expect(def).toBeDefined();
      expect(def?.message).toContain('permission');
    });

    it('should have ERR-INP-09 for maxFixAttempts validation', () => {
      const def = getErrorDefinition('ERR-INP-09');
      expect(def).toBeDefined();
    });

    it('should have ERR-INP-10 for maxIterations validation', () => {
      const def = getErrorDefinition('ERR-INP-10');
      expect(def).toBeDefined();
    });

    it('should have ERR-INP-11 for subagent prompt not found', () => {
      const def = getErrorDefinition('ERR-INP-11');
      expect(def).toBeDefined();
      expect(def?.message).toContain('subagent');
    });

    it('should have ERR-PRE-06 for PROGRESS.md missing in run command', () => {
      const def = getErrorDefinition('ERR-PRE-06');
      expect(def).toBeDefined();
    });

    it('should have ERR-EXE-05 for directory creation failures', () => {
      const def = getErrorDefinition('ERR-EXE-05');
      expect(def).toBeDefined();
      expect(def?.message).toContain('directory');
    });

    it('should have ERR-EXE-06 for file write failures', () => {
      const def = getErrorDefinition('ERR-EXE-06');
      expect(def).toBeDefined();
      expect(def?.message).toContain('file');
    });

    it('should have ERR-EXE-07 for agent template directory not found', () => {
      const def = getErrorDefinition('ERR-EXE-07');
      expect(def).toBeDefined();
      expect(def?.message).toContain('template');
    });

    it('should have ERR-EXE-08 for agent file copy failures', () => {
      const def = getErrorDefinition('ERR-EXE-08');
      expect(def).toBeDefined();
    });

    it('should have ERR-UI-01 for invalid hex color', () => {
      const def = getErrorDefinition('ERR-UI-01');
      expect(def).toBeDefined();
      expect(def?.message).toContain('color');
    });
  });
});
