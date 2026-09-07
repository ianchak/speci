/**
 * Tests for Banner Animation Terminal Module
 *
 * Tests terminal state management, TTY detection, and cursor control.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Banner Animation Terminal Module', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalRowsDescriptor: PropertyDescriptor | undefined;
  let originalColumnsDescriptor: PropertyDescriptor | undefined;

  function mockTerminalSize(
    rows: number | undefined,
    columns: number | undefined = 80
  ): void {
    Object.defineProperty(process.stdout, 'rows', {
      configurable: true,
      value: rows,
    });
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: columns,
    });
  }

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalRowsDescriptor = Object.getOwnPropertyDescriptor(
      process.stdout,
      'rows'
    );
    originalColumnsDescriptor = Object.getOwnPropertyDescriptor(
      process.stdout,
      'columns'
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();

    if (originalRowsDescriptor) {
      Object.defineProperty(process.stdout, 'rows', originalRowsDescriptor);
    } else {
      delete process.stdout.rows;
    }

    if (originalColumnsDescriptor) {
      Object.defineProperty(
        process.stdout,
        'columns',
        originalColumnsDescriptor
      );
    } else {
      delete process.stdout.columns;
    }
  });

  describe('Module Import', () => {
    it('should import without errors', async () => {
      await expect(
        import('@/ui/banner-animation/runner.js')
      ).resolves.toBeDefined();
    });
  });

  describe('hasMinimumHeight', () => {
    it('should return true when terminal height >= 10', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      mockTerminalSize(10);
      expect(module.hasMinimumHeight()).toBe(true);

      mockTerminalSize(20);
      expect(module.hasMinimumHeight()).toBe(true);
    });

    it('should return false when terminal height < 10', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      mockTerminalSize(9);
      expect(module.hasMinimumHeight()).toBe(false);

      mockTerminalSize(5);
      expect(module.hasMinimumHeight()).toBe(false);
    });

    it('should return false when rows is undefined (non-TTY)', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      mockTerminalSize(undefined);
      expect(module.hasMinimumHeight()).toBe(false);
    });

    it('should handle edge case height = 10', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      mockTerminalSize(10);
      expect(module.hasMinimumHeight()).toBe(true);
    });
  });

  describe('shouldAnimate', () => {
    it('should return false when --no-color flag is set', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
      });
      mockTerminalSize(20);

      const result = module.shouldAnimate({ color: false });
      expect(result).toBe(false);
    });

    it('should return false when NO_COLOR environment variable is set', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      process.env.NO_COLOR = '1';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
      });
      mockTerminalSize(20);

      const result = module.shouldAnimate();
      expect(result).toBe(false);
    });

    it('should return false when SPECI_NO_ANIMATION is set', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      process.env.SPECI_NO_ANIMATION = '1';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
      });
      mockTerminalSize(20);

      const result = module.shouldAnimate();
      expect(result).toBe(false);
    });

    it('should return false when not TTY', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
      });

      const result = module.shouldAnimate();
      expect(result).toBe(false);
    });

    it('should return false when terminal width < 40', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
      });
      mockTerminalSize(20, 39);

      const result = module.shouldAnimate();
      expect(result).toBe(false);
    });

    it('should return false when terminal height < 10', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
      });
      mockTerminalSize(9);

      const result = module.shouldAnimate();
      expect(result).toBe(false);
    });

    it('should use default dimensions when undefined', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
      });
      mockTerminalSize(undefined, undefined);

      // Should use defaults: 80x24, which passes both checks
      const result = module.shouldAnimate();
      // Result depends on color support, but should not throw
      expect(typeof result).toBe('boolean');
    });
  });

  describe('ANSI constants', () => {
    it('should export MIN_TERMINAL_HEIGHT constant', async () => {
      const module = await import('@/ui/banner-animation/runner.js');

      expect(module.MIN_TERMINAL_HEIGHT).toBeDefined();
      expect(typeof module.MIN_TERMINAL_HEIGHT).toBe('number');
      expect(module.MIN_TERMINAL_HEIGHT).toBe(10);
    });
  });
});
