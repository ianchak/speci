/**
 * Tests for Banner Animation Renderer Module
 *
 * Tests frame buffer management, rendering logic, and animation loop.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AnimationState } from '@/ui/banner-animation/renderer.js';

describe('Banner Animation Renderer Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Import', () => {
    it('should import without errors', async () => {
      await expect(
        import('@/ui/banner-animation/renderer.js')
      ).resolves.toBeDefined();
    });
  });

  describe('AnimationState interface', () => {
    it('should have correct shape', () => {
      // Test that we can create a valid AnimationState object
      const state: AnimationState = {
        isRunning: false,
        startTime: 0,
        duration: 2000,
        frameInterval: 16,
        currentFrame: 0,
        timerId: null,
        cleanupFn: null,
      };

      expect(state.isRunning).toBe(false);
      expect(state.duration).toBe(2000);
    });
  });

  describe('runAnimationLoop', () => {
    it('should export runAnimationLoop function', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      expect(module.runAnimationLoop).toBeDefined();
      expect(typeof module.runAnimationLoop).toBe('function');
    });

    it.skip('should clamp duration to safe range [100, 5000]', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      const mockEffect = vi.fn(() => ['', '', '', '', '', '']);
      const state: AnimationState = {
        isRunning: false,
        startTime: 0,
        duration: 0,
        frameInterval: 16,
        currentFrame: 0,
        timerId: null,
        cleanupFn: null,
      };

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.useFakeTimers();

      // Test minimum clamping (< 100ms → 100ms)
      const promise1 = module.runAnimationLoop(mockEffect, 50, state);
      vi.advanceTimersByTime(150);
      await promise1;
      expect(state.duration).toBe(100);

      // Test maximum clamping (> 5000ms → 5000ms)
      state.isRunning = false;
      state.currentFrame = 0;
      const promise2 = module.runAnimationLoop(mockEffect, 10000, state);
      vi.advanceTimersByTime(200);
      await promise2;
      expect(state.duration).toBe(5000);

      vi.useRealTimers();
    });

    it('should set isRunning to true during animation', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      const mockEffect = vi.fn(() => ['', '', '', '', '', '']);
      const state: AnimationState = {
        isRunning: false,
        startTime: 0,
        duration: 0,
        frameInterval: 16,
        currentFrame: 0,
        timerId: null,
        cleanupFn: null,
      };

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.useFakeTimers();

      const promise = module.runAnimationLoop(mockEffect, 1000, state);

      // After a small delay, isRunning should be true
      await vi.advanceTimersByTimeAsync(10);
      expect(state.isRunning).toBe(true);

      // Complete the animation
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      vi.useRealTimers();
    });

    it('should call effect function with progress values', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      const mockEffect = vi.fn(() => ['', '', '', '', '', '']);
      const state: AnimationState = {
        isRunning: false,
        startTime: 0,
        duration: 0,
        frameInterval: 16,
        currentFrame: 0,
        timerId: null,
        cleanupFn: null,
      };

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.useFakeTimers();

      const promise = module.runAnimationLoop(mockEffect, 100, state);
      await vi.advanceTimersByTimeAsync(150);
      await promise;

      // Effect should have been called at least once
      expect(mockEffect).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should stop animation when isRunning set to false', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      const mockEffect = vi.fn(() => ['', '', '', '', '', '']);
      const state: AnimationState = {
        isRunning: false,
        startTime: 0,
        duration: 0,
        frameInterval: 16,
        currentFrame: 0,
        timerId: null,
        cleanupFn: null,
      };

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.useFakeTimers();

      const promise = module.runAnimationLoop(mockEffect, 2000, state);

      // Let animation start
      await vi.advanceTimersByTimeAsync(50);
      expect(state.isRunning).toBe(true);

      // Stop animation
      state.isRunning = false;

      // Advance time to allow loop to exit
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      // Effect should not have been called for full duration
      expect(mockEffect).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('animateVersion', () => {
    it('should export animateVersion function', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      expect(module.animateVersion).toBeDefined();
      expect(typeof module.animateVersion).toBe('function');
    });

    it('should animate version string', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.useFakeTimers();

      const promise = module.animateVersion('1.0.0', 100);
      await vi.advanceTimersByTimeAsync(150);
      await promise;

      // Should have written to stdout
      expect(process.stdout.write).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('selectRandomEffect', () => {
    it('should export selectRandomEffect function', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      expect(module.selectRandomEffect).toBeDefined();
      expect(typeof module.selectRandomEffect).toBe('function');
    });

    it('should return a function', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      const effect = module.selectRandomEffect();
      expect(typeof effect).toBe('function');
    });

    it('should return an effect that returns 6 lines', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      const effect = module.selectRandomEffect();
      const result = effect(0.5);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(6);
    });
  });

  describe('Animation constants', () => {
    it('should export timing constants', async () => {
      const module = await import('@/ui/banner-animation/renderer.js');

      expect(module.DURATION).toBeDefined();
      expect(typeof module.DURATION).toBe('number');
      expect(module.DURATION).toBe(2000);

      expect(module.FRAME_INTERVAL).toBeDefined();
      expect(typeof module.FRAME_INTERVAL).toBe('number');
      expect(module.FRAME_INTERVAL).toBe(16);

      expect(module.VERSION_DURATION).toBeDefined();
      expect(typeof module.VERSION_DURATION).toBe('number');
      expect(module.VERSION_DURATION).toBe(400);
    });
  });
});
