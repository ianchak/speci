/**
 * Tests for Progress Bar Module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderBar,
  formatIterationLabel,
  renderBorder,
  renderIterationDisplay,
} from '../lib/ui/progress-bar.js';
import { stripAnsi } from '../lib/ui/colors.js';

describe('Progress Bar', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Disable colors for predictable assertions
    process.env.NO_COLOR = '1';
    // Force ASCII mode for deterministic character output
    process.env.SPECI_ASCII = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('renderBar', () => {
    it('should render a full bar at 100% progress', () => {
      const bar = renderBar(5, 5, 10);
      expect(bar).toBe('##########');
    });

    it('should render an empty bar at 0% progress', () => {
      const bar = renderBar(0, 5, 10);
      expect(bar).toBe('..........');
    });

    it('should render partial progress correctly', () => {
      const bar = renderBar(1, 2, 10);
      expect(bar).toBe('#####.....');
    });

    it('should default to bar width of 20', () => {
      const bar = renderBar(0, 1);
      expect(bar).toHaveLength(20);
    });

    it('should clamp current above total', () => {
      const bar = renderBar(10, 5, 10);
      expect(bar).toBe('##########');
    });

    it('should clamp negative current to zero', () => {
      const bar = renderBar(-1, 5, 10);
      expect(bar).toBe('..........');
    });

    it('should handle zero total without error', () => {
      const bar = renderBar(0, 0, 10);
      expect(bar).toBe('..........');
    });

    it('should handle bar width of 1', () => {
      const bar = renderBar(1, 1, 1);
      expect(bar).toBe('#');
    });
  });

  describe('renderBorder', () => {
    it('should render a border of default width (36)', () => {
      const border = renderBorder();
      expect(border).toHaveLength(36);
    });

    it('should render a border of custom width', () => {
      const border = renderBorder(10);
      expect(border).toHaveLength(10);
      expect(border).toBe('-'.repeat(10));
    });

    it('should render zero-width border as empty string', () => {
      const border = renderBorder(0);
      expect(border).toBe('');
    });
  });

  describe('formatIterationLabel', () => {
    it('should include counter values', () => {
      const label = formatIterationLabel({ current: 3, total: 10 });
      expect(label).toContain('3');
      expect(label).toContain('10');
      expect(label).toContain('/');
    });

    it('should include default "Iteration" label', () => {
      const label = formatIterationLabel({ current: 1, total: 5 });
      expect(label).toContain('Iteration');
    });

    it('should support custom label text', () => {
      const label = formatIterationLabel({
        current: 1,
        total: 5,
        label: 'Step',
      });
      expect(label).toContain('Step');
      expect(label).not.toContain('Iteration');
    });

    it('should include glyph pointer', () => {
      // ASCII fallback pointer is '>'
      const label = formatIterationLabel({ current: 1, total: 5 });
      expect(label).toContain('>');
    });
  });

  describe('renderIterationDisplay', () => {
    it('should return exactly three lines', () => {
      const lines = renderIterationDisplay({ current: 1, total: 5 });
      expect(lines).toHaveLength(3);
    });

    it('should have matching top and bottom borders', () => {
      const lines = renderIterationDisplay({ current: 1, total: 5 });
      expect(lines[0]).toBe(lines[2]);
    });

    it('should contain the iteration counter in the middle line', () => {
      const lines = renderIterationDisplay({ current: 2, total: 5 });
      expect(lines[1]).toContain('2');
      expect(lines[1]).toContain('5');
      expect(lines[1]).toContain('/');
    });

    it('should contain a progress bar in the middle line', () => {
      const lines = renderIterationDisplay({
        current: 5,
        total: 5,
        barWidth: 10,
      });
      // ASCII filled char is '#'
      expect(lines[1]).toContain('#'.repeat(10));
    });

    it('should respect custom border width', () => {
      const lines = renderIterationDisplay({
        current: 1,
        total: 5,
        borderWidth: 20,
      });
      expect(lines[0]).toHaveLength(20);
    });

    it('should respect custom bar width', () => {
      const lines = renderIterationDisplay({
        current: 0,
        total: 5,
        barWidth: 15,
      });
      // ASCII empty char is '.'
      expect(lines[1]).toContain('.'.repeat(15));
    });

    it('should support custom label', () => {
      const lines = renderIterationDisplay({
        current: 1,
        total: 3,
        label: 'Phase',
      });
      expect(lines[1]).toContain('Phase');
    });
  });

  describe('Unicode rendering', () => {
    beforeEach(() => {
      // Enable Unicode for these tests
      delete process.env.SPECI_ASCII;
      process.env.LANG = 'en_US.UTF-8';
    });

    it('should use Unicode block characters for bar', () => {
      const bar = renderBar(2, 4, 4);
      expect(bar).toContain('\u2588'); // █
      expect(bar).toContain('\u2591'); // ░
    });

    it('should use Unicode border character', () => {
      const border = renderBorder(5);
      expect(border).toContain('\u2500'); // ─
    });

    it('should use Unicode pointer glyph in label', () => {
      const label = formatIterationLabel({ current: 1, total: 1 });
      expect(label).toContain('▸');
    });
  });

  describe('Color support', () => {
    beforeEach(() => {
      // Enable colors
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '1';
      process.env.SPECI_ASCII = '1';
    });

    it('should apply ANSI color codes when colors are supported', () => {
      const bar = renderBar(1, 2, 4);
      // Should contain ANSI escape sequences
      expect(bar).toContain('\u001b[');
      // Stripped version should just be characters
      expect(stripAnsi(bar)).toBe('##..');
    });

    it('should colorize border', () => {
      const border = renderBorder(5);
      expect(border).toContain('\u001b[');
      expect(stripAnsi(border)).toBe('-'.repeat(5));
    });

    it('should colorize iteration label', () => {
      const label = formatIterationLabel({ current: 1, total: 3 });
      expect(label).toContain('\u001b[');
      const plain = stripAnsi(label);
      expect(plain).toContain('1');
      expect(plain).toContain('3');
    });
  });
});
