/**
 * Tests for lib/constants.ts
 *
 * Validates that the constants module exports all expected constants
 * and that helper functions work correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  CONFIG_FILENAME,
  ENV,
  AGENT_FILENAME_PREFIX,
  MESSAGES,
  EXIT_CODE,
  getAgentFilename,
} from '@/constants.js';

describe('constants module', () => {
  describe('CONFIG_FILENAME', () => {
    it('should export the correct config filename', () => {
      expect(CONFIG_FILENAME).toBe('speci.config.json');
    });

    it('should be a string', () => {
      expect(typeof CONFIG_FILENAME).toBe('string');
    });
  });

  describe('ENV', () => {
    it('should export SPECI_DEBUG constant', () => {
      expect(ENV.SPECI_DEBUG).toBe('SPECI_DEBUG');
    });

    it('should export NO_COLOR constant', () => {
      expect(ENV.NO_COLOR).toBe('NO_COLOR');
    });

    it('should export FORCE_COLOR constant', () => {
      expect(ENV.FORCE_COLOR).toBe('FORCE_COLOR');
    });

    it('should be a const object with string literal types', () => {
      expect(typeof ENV.SPECI_DEBUG).toBe('string');
      expect(typeof ENV.NO_COLOR).toBe('string');
      expect(typeof ENV.FORCE_COLOR).toBe('string');
    });
  });

  describe('AGENT_FILENAME_PREFIX', () => {
    it('should export the correct prefix', () => {
      expect(AGENT_FILENAME_PREFIX).toBe('speci-');
    });

    it('should be a string', () => {
      expect(typeof AGENT_FILENAME_PREFIX).toBe('string');
    });
  });

  describe('getAgentFilename', () => {
    it('should prepend prefix to agent name', () => {
      expect(getAgentFilename('plan')).toBe('speci-plan');
    });

    it('should handle different agent names', () => {
      expect(getAgentFilename('impl')).toBe('speci-impl');
      expect(getAgentFilename('review')).toBe('speci-review');
      expect(getAgentFilename('fix')).toBe('speci-fix');
    });

    it('should handle empty string', () => {
      expect(getAgentFilename('')).toBe('speci-');
    });

    it('should handle agent names with hyphens', () => {
      expect(getAgentFilename('custom-agent')).toBe('speci-custom-agent');
    });
  });

  describe('MESSAGES', () => {
    it('should export RUN_INIT message', () => {
      expect(MESSAGES.RUN_INIT).toBe('Run speci init to create configuration');
    });

    it('should be a const object with string values', () => {
      expect(typeof MESSAGES.RUN_INIT).toBe('string');
    });
  });

  describe('EXIT_CODE', () => {
    it('should export SUCCESS code', () => {
      expect(EXIT_CODE.SUCCESS).toBe(0);
    });

    it('should export ERROR code', () => {
      expect(EXIT_CODE.ERROR).toBe(1);
    });

    it('should be a const object with number values', () => {
      expect(typeof EXIT_CODE.SUCCESS).toBe('number');
      expect(typeof EXIT_CODE.ERROR).toBe('number');
    });
  });
});
