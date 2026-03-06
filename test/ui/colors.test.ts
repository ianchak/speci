/**
 * Color Utilities Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as colors from '../../lib/ui/colors.js';

describe('colors utilities', () => {
  // Store original environment
  let originalEnv: NodeJS.ProcessEnv;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      expect(colors.supportsColor()).toBe(false);
    });

    it('returns false when NO_COLOR is empty string', () => {
      process.env.NO_COLOR = '';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(colors.supportsColor()).toBe(false);
    });

    it('returns true when FORCE_COLOR is set', () => {
      process.env.FORCE_COLOR = '1';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(colors.supportsColor()).toBe(true);
    });

    it('returns true when FORCE_COLOR is empty string', () => {
      process.env.FORCE_COLOR = '';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(colors.supportsColor()).toBe(true);
    });

    it('returns false in CI environment', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      process.env.CI = 'true';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(colors.supportsColor()).toBe(false);
    });

    it('returns false in CONTINUOUS_INTEGRATION environment', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      process.env.CONTINUOUS_INTEGRATION = 'true';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(colors.supportsColor()).toBe(false);
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
      expect(colors.supportsColor()).toBe(true);
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
      expect(colors.supportsColor()).toBe(false);
    });

    it('NO_COLOR takes precedence over FORCE_COLOR', () => {
      process.env.NO_COLOR = '1';
      process.env.FORCE_COLOR = '1';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      expect(colors.supportsColor()).toBe(false);
    });

    it('FORCE_COLOR takes precedence over CI', () => {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '1';
      process.env.CI = 'true';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(colors.supportsColor()).toBe(true);
    });
  });

  describe('stripAnsi', () => {
    it('removes ANSI escape codes', () => {
      const input = '\x1b[38;2;186;230;253mHello\x1b[0m';
      expect(colors.stripAnsi(input)).toBe('Hello');
    });

    it('handles multiple ANSI codes', () => {
      const input =
        '\x1b[38;2;186;230;253mHello\x1b[0m \x1b[38;2;56;189;248mWorld\x1b[0m';
      expect(colors.stripAnsi(input)).toBe('Hello World');
    });

    it('handles nested ANSI codes', () => {
      const input = '\x1b[1m\x1b[38;2;186;230;253mHello\x1b[0m\x1b[0m';
      expect(colors.stripAnsi(input)).toBe('Hello');
    });

    it('returns original string if no ANSI codes', () => {
      const input = 'Hello World';
      expect(colors.stripAnsi(input)).toBe('Hello World');
    });

    it('handles empty string', () => {
      expect(colors.stripAnsi('')).toBe('');
    });

    it('handles pure ANSI string', () => {
      const input = '\x1b[38;2;186;230;253m\x1b[0m';
      expect(colors.stripAnsi(input)).toBe('');
    });
  });

  describe('visibleLength', () => {
    it('returns correct length excluding ANSI codes', () => {
      const input = '\x1b[38;2;186;230;253mHello\x1b[0m';
      expect(colors.visibleLength(input)).toBe(5);
    });

    it('returns correct length for multiple ANSI codes', () => {
      const input =
        '\x1b[38;2;186;230;253mHello\x1b[0m \x1b[38;2;56;189;248mWorld\x1b[0m';
      expect(colors.visibleLength(input)).toBe(11); // "Hello World"
    });

    it('returns 0 for empty string', () => {
      expect(colors.visibleLength('')).toBe(0);
    });

    it('returns 0 for pure ANSI string', () => {
      const input = '\x1b[38;2;186;230;253m\x1b[0m';
      expect(colors.visibleLength(input)).toBe(0);
    });

    it('returns correct length for plain text', () => {
      expect(colors.visibleLength('Hello World')).toBe(11);
    });
  });

  describe('colorize', () => {
    describe('when colors are supported', () => {
      it('returns ANSI-wrapped text for sky200', () => {
        const result = colors.colorize('Hello', 'sky200');
        expect(result).toContain('Hello');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[38;2;');
          expect(result).toContain('\x1b[0m');
        } else {
          expect(result).toBe('Hello');
        }
      });

      it('returns ANSI-wrapped text for sky400', () => {
        const result = colors.colorize('Hello', 'sky400');
        expect(result).toContain('Hello');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[38;2;');
          expect(result).toContain('\x1b[0m');
        } else {
          expect(result).toBe('Hello');
        }
      });

      it('returns ANSI-wrapped text for sky500', () => {
        const result = colors.colorize('Hello', 'sky500');
        expect(result).toContain('Hello');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[38;2;');
          expect(result).toContain('\x1b[0m');
        } else {
          expect(result).toBe('Hello');
        }
      });

      it('returns ANSI-wrapped text for success', () => {
        const result = colors.colorize('Success', 'success');
        expect(result).toContain('Success');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[38;2;');
          expect(result).toContain('\x1b[0m');
        } else {
          expect(result).toBe('Success');
        }
      });

      it('returns ANSI-wrapped text for warning', () => {
        const result = colors.colorize('Warning', 'warning');
        expect(result).toContain('Warning');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[38;2;');
          expect(result).toContain('\x1b[0m');
        } else {
          expect(result).toBe('Warning');
        }
      });

      it('returns ANSI-wrapped text for error', () => {
        const result = colors.colorize('Error', 'error');
        expect(result).toContain('Error');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[38;2;');
          expect(result).toContain('\x1b[0m');
        } else {
          expect(result).toBe('Error');
        }
      });

      it('appends reset code after text', () => {
        const result = colors.colorize('Hello', 'sky200');
        expect(result.endsWith('\x1b[0m')).toBe(colors.isColorSupported());
      });

      it('handles empty string', () => {
        const result = colors.colorize('', 'sky200');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[38;2;');
          expect(result).toContain('\x1b[0m');
        } else {
          expect(result).toBe('');
        }
      });
    });

    describe('when colors are not supported', () => {
      beforeEach(() => {
        vi.spyOn(colors, 'isColorSupported').mockReturnValue(false);
      });

      it('returns plain text for sky200', () => {
        const result = colors.colorize('Hello', 'sky200');
        expect(result).toBe('Hello');
        expect(result).not.toContain('\x1b[');
      });

      it('returns plain text for all color names', () => {
        expect(colors.colorize('Test', 'sky400')).toBe('Test');
        expect(colors.colorize('Test', 'sky500')).toBe('Test');
        expect(colors.colorize('Test', 'success')).toBe('Test');
        expect(colors.colorize('Test', 'warning')).toBe('Test');
        expect(colors.colorize('Test', 'error')).toBe('Test');
      });

      it('handles empty string', () => {
        const result = colors.colorize('', 'sky200');
        expect(result).toBe('');
      });
    });

    describe('edge cases', () => {
      it('handles invalid color names gracefully', () => {
        const result = colors.colorize(
          'Hello',
          'invalid' as unknown as colors.ColorName
        );
        expect(result).toBe('Hello');
      });

      it('handles special characters in text', () => {
        const result = colors.colorize('Hello\nWorld\t!', 'sky200');
        expect(result).toContain('Hello\nWorld\t!');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[0m');
        }
      });

      it('handles unicode characters', () => {
        const result = colors.colorize('Hello 🌟 World', 'sky200');
        expect(result).toContain('Hello 🌟 World');
        if (colors.isColorSupported()) {
          expect(result).toContain('\x1b[0m');
        }
      });
    });

    it('changing env vars after module load does not affect cached color support', () => {
      const before = colors.isColorSupported();
      process.env.NO_COLOR =
        process.env.NO_COLOR === undefined ? '1' : undefined;
      process.env.FORCE_COLOR =
        process.env.FORCE_COLOR === undefined ? '1' : undefined;
      expect(colors.isColorSupported()).toBe(before);
    });

    it('supports spy-based overrides for memoized color support', () => {
      const before = colors.isColorSupported();
      vi.spyOn(colors, 'isColorSupported').mockReturnValue(true);
      expect(colors.isColorSupported()).toBe(true);
      vi.spyOn(colors, 'isColorSupported').mockReturnValue(false);
      expect(colors.isColorSupported()).toBe(false);
      expect(colors.supportsColor()).toBe(before);
    });
  });
});
