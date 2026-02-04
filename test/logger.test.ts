/**
 * Tests for Logger Module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { log, logSection } from '../lib/utils/logger.js';

describe('Logger', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NO_COLOR = '1';
    delete process.env.SPECI_DEBUG;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('log.info', () => {
    it('should output message with bullet glyph', () => {
      log.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Test message');
    });

    it('should include bullet glyph in output', () => {
      log.info('Test');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      // Should contain bullet glyph or ASCII equivalent
      expect(output).toMatch(/[•*]/);
    });
  });

  describe('log.error', () => {
    it('should output message with error glyph', () => {
      log.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('Error message');
    });

    it('should include error glyph in output', () => {
      log.error('Test error');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const output = consoleErrorSpy.mock.calls[0][0];
      // Should contain error glyph or ASCII equivalent
      expect(output).toMatch(/[✗X]/);
    });

    it('should use stderr for errors', () => {
      log.error('Error');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('log.warn', () => {
    it('should output message with warning glyph', () => {
      log.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain('Warning message');
    });

    it('should include warning glyph in output', () => {
      log.warn('Test warning');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const output = consoleWarnSpy.mock.calls[0][0];
      // Should contain warning glyph or ASCII equivalent
      expect(output).toContain('!');
    });

    it('should use stderr for warnings', () => {
      log.warn('Warning');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('log.success', () => {
    it('should output message with success glyph', () => {
      log.success('Success message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Success message');
    });

    it('should include success glyph in output', () => {
      log.success('Test success');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      // Should contain success glyph or ASCII equivalent
      expect(output).toMatch(/[✓OK]/);
    });
  });

  describe('log.debug', () => {
    it('should output nothing when SPECI_DEBUG not set', () => {
      delete process.env.SPECI_DEBUG;
      log.debug('Debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should output with timestamp when SPECI_DEBUG=1', () => {
      process.env.SPECI_DEBUG = '1';
      log.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('DEBUG');
      expect(output).toContain('Debug message');
      // Should contain timestamp in format HH:MM:SS
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    });

    it('should output with timestamp when SPECI_DEBUG=true', () => {
      process.env.SPECI_DEBUG = 'true';
      log.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('DEBUG');
    });

    it('should not output when SPECI_DEBUG=0', () => {
      process.env.SPECI_DEBUG = '0';
      log.debug('Debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not output when SPECI_DEBUG=false', () => {
      process.env.SPECI_DEBUG = 'false';
      log.debug('Debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('NO_COLOR support', () => {
    it('should respect NO_COLOR for info messages', () => {
      process.env.NO_COLOR = '1';
      log.info('Plain message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      // Should not contain ANSI escape codes
      // eslint-disable-next-line no-control-regex
      expect(output).not.toMatch(/\x1b\[/);
    });

    it('should respect NO_COLOR for error messages', () => {
      process.env.NO_COLOR = '1';
      log.error('Plain error');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const output = consoleErrorSpy.mock.calls[0][0];
      // eslint-disable-next-line no-control-regex
      expect(output).not.toMatch(/\x1b\[/);
    });

    it('should respect NO_COLOR for warning messages', () => {
      process.env.NO_COLOR = '1';
      log.warn('Plain warning');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const output = consoleWarnSpy.mock.calls[0][0];
      // eslint-disable-next-line no-control-regex
      expect(output).not.toMatch(/\x1b\[/);
    });

    it('should respect NO_COLOR for success messages', () => {
      process.env.NO_COLOR = '1';
      log.success('Plain success');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      // eslint-disable-next-line no-control-regex
      expect(output).not.toMatch(/\x1b\[/);
    });

    it('should respect NO_COLOR for debug messages', () => {
      process.env.NO_COLOR = '1';
      process.env.SPECI_DEBUG = '1';
      log.debug('Plain debug');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];
      // eslint-disable-next-line no-control-regex
      expect(output).not.toMatch(/\x1b\[/);
    });
  });
});

describe('logSection', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NO_COLOR = '1';
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should render decorated section header with title only', () => {
    logSection('Section Title');
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('Section Title');
  });

  it('should include subtitle when provided', () => {
    logSection('Section Title', 'Subtitle text');
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('Section Title');
    expect(output).toContain('Subtitle text');
  });

  it('should render box structure', () => {
    logSection('Test');
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];
    // Should contain box drawing characters or ASCII equivalents
    expect(output).toMatch(/[+╔┌]/);
  });

  it('should handle empty title', () => {
    logSection('');
    expect(consoleLogSpy).toHaveBeenCalledOnce();
  });

  it('should handle long title', () => {
    const longTitle = 'A'.repeat(100);
    logSection(longTitle);
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('A');
  });

  it('should handle long subtitle', () => {
    const longSubtitle = 'B'.repeat(100);
    logSection('Title', longSubtitle);
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('B');
  });
});
