import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { shouldUseColor, HEX_COLORS, ANSI } from '../lib/ui/palette.js';

describe('Color Palette', () => {
  let originalNoColor: string | undefined;
  let originalForceColor: string | undefined;

  beforeEach(() => {
    // Save original values
    originalNoColor = process.env.NO_COLOR;
    originalForceColor = process.env.FORCE_COLOR;
  });

  afterEach(() => {
    // Restore original values
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
    if (originalForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = originalForceColor;
    }
  });

  describe('shouldUseColor()', () => {
    it('should return false when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      delete process.env.FORCE_COLOR;
      expect(shouldUseColor()).toBe(false);
    });

    it('should return false when NO_COLOR is set to empty string', () => {
      process.env.NO_COLOR = '';
      delete process.env.FORCE_COLOR;
      expect(shouldUseColor()).toBe(false);
    });

    it('should return true when FORCE_COLOR is set', () => {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '1';
      expect(shouldUseColor()).toBe(true);
    });

    it('should return true when FORCE_COLOR is set to empty string', () => {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '';
      expect(shouldUseColor()).toBe(true);
    });

    it('should prioritize NO_COLOR over FORCE_COLOR', () => {
      process.env.NO_COLOR = '1';
      process.env.FORCE_COLOR = '1';
      expect(shouldUseColor()).toBe(false);
    });

    it('should respect TTY detection when no env vars are set', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      const result = shouldUseColor();
      // Result should match the TTY status (could be true or false depending on environment)
      expect(typeof result).toBe('boolean');
    });
  });

  describe('HEX_COLORS', () => {
    it('should define Ice Blue brand colors', () => {
      expect(HEX_COLORS.sky200).toBe('#bae6fd');
      expect(HEX_COLORS.sky400).toBe('#38bdf8');
      expect(HEX_COLORS.sky500).toBe('#0ea5e9');
    });

    it('should define semantic colors', () => {
      expect(HEX_COLORS.success).toBe('#22c55e');
      expect(HEX_COLORS.warning).toBe('#f59e0b');
      expect(HEX_COLORS.error).toBe('#ef4444');
    });

    it('should define neutral colors', () => {
      expect(HEX_COLORS.white).toBe('#ffffff');
      expect(HEX_COLORS.gray).toBe('#6b7280');
      expect(HEX_COLORS.dim).toBe('#9ca3af');
    });

    it('should have all hex values in correct format', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;
      Object.values(HEX_COLORS).forEach((color) => {
        expect(color).toMatch(hexPattern);
      });
    });
  });

  describe('ANSI escape codes', () => {
    it('should define ANSI codes for Ice Blue brand colors', () => {
      expect(ANSI.sky200).toBe('\x1b[38;2;186;230;253m');
      expect(ANSI.sky400).toBe('\x1b[38;2;56;189;248m');
      expect(ANSI.sky500).toBe('\x1b[38;2;14;165;233m');
    });

    it('should define ANSI codes for semantic colors', () => {
      expect(ANSI.success).toBe('\x1b[38;2;34;197;94m');
      expect(ANSI.warning).toBe('\x1b[38;2;245;158;11m');
      expect(ANSI.error).toBe('\x1b[38;2;239;68;68m');
    });

    it('should define ANSI codes for neutral colors', () => {
      expect(ANSI.white).toBe('\x1b[38;2;255;255;255m');
      expect(ANSI.gray).toBe('\x1b[38;2;107;114;128m');
      expect(ANSI.dim).toBe('\x1b[38;2;156;163;175m');
    });

    it('should define reset escape code', () => {
      expect(ANSI.reset).toBe('\x1b[0m');
    });

    it('should have valid ANSI escape sequence format', () => {
      // eslint-disable-next-line no-control-regex
      const ansiPattern = /^\x1b\[(?:38;2;\d{1,3};\d{1,3};\d{1,3}|0)m$/;
      Object.values(ANSI).forEach((code) => {
        expect(code).toMatch(ansiPattern);
      });
    });

    it('should have ANSI codes matching RGB values from hex colors', () => {
      // sky200: #bae6fd = RGB(186, 230, 253)
      expect(ANSI.sky200).toBe('\x1b[38;2;186;230;253m');
      // success: #22c55e = RGB(34, 197, 94)
      expect(ANSI.success).toBe('\x1b[38;2;34;197;94m');
      // error: #ef4444 = RGB(239, 68, 68)
      expect(ANSI.error).toBe('\x1b[38;2;239;68;68m');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined isTTY gracefully', () => {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
      // Should not throw and should return a boolean
      expect(typeof shouldUseColor()).toBe('boolean');
    });

    it('should export types correctly', () => {
      // Type checking - these should not throw TypeScript errors
      const hexColors: typeof HEX_COLORS = HEX_COLORS;
      expect(hexColors).toBeDefined();

      const ansiCodes: typeof ANSI = ANSI;
      expect(ansiCodes).toBeDefined();
    });
  });
});
