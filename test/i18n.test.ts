import { describe, it, expect } from 'vitest';
import { formatDate, ensureUtf8, formatElapsed } from '../lib/utils/i18n.js';

describe('i18n utilities', () => {
  describe('formatDate', () => {
    it('should format date with default options', () => {
      const date = new Date('2026-02-04T14:30:00Z');
      const result = formatDate(date);
      // Should include date and time components
      expect(result).toMatch(/4/);
      expect(result).toMatch(/2026/);
      expect(result).toMatch(/:/); // Time separator
      expect(result).toBeTruthy();
    });

    it('should format date without time component', () => {
      const date = new Date('2026-02-04T14:30:00Z');
      const result = formatDate(date, { includeTime: false });
      // Should include date but no time
      expect(result).toMatch(/4/);
      expect(result).toMatch(/2026/);
      expect(result).not.toMatch(/:/); // No time separator
    });

    it('should format date with custom locale', () => {
      const date = new Date('2026-02-04T14:30:00Z');
      const result = formatDate(date, { locale: 'en-US' });
      // Should successfully format (exact output varies by locale)
      expect(result).toBeTruthy();
      expect(result).not.toBe('Invalid Date');
    });

    it('should return "Invalid Date" for invalid date', () => {
      const invalidDate = new Date('invalid');
      const result = formatDate(invalidDate);
      expect(result).toBe('Invalid Date');
    });

    it('should fallback to ISO format on Intl error', () => {
      const date = new Date('2026-02-04T14:30:00Z');
      // Force error by passing invalid timezone
      const result = formatDate(date, { timeZone: 'Invalid/Timezone' });
      // Should fallback to ISO format
      expect(result).toMatch(/2026/);
      expect(result).toMatch(/T/);
    });

    it('should handle DST transitions correctly', () => {
      // DST transition dates (US: March 9, 2026 and November 1, 2026)
      const springForward = new Date('2026-03-09T02:30:00-05:00');
      const fallBack = new Date('2026-11-01T02:30:00-04:00');

      const result1 = formatDate(springForward);
      const result2 = formatDate(fallBack);

      // Should format without crashing
      expect(result1).toBeTruthy();
      expect(result2).toBeTruthy();
      expect(result1).not.toBe('Invalid Date');
      expect(result2).not.toBe('Invalid Date');
    });
  });

  describe('ensureUtf8', () => {
    it('should pass through valid string', () => {
      const input = 'Hello, World!';
      const result = ensureUtf8(input);
      expect(result).toBe(input);
    });

    it('should decode valid Buffer', () => {
      const input = Buffer.from('Hello, World!', 'utf8');
      const result = ensureUtf8(input);
      expect(result).toBe('Hello, World!');
    });

    it('should replace invalid UTF-8 sequences with replacement character', () => {
      // Create buffer with invalid UTF-8 sequence
      const invalidUtf8 = Buffer.from([
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xc3, 0x28,
      ]);
      const result = ensureUtf8(invalidUtf8);

      // Should contain replacement character U+FFFD
      expect(result).toContain('Hello');
      expect(result).toContain('\uFFFD');
    });

    it('should handle lone surrogates in strings', () => {
      // High surrogate without low surrogate
      const loneSurrogate = 'Hello\uD800World';
      const result = ensureUtf8(loneSurrogate);

      // Should replace lone surrogate with replacement character
      expect(result).toContain('Hello');
      expect(result).toContain('\uFFFD');
      expect(result).toContain('World');
    });

    it('should handle empty string', () => {
      const result = ensureUtf8('');
      expect(result).toBe('');
    });

    it('should handle empty Buffer', () => {
      const result = ensureUtf8(Buffer.from([]));
      expect(result).toBe('');
    });

    it('should handle unicode characters correctly', () => {
      const input = '你好 🌍 مرحبا';
      const result = ensureUtf8(input);
      expect(result).toBe(input);
    });
  });

  describe('formatElapsed', () => {
    it('should format elapsed time as HH:MM:SS', () => {
      const startTime = new Date(Date.now() - 3661000); // 1 hour, 1 minute, 1 second ago
      const result = formatElapsed(startTime);
      expect(result).toMatch(/01:01:01/);
    });

    it('should pad single digits with zeros', () => {
      const startTime = new Date(Date.now() - 5000); // 5 seconds ago
      const result = formatElapsed(startTime);
      expect(result).toMatch(/00:00:0[5-9]/); // Allow for test execution time
    });

    it('should handle hours exceeding 24', () => {
      const startTime = new Date(Date.now() - 90061000); // 25 hours, 1 minute, 1 second
      const result = formatElapsed(startTime);
      expect(result).toMatch(/25:01:01/);
    });

    it('should handle zero elapsed time', () => {
      const startTime = new Date();
      const result = formatElapsed(startTime);
      expect(result).toMatch(/00:00:00/);
    });
  });
});
