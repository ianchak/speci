import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as banner from '../lib/ui/banner.js';
import * as bannerAnimation from '../lib/ui/banner-animation.js';

describe('CLI Initialize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('displayBanner()', () => {
    it('should display static banner when animation is not appropriate', async () => {
      const { displayBanner } = await import('../lib/cli/initialize.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(bannerAnimation, 'shouldAnimate').mockReturnValue(false);
      vi.spyOn(banner, 'renderBanner').mockReturnValue('BANNER_TEXT');

      const result = displayBanner({ color: true });

      expect(result).toBeUndefined();
      expect(bannerAnimation.shouldAnimate).toHaveBeenCalledWith({
        color: true,
      });
      expect(banner.renderBanner).toHaveBeenCalledWith({ showVersion: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('BANNER_TEXT')
      );

      consoleSpy.mockRestore();
    });

    it('should animate banner when conditions are met', async () => {
      const { displayBanner } = await import('../lib/cli/initialize.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(bannerAnimation, 'shouldAnimate').mockReturnValue(true);
      vi.spyOn(bannerAnimation, 'animateBanner').mockResolvedValue();

      const result = displayBanner({ color: true });

      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(bannerAnimation.shouldAnimate).toHaveBeenCalledWith({
        color: true,
      });
      expect(bannerAnimation.animateBanner).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should default to no color when options not provided', async () => {
      const { displayBanner } = await import('../lib/cli/initialize.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(bannerAnimation, 'shouldAnimate').mockReturnValue(false);
      vi.spyOn(banner, 'renderBanner').mockReturnValue('');

      displayBanner();

      expect(bannerAnimation.shouldAnimate).toHaveBeenCalledWith(undefined);

      consoleSpy.mockRestore();
    });
  });

  describe('displayStaticBanner()', () => {
    it('should render banner with version', async () => {
      const { displayStaticBanner } = await import('../lib/cli/initialize.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(banner, 'renderBanner').mockReturnValue('TEST_BANNER');

      displayStaticBanner();

      expect(banner.renderBanner).toHaveBeenCalledWith({ showVersion: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TEST_BANNER')
      );

      consoleSpy.mockRestore();
    });

    it('should add newlines around banner', async () => {
      const { displayStaticBanner } = await import('../lib/cli/initialize.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(banner, 'renderBanner').mockReturnValue('BANNER');

      displayStaticBanner();

      const calls = consoleSpy.mock.calls;
      expect(calls[0][0]).toMatch(/^\n.*\n$/);

      consoleSpy.mockRestore();
    });
  });

  describe('shouldShowBanner()', () => {
    it('should return false for help flags', async () => {
      const { shouldShowBanner } = await import('../lib/cli/initialize.js');

      expect(shouldShowBanner(['--help'])).toBe(false);
      expect(shouldShowBanner(['-h'])).toBe(false);
      expect(shouldShowBanner(['help'])).toBe(false);
    });

    it('should return false for version flags', async () => {
      const { shouldShowBanner } = await import('../lib/cli/initialize.js');

      expect(shouldShowBanner(['--version'])).toBe(false);
      expect(shouldShowBanner(['-V'])).toBe(false);
    });

    it('should return false for JSON output', async () => {
      const { shouldShowBanner } = await import('../lib/cli/initialize.js');

      expect(shouldShowBanner(['status', '--json'])).toBe(false);
    });

    it('should return false for status command', async () => {
      const { shouldShowBanner } = await import('../lib/cli/initialize.js');

      expect(shouldShowBanner(['status'])).toBe(false);
      expect(shouldShowBanner(['s'])).toBe(false);
    });

    it('should return true for regular commands', async () => {
      const { shouldShowBanner } = await import('../lib/cli/initialize.js');

      expect(shouldShowBanner(['run'])).toBe(true);
      expect(shouldShowBanner(['init'])).toBe(true);
      expect(shouldShowBanner(['plan'])).toBe(true);
    });

    it('should return true for empty args', async () => {
      const { shouldShowBanner } = await import('../lib/cli/initialize.js');

      expect(shouldShowBanner([])).toBe(true);
    });
  });
});
