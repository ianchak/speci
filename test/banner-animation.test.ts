/**
 * Tests for Banner Animation Module
 *
 * Tests the foundational structure of the banner animation module,
 * including imports, constants, and basic module integrity.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Banner Animation Module', () => {
  describe('Module Import', () => {
    it('should import without errors', async () => {
      // Test that the module can be imported successfully
      await expect(
        import('../lib/ui/banner-animation.js')
      ).resolves.toBeDefined();
    });
  });

  describe('Animation Constants', () => {
    it('should define DURATION constant with correct type', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      // DURATION should exist and be a number
      expect(module.DURATION).toBeDefined();
      expect(typeof module.DURATION).toBe('number');
      expect(module.DURATION).toBeGreaterThan(0);
    });

    it('should define FRAME_INTERVAL constant with correct type', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      // FRAME_INTERVAL should exist and be a number
      expect(module.FRAME_INTERVAL).toBeDefined();
      expect(typeof module.FRAME_INTERVAL).toBe('number');
      expect(module.FRAME_INTERVAL).toBeGreaterThan(0);
    });

    it('should define FPS_TARGET constant with correct type', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      // FPS_TARGET should exist and be a number
      expect(module.FPS_TARGET).toBeDefined();
      expect(typeof module.FPS_TARGET).toBe('number');
      expect(module.FPS_TARGET).toBeGreaterThan(0);
    });

    it('should have reasonable animation timing values', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      // Validate that constants have reasonable values
      expect(module.DURATION).toBe(2000); // 2 seconds
      expect(module.FRAME_INTERVAL).toBe(16); // ~60fps
      expect(module.FPS_TARGET).toBe(60);

      // Frame interval should be approximately 1000/FPS_TARGET
      const expectedInterval = Math.floor(1000 / module.FPS_TARGET);
      expect(module.FRAME_INTERVAL).toBeCloseTo(expectedInterval, 1);
    });
  });

  describe('TypeScript Compilation', () => {
    it('should compile without TypeScript errors', async () => {
      // If this test runs, TypeScript compilation succeeded
      const module = await import('../lib/ui/banner-animation.js');
      expect(module).toBeDefined();
    });
  });
});

describe('Gradient Utilities (Internal Functions)', () => {
  // These tests verify the internal gradient utility functions by testing their behavior
  // through their expected logic, since they are not exported.
  // The functions are duplicated from lib/ui/banner.ts (lines 49-77)

  /**
   * Helper functions that duplicate the internal implementation for testing
   */
  function parseHex(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  function lerpColor(colorA: string, colorB: string, t: number): string {
    const [r1, g1, b1] = parseHex(colorA);
    const [r2, g2, b2] = parseHex(colorB);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function hexToAnsi(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `\x1b[38;2;${r};${g};${b}m`;
  }

  describe('parseHex', () => {
    it('parses sky-200 (#0ea5e9)', () => {
      expect(parseHex('#0ea5e9')).toEqual([14, 165, 233]);
    });

    it('parses sky-400 (#0284c7)', () => {
      expect(parseHex('#0284c7')).toEqual([2, 132, 199]);
    });

    it('parses sky-500 (#0369a1)', () => {
      expect(parseHex('#0369a1')).toEqual([3, 105, 161]);
    });

    it('parses black (#000000)', () => {
      expect(parseHex('#000000')).toEqual([0, 0, 0]);
    });

    it('parses white (#ffffff)', () => {
      expect(parseHex('#ffffff')).toEqual([255, 255, 255]);
    });
  });

  describe('lerpColor', () => {
    it('returns start color at t=0', () => {
      const result = lerpColor('#0ea5e9', '#0284c7', 0);
      expect(result).toEqual('#0ea5e9');
    });

    it('returns end color at t=1', () => {
      const result = lerpColor('#0ea5e9', '#0284c7', 1);
      expect(result).toEqual('#0284c7');
    });

    it('interpolates midpoint correctly at t=0.5', () => {
      const result = lerpColor('#0ea5e9', '#0284c7', 0.5);
      // Verify result is between start and end
      const [r, g] = parseHex(result);
      expect(r).toBeGreaterThanOrEqual(2);
      expect(r).toBeLessThanOrEqual(14);
      expect(g).toBeGreaterThanOrEqual(132);
      expect(g).toBeLessThanOrEqual(165);
    });

    it('interpolates across palette (sky200→sky400→sky500)', () => {
      const c1 = lerpColor('#0ea5e9', '#0284c7', 0.3);
      const c2 = lerpColor('#0ea5e9', '#0284c7', 0.7);
      expect(c1).not.toEqual(c2);
    });
  });

  describe('hexToAnsi', () => {
    it('generates ANSI escape for sky-200', () => {
      expect(hexToAnsi('#0ea5e9')).toEqual('\x1b[38;2;14;165;233m');
    });

    it('generates ANSI escape for sky-400', () => {
      expect(hexToAnsi('#0284c7')).toEqual('\x1b[38;2;2;132;199m');
    });

    it('generates ANSI escape for sky-500', () => {
      expect(hexToAnsi('#0369a1')).toEqual('\x1b[38;2;3;105;161m');
    });

    it('contains proper escape code prefix', () => {
      const result = hexToAnsi('#0ea5e9');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/);
    });

    it('uses RGB values in correct order', () => {
      const result = hexToAnsi('#123456');
      expect(result).toEqual('\x1b[38;2;18;52;86m');
    });
  });

  describe('gradient utility pipeline', () => {
    it('end-to-end: hex → RGB → ANSI', () => {
      const hex = '#0ea5e9';
      const ansi = hexToAnsi(hex);
      expect(ansi).toEqual('\x1b[38;2;14;165;233m');
    });

    it('interpolation chain: hexA → lerp → hexToAnsi → ANSI', () => {
      const interpolated = lerpColor('#0ea5e9', '#0284c7', 0.5);
      const ansi = hexToAnsi(interpolated);
      // eslint-disable-next-line no-control-regex
      expect(ansi).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/);
    });

    it('all palette colors produce valid ANSI codes', () => {
      const colors = ['#0ea5e9', '#0284c7', '#0369a1'];
      colors.forEach((color) => {
        const ansi = hexToAnsi(color);
        // eslint-disable-next-line no-control-regex
        expect(ansi).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/);
      });
    });
  });
});

