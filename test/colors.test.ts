/**
 * Color Utilities Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  colorize,
  supportsColor,
  stripAnsi,
  visibleLength,
} from '../lib/ui/colors.js';

describe('colors utilities', () => {
  // Store original environment
  let originalEnv: NodeJS.ProcessEnv;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe('supportsColor', () => {
    it('returns false when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(supportsColor()).toBe(false);
    });

    it('returns false when NO_COLOR is empty string', () => {
      process.env.NO_COLOR = '';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(supportsColor()).toBe(false);
    });

    it('returns true when FORCE_COLOR is set', () => {
      process.env.FORCE_COLOR = '1';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(supportsColor()).toBe(true);
    });

    it('returns true when FORCE_COLOR is empty string', () => {
      process.env.FORCE_COLOR = '';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(supportsColor()).toBe(true);
    });

    it('returns false in CI environment', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      process.env.CI = 'true';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(supportsColor()).toBe(false);
    });

    it('returns false in CONTINUOUS_INTEGRATION environment', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      process.env.CONTINUOUS_INTEGRATION = 'true';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(supportsColor()).toBe(false);
    });

    it('returns true when stdout is TTY and no env vars set', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      delete process.env.CI;
      delete process.env.CONTINUOUS_INTEGRATION;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(supportsColor()).toBe(true);
    });

    it('returns false when stdout is not TTY and no env vars set', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      delete process.env.CI;
      delete process.env.CONTINUOUS_INTEGRATION;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(supportsColor()).toBe(false);
    });

    it('NO_COLOR takes precedence over FORCE_COLOR', () => {
      process.env.NO_COLOR = '1';
      process.env.FORCE_COLOR = '1';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(supportsColor()).toBe(false);
    });

    it('FORCE_COLOR takes precedence over CI', () => {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '1';
      process.env.CI = 'true';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(supportsColor()).toBe(true);
    });
  });

  describe('stripAnsi', () => {
    it('removes ANSI escape codes', () => {
      const input = '\x1b[38;2;186;230;253mHello\x1b[0m';
      expect(stripAnsi(input)).toBe('Hello');
    });

    it('handles multiple ANSI codes', () => {
      const input =
        '\x1b[38;2;186;230;253mHello\x1b[0m \x1b[38;2;56;189;248mWorld\x1b[0m';
      expect(stripAnsi(input)).toBe('Hello World');
    });

    it('handles nested ANSI codes', () => {
      const input = '\x1b[1m\x1b[38;2;186;230;253mHello\x1b[0m\x1b[0m';
      expect(stripAnsi(input)).toBe('Hello');
    });

    it('returns original string if no ANSI codes', () => {
      const input = 'Hello World';
      expect(stripAnsi(input)).toBe('Hello World');
    });

    it('handles empty string', () => {
      expect(stripAnsi('')).toBe('');
    });

    it('handles pure ANSI string', () => {
      const input = '\x1b[38;2;186;230;253m\x1b[0m';
      expect(stripAnsi(input)).toBe('');
    });
  });

  describe('visibleLength', () => {
    it('returns correct length excluding ANSI codes', () => {
      const input = '\x1b[38;2;186;230;253mHello\x1b[0m';
      expect(visibleLength(input)).toBe(5);
    });

    it('returns correct length for multiple ANSI codes', () => {
      const input =
        '\x1b[38;2;186;230;253mHello\x1b[0m \x1b[38;2;56;189;248mWorld\x1b[0m';
      expect(visibleLength(input)).toBe(11); // "Hello World"
    });

    it('returns 0 for empty string', () => {
      expect(visibleLength('')).toBe(0);
    });

    it('returns 0 for pure ANSI string', () => {
      const input = '\x1b[38;2;186;230;253m\x1b[0m';
      expect(visibleLength(input)).toBe(0);
    });

    it('returns correct length for plain text', () => {
      expect(visibleLength('Hello World')).toBe(11);
    });
  });

  describe('colorize', () => {
    describe('when colors are supported', () => {
      beforeEach(() => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
      });

      it('returns ANSI-wrapped text for sky200', () => {
        const result = colorize('Hello', 'sky200');
        expect(result).toContain('Hello');
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });

      it('returns ANSI-wrapped text for sky400', () => {
        const result = colorize('Hello', 'sky400');
        expect(result).toContain('Hello');
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });

      it('returns ANSI-wrapped text for sky500', () => {
        const result = colorize('Hello', 'sky500');
        expect(result).toContain('Hello');
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });

      it('returns ANSI-wrapped text for success', () => {
        const result = colorize('Success', 'success');
        expect(result).toContain('Success');
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });

      it('returns ANSI-wrapped text for warning', () => {
        const result = colorize('Warning', 'warning');
        expect(result).toContain('Warning');
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });

      it('returns ANSI-wrapped text for error', () => {
        const result = colorize('Error', 'error');
        expect(result).toContain('Error');
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });

      it('appends reset code after text', () => {
        const result = colorize('Hello', 'sky200');
        expect(result.endsWith('\x1b[0m')).toBe(true);
      });

      it('handles empty string', () => {
        const result = colorize('', 'sky200');
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });
    });

    describe('when colors are not supported', () => {
      beforeEach(() => {
        process.env.NO_COLOR = '1';
        delete process.env.FORCE_COLOR;
      });

      it('returns plain text for sky200', () => {
        const result = colorize('Hello', 'sky200');
        expect(result).toBe('Hello');
        expect(result).not.toContain('\x1b[');
      });

      it('returns plain text for all color names', () => {
        expect(colorize('Test', 'sky400')).toBe('Test');
        expect(colorize('Test', 'sky500')).toBe('Test');
        expect(colorize('Test', 'success')).toBe('Test');
        expect(colorize('Test', 'warning')).toBe('Test');
        expect(colorize('Test', 'error')).toBe('Test');
      });

      it('handles empty string', () => {
        const result = colorize('', 'sky200');
        expect(result).toBe('');
      });
    });

    describe('edge cases', () => {
      beforeEach(() => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
      });

      it('handles invalid color names gracefully', () => {
        // Testing invalid input - TypeScript allows this with 'as any'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = colorize('Hello', 'invalid' as any);
        expect(result).toBe('Hello');
      });

      it('handles special characters in text', () => {
        const result = colorize('Hello\nWorld\t!', 'sky200');
        expect(result).toContain('Hello\nWorld\t!');
        expect(result).toContain('\x1b[0m');
      });

      it('handles unicode characters', () => {
        const result = colorize('Hello 🌟 World', 'sky200');
        expect(result).toContain('Hello 🌟 World');
        expect(result).toContain('\x1b[0m');
      });
    });
  });
});
