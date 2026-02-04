import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GLYPHS,
  ASCII_GLYPHS,
  supportsUnicode,
  getGlyph,
  getSpinnerFrame,
  type GlyphName,
} from '../lib/ui/glyphs.js';

describe('glyphs', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.SPECI_ASCII;
    delete process.env.LANG;
    delete process.env.LC_ALL;
    delete process.env.TERM;
    delete process.env.WT_SESSION;
    delete process.env.TERM_PROGRAM;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GLYPHS constant', () => {
    it('should contain all expected Unicode symbols', () => {
      expect(GLYPHS.success).toBe('✓');
      expect(GLYPHS.warning).toBe('!');
      expect(GLYPHS.error).toBe('✗');
      expect(GLYPHS.bullet).toBe('•');
      expect(GLYPHS.nested).toBe('↳');
      expect(GLYPHS.arrow).toBe('→');
      expect(GLYPHS.pointer).toBe('▸');
      expect(GLYPHS.spinner).toEqual([
        '⠋',
        '⠙',
        '⠹',
        '⠸',
        '⠼',
        '⠴',
        '⠦',
        '⠧',
        '⠇',
        '⠏',
      ]);
    });

    it('should have spinner as an array of 10 frames', () => {
      expect(Array.isArray(GLYPHS.spinner)).toBe(true);
      expect(GLYPHS.spinner).toHaveLength(10);
    });
  });

  describe('ASCII_GLYPHS constant', () => {
    it('should contain all expected ASCII fallback symbols', () => {
      expect(ASCII_GLYPHS.success).toBe('[OK]');
      expect(ASCII_GLYPHS.warning).toBe('[!]');
      expect(ASCII_GLYPHS.error).toBe('[X]');
      expect(ASCII_GLYPHS.bullet).toBe('*');
      expect(ASCII_GLYPHS.nested).toBe('->');
      expect(ASCII_GLYPHS.arrow).toBe('>');
      expect(ASCII_GLYPHS.pointer).toBe('>');
      expect(ASCII_GLYPHS.spinner).toEqual(['-', '\\', '|', '/']);
    });

    it('should have spinner as an array of 4 frames', () => {
      expect(Array.isArray(ASCII_GLYPHS.spinner)).toBe(true);
      expect(ASCII_GLYPHS.spinner).toHaveLength(4);
    });
  });

  describe('supportsUnicode', () => {
    it('should return false when SPECI_ASCII is set', () => {
      process.env.SPECI_ASCII = '1';
      expect(supportsUnicode()).toBe(false);

      process.env.SPECI_ASCII = 'true';
      expect(supportsUnicode()).toBe(false);

      process.env.SPECI_ASCII = '';
      expect(supportsUnicode()).toBe(false);
    });

    it('should detect UTF-8 from LANG environment variable', () => {
      process.env.LANG = 'en_US.UTF-8';
      expect(supportsUnicode()).toBe(true);

      process.env.LANG = 'en_GB.utf-8';
      expect(supportsUnicode()).toBe(true);

      process.env.LANG = 'C.UTF8';
      expect(supportsUnicode()).toBe(true);
    });

    it('should detect UTF-8 from LC_ALL environment variable', () => {
      process.env.LC_ALL = 'en_US.UTF-8';
      expect(supportsUnicode()).toBe(true);

      process.env.LC_ALL = 'ja_JP.utf8';
      expect(supportsUnicode()).toBe(true);
    });

    it('should detect Unicode-capable terminals from TERM', () => {
      process.env.TERM = 'xterm-256color';
      expect(supportsUnicode()).toBe(true);

      process.env.TERM = 'xterm-color';
      expect(supportsUnicode()).toBe(true);

      process.env.TERM = 'screen-256color';
      expect(supportsUnicode()).toBe(true);

      process.env.TERM = 'tmux-256color';
      expect(supportsUnicode()).toBe(true);
    });

    it('should detect Windows Terminal', () => {
      process.env.WT_SESSION = 'some-session-id';
      expect(supportsUnicode()).toBe(true);
    });

    it('should detect VS Code terminal', () => {
      process.env.TERM_PROGRAM = 'vscode';
      expect(supportsUnicode()).toBe(true);
    });

    it('should return false when no Unicode indicators are present', () => {
      expect(supportsUnicode()).toBe(false);
    });

    it('should return false for non-UTF-8 LANG', () => {
      process.env.LANG = 'en_US.ISO-8859-1';
      expect(supportsUnicode()).toBe(false);
    });

    it('should prioritize SPECI_ASCII over other indicators', () => {
      process.env.SPECI_ASCII = '1';
      process.env.LANG = 'en_US.UTF-8';
      process.env.TERM = 'xterm-256color';
      expect(supportsUnicode()).toBe(false);
    });
  });

  describe('getGlyph', () => {
    it('should return Unicode glyph when Unicode is supported', () => {
      process.env.LANG = 'en_US.UTF-8';
      expect(getGlyph('success')).toBe('✓');
      expect(getGlyph('error')).toBe('✗');
      expect(getGlyph('warning')).toBe('!');
    });

    it('should return ASCII fallback when Unicode is not supported', () => {
      // No Unicode indicators set
      expect(getGlyph('success')).toBe('[OK]');
      expect(getGlyph('error')).toBe('[X]');
      expect(getGlyph('warning')).toBe('[!]');
    });

    it('should return ASCII fallback when SPECI_ASCII is set', () => {
      process.env.SPECI_ASCII = '1';
      expect(getGlyph('bullet')).toBe('*');
      expect(getGlyph('nested')).toBe('->');
      expect(getGlyph('arrow')).toBe('>');
    });

    it('should handle all glyph names', () => {
      process.env.LANG = 'en_US.UTF-8';
      const glyphNames: GlyphName[] = [
        'success',
        'warning',
        'error',
        'bullet',
        'nested',
        'arrow',
        'pointer',
        'spinner',
      ];

      glyphNames.forEach((name) => {
        const glyph = getGlyph(name);
        expect(glyph).toBeDefined();
        expect(glyph).not.toBe('?');
      });
    });

    it('should return spinner array for spinner glyph', () => {
      process.env.LANG = 'en_US.UTF-8';
      const spinner = getGlyph('spinner');
      expect(Array.isArray(spinner)).toBe(true);
      expect(spinner).toHaveLength(10);
    });

    it('should return ASCII spinner when Unicode not supported', () => {
      const spinner = getGlyph('spinner');
      expect(Array.isArray(spinner)).toBe(true);
      expect(spinner).toEqual(['-', '\\', '|', '/']);
    });
  });

  describe('getSpinnerFrame', () => {
    it('should return correct frame for given index with Unicode', () => {
      process.env.LANG = 'en_US.UTF-8';
      expect(getSpinnerFrame(0)).toBe('⠋');
      expect(getSpinnerFrame(1)).toBe('⠙');
      expect(getSpinnerFrame(9)).toBe('⠏');
    });

    it('should return correct frame for given index with ASCII', () => {
      expect(getSpinnerFrame(0)).toBe('-');
      expect(getSpinnerFrame(1)).toBe('\\');
      expect(getSpinnerFrame(2)).toBe('|');
      expect(getSpinnerFrame(3)).toBe('/');
    });

    it('should cycle through frames with modulo', () => {
      process.env.LANG = 'en_US.UTF-8';
      // Frame 10 should wrap to frame 0
      expect(getSpinnerFrame(10)).toBe('⠋');
      // Frame 11 should wrap to frame 1
      expect(getSpinnerFrame(11)).toBe('⠙');
    });

    it('should handle large frame indices', () => {
      process.env.LANG = 'en_US.UTF-8';
      expect(getSpinnerFrame(100)).toBe('⠋'); // 100 % 10 = 0
      expect(getSpinnerFrame(105)).toBe('⠴'); // 105 % 10 = 5
    });

    it('should handle negative frame indices', () => {
      process.env.LANG = 'en_US.UTF-8';
      // JavaScript modulo with negative numbers
      const frames = getGlyph('spinner') as string[];
      const index = -1;
      const frame = getSpinnerFrame(index);
      expect(frames).toContain(frame);
    });

    it('should work with ASCII spinner', () => {
      process.env.SPECI_ASCII = '1';
      expect(getSpinnerFrame(0)).toBe('-');
      expect(getSpinnerFrame(4)).toBe('-'); // 4 % 4 = 0
      expect(getSpinnerFrame(5)).toBe('\\'); // 5 % 4 = 1
    });
  });
});
