/**
 * Tests for Banner Animation Effects Module
 *
 * Tests the isolated effect functions (wave, fade, sweep) for banner animation.
 * Each effect function is pure and should produce deterministic output.
 */

import { describe, it, expect } from 'vitest';
import {
  renderWaveFrame,
  renderFadeFrame,
  renderSweepFrame,
} from '@/ui/banner-animation/effects.js';
import { BANNER_ART } from '@/ui/banner.js';

describe('Banner Animation Effects', () => {
  describe.skip('renderWaveFrame', () => {
    it('should return array of 6 strings at any progress', () => {
      const result = renderWaveFrame(0.5);
      expect(result).toHaveLength(6);
      expect(result.every((line) => typeof line === 'string')).toBe(true);
    });

    it('should return all spaces at progress 0', () => {
      const result = renderWaveFrame(0);
      // At progress 0, all characters should be unrevealed (spaces)
      expect(result.every((line) => line.trim() === '')).toBe(true);
    });

    it('should return fully revealed banner at progress 1', () => {
      const result = renderWaveFrame(1.0);
      // At progress 1, banner should be fully revealed (contains non-space chars)
      // Strip ANSI codes to check actual content
      const strippedLines = result.map((line) =>
        // eslint-disable-next-line no-control-regex
        line.replace(/\x1b\[[0-9;]*m/g, '')
      );
      expect(
        strippedLines.some(
          (line) =>
            line.includes('S') || line.includes('P') || line.includes('E')
        )
      ).toBe(true);
    });

    it('should partially reveal at progress 0.5', () => {
      const result = renderWaveFrame(0.5);
      // At progress 0.5, some characters revealed, some not
      const hasContent = result.some((line) => line.length > 0);
      expect(hasContent).toBe(true);
    });

    it('should clamp negative progress to 0', () => {
      const result = renderWaveFrame(-0.5);
      expect(result.every((line) => line.trim() === '')).toBe(true);
    });

    it('should clamp progress > 1 to 1', () => {
      const result1 = renderWaveFrame(1.0);
      const result2 = renderWaveFrame(1.5);
      expect(result1).toEqual(result2);
    });

    it('should include ANSI color codes in revealed characters', () => {
      const result = renderWaveFrame(1.0);
      // ANSI color codes start with \x1b[
      expect(result.some((line) => line.includes('\x1b['))).toBe(true);
    });

    it('should handle edge case progress values', () => {
      expect(() => renderWaveFrame(0)).not.toThrow();
      expect(() => renderWaveFrame(0.0001)).not.toThrow();
      expect(() => renderWaveFrame(0.9999)).not.toThrow();
      expect(() => renderWaveFrame(1)).not.toThrow();
    });
  });

  describe('renderFadeFrame', () => {
    it('should return array of 6 strings at any progress', () => {
      const result = renderFadeFrame(0.5);
      expect(result).toHaveLength(6);
      expect(result.every((line) => typeof line === 'string')).toBe(true);
    });

    it('should return darkest colors at progress 0', () => {
      const result = renderFadeFrame(0);
      // At progress 0, all colors faded to black
      expect(result.every((line) => line.length > 0)).toBe(true);
    });

    it('should return full gradient at progress 1', () => {
      const result = renderFadeFrame(1.0);
      expect(result.some((line) => line.includes('\x1b['))).toBe(true);
    });

    it('should clamp negative progress to 0', () => {
      const result = renderFadeFrame(-0.5);
      const result0 = renderFadeFrame(0);
      expect(result).toEqual(result0);
    });

    it('should clamp progress > 1 to 1', () => {
      const result1 = renderFadeFrame(1.0);
      const result2 = renderFadeFrame(1.5);
      expect(result1).toEqual(result2);
    });

    it('should include ANSI color codes in all frames', () => {
      const result = renderFadeFrame(0.5);
      expect(result.some((line) => line.includes('\x1b['))).toBe(true);
    });

    it('should handle edge case progress values', () => {
      expect(() => renderFadeFrame(0)).not.toThrow();
      expect(() => renderFadeFrame(0.0001)).not.toThrow();
      expect(() => renderFadeFrame(0.9999)).not.toThrow();
      expect(() => renderFadeFrame(1)).not.toThrow();
    });
  });

  describe.skip('renderSweepFrame', () => {
    it('should return array of 6 strings at any progress', () => {
      const result = renderSweepFrame(0.5);
      expect(result).toHaveLength(6);
      expect(result.every((line) => typeof line === 'string')).toBe(true);
    });

    it('should return all spaces at progress 0', () => {
      const result = renderSweepFrame(0);
      expect(result.every((line) => line.trim() === '')).toBe(true);
    });

    it('should return fully revealed banner at progress 1', () => {
      const result = renderSweepFrame(1.0);
      // Strip ANSI codes to check actual content
      const strippedLines = result.map((line) =>
        // eslint-disable-next-line no-control-regex
        line.replace(/\x1b\[[0-9;]*m/g, '')
      );
      expect(
        strippedLines.some(
          (line) =>
            line.includes('S') || line.includes('P') || line.includes('E')
        )
      ).toBe(true);
    });

    it('should partially reveal at progress 0.5', () => {
      const result = renderSweepFrame(0.5);
      const hasContent = result.some((line) => line.length > 0);
      expect(hasContent).toBe(true);
    });

    it('should clamp negative progress to 0', () => {
      const result = renderSweepFrame(-0.5);
      expect(result.every((line) => line.trim() === '')).toBe(true);
    });

    it('should clamp progress > 1 to 1', () => {
      const result1 = renderSweepFrame(1.0);
      const result2 = renderSweepFrame(1.5);
      expect(result1).toEqual(result2);
    });

    it('should include ANSI color codes in revealed characters', () => {
      const result = renderSweepFrame(1.0);
      expect(result.some((line) => line.includes('\x1b['))).toBe(true);
    });

    it('should handle edge case progress values', () => {
      expect(() => renderSweepFrame(0)).not.toThrow();
      expect(() => renderSweepFrame(0.0001)).not.toThrow();
      expect(() => renderSweepFrame(0.9999)).not.toThrow();
      expect(() => renderSweepFrame(1)).not.toThrow();
    });
  });

  describe('Effect consistency', () => {
    it('all effects should return same length arrays', () => {
      const wave = renderWaveFrame(0.5);
      const fade = renderFadeFrame(0.5);
      const sweep = renderSweepFrame(0.5);

      expect(wave.length).toBe(fade.length);
      expect(fade.length).toBe(sweep.length);
      expect(sweep.length).toBe(BANNER_ART.length);
    });

    it('effects should be deterministic for same progress', () => {
      const wave1 = renderWaveFrame(0.5);
      const wave2 = renderWaveFrame(0.5);
      expect(wave1).toEqual(wave2);

      const fade1 = renderFadeFrame(0.5);
      const fade2 = renderFadeFrame(0.5);
      expect(fade1).toEqual(fade2);

      const sweep1 = renderSweepFrame(0.5);
      const sweep2 = renderSweepFrame(0.5);
      expect(sweep1).toEqual(sweep2);
    });
  });
});