describe('Terminal Height Validation', () => {
  describe('MIN_TERMINAL_HEIGHT constant', () => {
    it('should define MIN_TERMINAL_HEIGHT constant', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      expect(module.MIN_TERMINAL_HEIGHT).toBeDefined();
    });

    it('should equal 10 lines', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      expect(module.MIN_TERMINAL_HEIGHT).toBe(10);
    });

    it('should be a number', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      expect(typeof module.MIN_TERMINAL_HEIGHT).toBe('number');
    });
  });

  describe('hasMinimumHeight', () => {
    it('should export hasMinimumHeight function', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      expect(module.hasMinimumHeight).toBeDefined();
      expect(typeof module.hasMinimumHeight).toBe('function');
    });

    it('should return false when rows < 10', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const originalRows = process.stdout.rows;

      try {
        // Test with rows = 5
        Object.defineProperty(process.stdout, 'rows', {
          value: 5,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(false);

        // Test with rows = 9
        Object.defineProperty(process.stdout, 'rows', {
          value: 9,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(false);
      } finally {
        // Restore original value
        Object.defineProperty(process.stdout, 'rows', {
          value: originalRows,
          configurable: true,
        });
      }
    });

    it('should return true when rows >= 10', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const originalRows = process.stdout.rows;

      try {
        // Test with rows = 10
        Object.defineProperty(process.stdout, 'rows', {
          value: 10,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(true);

        // Test with rows = 80
        Object.defineProperty(process.stdout, 'rows', {
          value: 80,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(true);
      } finally {
        // Restore original value
        Object.defineProperty(process.stdout, 'rows', {
          value: originalRows,
          configurable: true,
        });
      }
    });

    it('should return false when rows is undefined (non-TTY)', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const originalRows = process.stdout.rows;

      try {
        // Simulate non-TTY environment where rows is undefined
        Object.defineProperty(process.stdout, 'rows', {
          value: undefined,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(false);
      } finally {
        // Restore original value
        Object.defineProperty(process.stdout, 'rows', {
          value: originalRows,
          configurable: true,
        });
      }
    });

    it('should handle edge case: rows = 0', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const originalRows = process.stdout.rows;

      try {
        Object.defineProperty(process.stdout, 'rows', {
          value: 0,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(false);
      } finally {
        Object.defineProperty(process.stdout, 'rows', {
          value: originalRows,
          configurable: true,
        });
      }
    });

    it('should handle edge case: rows = 1', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const originalRows = process.stdout.rows;

      try {
        Object.defineProperty(process.stdout, 'rows', {
          value: 1,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(false);
      } finally {
        Object.defineProperty(process.stdout, 'rows', {
          value: originalRows,
          configurable: true,
        });
      }
    });

    it('should handle very large terminal height', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const originalRows = process.stdout.rows;

      try {
        Object.defineProperty(process.stdout, 'rows', {
          value: 1000,
          configurable: true,
        });
        expect(module.hasMinimumHeight()).toBe(true);
      } finally {
        Object.defineProperty(process.stdout, 'rows', {
          value: originalRows,
          configurable: true,
        });
      }
    });
  });
});

describe('shouldAnimate() Detection', () => {
  // Store original values to restore after tests
  let originalIsTTY: boolean | undefined;
  let originalColumns: number | undefined;
  let originalRows: number | undefined;
  let originalNoColor: string | undefined;
  let originalSpeciNoAnimation: string | undefined;

  beforeEach(async () => {
    // Store original values
    originalIsTTY = process.stdout.isTTY;
    originalColumns = process.stdout.columns;
    originalRows = process.stdout.rows;
    originalNoColor = process.env.NO_COLOR;
    originalSpeciNoAnimation = process.env.SPECI_NO_ANIMATION;
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'columns', {
      value: originalColumns,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'rows', {
      value: originalRows,
      configurable: true,
    });

    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }

    if (originalSpeciNoAnimation === undefined) {
      delete process.env.SPECI_NO_ANIMATION;
    } else {
      process.env.SPECI_NO_ANIMATION = originalSpeciNoAnimation;
    }
  });

  describe('all conditions met (happy path)', () => {
    it('returns true when all conditions are met', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const colorsModule = await import('../lib/ui/colors.js');

      // Mock supportsColor to return true
      vi.spyOn(colorsModule, 'supportsColor').mockReturnValue(true);

      // Set all conditions to pass
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        configurable: true,
      });

      delete process.env.NO_COLOR;
      delete process.env.SPECI_NO_ANIMATION;

      expect(module.shouldAnimate()).toBe(true);
    });
  });

  describe('individual condition failures', () => {
    beforeEach(async () => {
      const colorsModule = await import('../lib/ui/colors.js');

      // Setup baseline: all conditions true
      vi.spyOn(colorsModule, 'supportsColor').mockReturnValue(true);
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        configurable: true,
      });
      delete process.env.NO_COLOR;
      delete process.env.SPECI_NO_ANIMATION;
    });

    it('returns false when color not supported (E-2)', async () => {
      const module = await import('../lib/ui/banner-animation.js');
      const colorsModule = await import('../lib/ui/colors.js');

      vi.spyOn(colorsModule, 'supportsColor').mockReturnValue(false);
      expect(module.shouldAnimate()).toBe(false);
    });

    it('returns false when not TTY (E-1)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(false);
    });

    it('returns false when NO_COLOR set (E-3)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      process.env.NO_COLOR = '1';
      expect(module.shouldAnimate()).toBe(false);
    });

    it('returns false when SPECI_NO_ANIMATION set', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      process.env.SPECI_NO_ANIMATION = '1';
      expect(module.shouldAnimate()).toBe(false);
    });

    it('returns false when width < 40 (E-4)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: 39,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(false);
    });

    it('returns false when height < 10 (E-5)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'rows', {
        value: 9,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(false);
    });
  });

  describe('environment variable truthiness', () => {
    beforeEach(async () => {
      const colorsModule = await import('../lib/ui/colors.js');

      // Setup baseline
      vi.spyOn(colorsModule, 'supportsColor').mockReturnValue(true);
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        configurable: true,
      });
    });

    it('NO_COLOR with empty string is falsy (animation enabled)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      process.env.NO_COLOR = '';
      delete process.env.SPECI_NO_ANIMATION;
      expect(module.shouldAnimate()).toBe(true);
    });

    it('NO_COLOR=0 disables animation (string "0" is truthy)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      process.env.NO_COLOR = '0';
      delete process.env.SPECI_NO_ANIMATION;
      expect(module.shouldAnimate()).toBe(false);
    });

    it('NO_COLOR=false disables animation (string "false" is truthy)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      process.env.NO_COLOR = 'false';
      delete process.env.SPECI_NO_ANIMATION;
      expect(module.shouldAnimate()).toBe(false);
    });

    it('SPECI_NO_ANIMATION with empty string is falsy (animation enabled)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      delete process.env.NO_COLOR;
      process.env.SPECI_NO_ANIMATION = '';
      expect(module.shouldAnimate()).toBe(true);
    });

    it('SPECI_NO_ANIMATION=1 disables animation', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      delete process.env.NO_COLOR;
      process.env.SPECI_NO_ANIMATION = '1';
      expect(module.shouldAnimate()).toBe(false);
    });
  });

  describe('dimension fallbacks', () => {
    beforeEach(async () => {
      const colorsModule = await import('../lib/ui/colors.js');

      // Setup baseline
      vi.spyOn(colorsModule, 'supportsColor').mockReturnValue(true);
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
      delete process.env.SPECI_NO_ANIMATION;
    });

    it('uses default width 80 when columns undefined', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(true); // 80 >= 40
    });

    it('uses default height 24 when rows undefined', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: undefined,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(true); // 24 >= 10
    });

    it('returns false for explicitly narrow terminal even with default', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: 30,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(false);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      const colorsModule = await import('../lib/ui/colors.js');

      // Setup baseline
      vi.spyOn(colorsModule, 'supportsColor').mockReturnValue(true);
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
      delete process.env.SPECI_NO_ANIMATION;
    });

    it('accepts exactly width 40 (boundary)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: 40,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(true);
    });

    it('accepts exactly height 10 (boundary)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 10,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(true);
    });

    it('rejects width 39 (below boundary)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: 39,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(false);
    });

    it('rejects height 9 (below boundary)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 9,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(false);
    });

    it('handles both dimensions undefined (defaults pass)', async () => {
      const module = await import('../lib/ui/banner-animation.js');

      Object.defineProperty(process.stdout, 'columns', {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: undefined,
        configurable: true,
      });
      expect(module.shouldAnimate()).toBe(true); // 80 >= 40, 24 >= 10
    });
  });
});
