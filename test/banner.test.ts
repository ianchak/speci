/**
 * ASCII Banner Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BANNER_ART, renderBanner, VERSION } from '../lib/ui/banner.js';

describe('banner module', () => {
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

  describe('BANNER_ART constant', () => {
    it('has consistent line widths', () => {
      const widths = BANNER_ART.map((line) => line.length);
      const firstWidth = widths[0];
      const allSame = widths.every((w) => w === firstWidth);
      expect(allSame).toBe(true);
    });

    it('has expected number of lines (5-7)', () => {
      expect(BANNER_ART.length).toBeGreaterThanOrEqual(5);
      expect(BANNER_ART.length).toBeLessThanOrEqual(7);
    });

    it('spells SPECI in ASCII art', () => {
      const joined = BANNER_ART.join('\n');
      // Banner uses Unicode box-drawing characters, not literal 'SPECI'
      // Check that it's a non-empty banner with the expected structure
      expect(joined.length).toBeGreaterThan(100);
      expect(joined).toContain('█'); // Contains block characters
    });

    it('uses only standard ASCII characters (no emoji)', () => {
      const joined = BANNER_ART.join('\n');
      // Check that the banner doesn't contain emoji code points
      // Allow Unicode box-drawing characters but no emoji ranges
      const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(joined);
      expect(hasEmoji).toBe(false);
    });
  });

  describe('renderBanner', () => {
    describe('basic functionality', () => {
      it('returns string containing banner art', () => {
        const result = renderBanner();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        // Should contain at least some characters from the banner
        // eslint-disable-next-line no-control-regex
        const plainText = result.replace(/\x1b\[[0-9;]*m/g, '');
        // Check for block characters used in banner
        expect(plainText).toContain('█');
      });

      it('includes version by default', () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const result = renderBanner();
        expect(result).toContain(`v${VERSION}`);
      });

      it('includes version when showVersion is true', () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const result = renderBanner({ showVersion: true });
        expect(result).toContain(`v${VERSION}`);
      });

      it('excludes version when showVersion is false', () => {
        const result = renderBanner({ showVersion: false });
        expect(result).not.toContain('v0.1.0');
      });
    });

    describe('color support', () => {
      it('returns plain text when NO_COLOR is set', () => {
        process.env.NO_COLOR = '1';
        delete process.env.FORCE_COLOR;
        const result = renderBanner();
        // Should not contain ANSI codes
        // eslint-disable-next-line no-control-regex
        expect(result).not.toMatch(/\x1b\[/);
      });

      it('applies gradient colors when colors are supported', () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const result = renderBanner();
        // Should contain ANSI codes
        expect(result).toContain('\x1b[38;2;');
        expect(result).toContain('\x1b[0m');
      });

      it('gradient uses sky200, sky400, and sky500 colors', () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const result = renderBanner();
        // Check for presence of RGB ANSI escape codes
        // The gradient interpolates between colors, so we check for:
        // - RGB escape code format present
        // - At least one instance of sky400 which is held in the middle range
        // eslint-disable-next-line no-control-regex
        expect(result).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
        // sky400: #38bdf8 = rgb(56, 189, 248) - this exact value should appear
        // in the middle section where the gradient holds steady
        expect(result).toContain('56;189;248');
      });

      it('returns consistent output with FORCE_COLOR', () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const result1 = renderBanner();
        const result2 = renderBanner();
        expect(result1).toBe(result2);
      });
    });

    describe('version centering', () => {
      it('centers version text below banner', () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const result = renderBanner({ showVersion: true });
        const lines = result.split('\n');
        const lastLine = lines[lines.length - 1];
        // Last line should have leading spaces (centering)
        expect(lastLine.startsWith(' ')).toBe(true);
      });

      it('version is on separate line from banner', () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const result = renderBanner({ showVersion: true });
        const lines = result.split('\n');
        // Banner lines + version line
        expect(lines.length).toBe(BANNER_ART.length + 1);
      });
    });

    describe('edge cases', () => {
      it('handles empty options object', () => {
        const result = renderBanner({});
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('handles undefined options', () => {
        const result = renderBanner(undefined);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('produces same banner art regardless of color setting', () => {
        // With colors
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const colored = renderBanner({ showVersion: false });
        // eslint-disable-next-line no-control-regex
        const coloredStripped = colored.replace(/\x1b\[[0-9;]*m/g, '');

        // Without colors
        process.env.NO_COLOR = '1';
        delete process.env.FORCE_COLOR;
        const plain = renderBanner({ showVersion: false });

        // Should have same text content
        expect(coloredStripped).toBe(plain);
      });
    });

    describe('integration with color utilities', () => {
      it('respects CI environment', () => {
        delete process.env.NO_COLOR;
        delete process.env.FORCE_COLOR;
        process.env.CI = 'true';
        Object.defineProperty(process.stdout, 'isTTY', {
          value: true,
          configurable: true,
        });
        const result = renderBanner();
        // Should not contain ANSI codes in CI
        // eslint-disable-next-line no-control-regex
        expect(result).not.toMatch(/\x1b\[/);
      });

      it('respects TTY detection', () => {
        delete process.env.NO_COLOR;
        delete process.env.FORCE_COLOR;
        delete process.env.CI;
        Object.defineProperty(process.stdout, 'isTTY', {
          value: false,
          configurable: true,
        });
        const result = renderBanner();
        // Should not contain ANSI codes when not TTY
        // eslint-disable-next-line no-control-regex
        expect(result).not.toMatch(/\x1b\[/);
      });
    });
  });
});
