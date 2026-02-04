/**
 * Tests for Box Drawing Module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BOX_CHARS, ASCII_BOX_CHARS, drawBox, infoBox } from '../lib/ui/box.js';

describe('Box Drawing Constants', () => {
  it('should define BOX_CHARS with all required Unicode characters', () => {
    expect(BOX_CHARS).toBeDefined();
    expect(BOX_CHARS.topLeft).toBe('╔');
    expect(BOX_CHARS.topRight).toBe('╗');
    expect(BOX_CHARS.bottomLeft).toBe('╚');
    expect(BOX_CHARS.bottomRight).toBe('╝');
    expect(BOX_CHARS.horizontal).toBe('═');
    expect(BOX_CHARS.vertical).toBe('║');
    expect(BOX_CHARS.singleTopLeft).toBe('┌');
    expect(BOX_CHARS.singleTopRight).toBe('┐');
    expect(BOX_CHARS.singleBottomLeft).toBe('└');
    expect(BOX_CHARS.singleBottomRight).toBe('┘');
    expect(BOX_CHARS.singleHorizontal).toBe('─');
    expect(BOX_CHARS.singleVertical).toBe('│');
  });

  it('should define ASCII_BOX_CHARS with all required fallback characters', () => {
    expect(ASCII_BOX_CHARS).toBeDefined();
    expect(ASCII_BOX_CHARS.topLeft).toBe('+');
    expect(ASCII_BOX_CHARS.topRight).toBe('+');
    expect(ASCII_BOX_CHARS.bottomLeft).toBe('+');
    expect(ASCII_BOX_CHARS.bottomRight).toBe('+');
    expect(ASCII_BOX_CHARS.horizontal).toBe('-');
    expect(ASCII_BOX_CHARS.vertical).toBe('|');
    expect(ASCII_BOX_CHARS.singleTopLeft).toBe('+');
    expect(ASCII_BOX_CHARS.singleTopRight).toBe('+');
    expect(ASCII_BOX_CHARS.singleBottomLeft).toBe('+');
    expect(ASCII_BOX_CHARS.singleBottomRight).toBe('+');
    expect(ASCII_BOX_CHARS.singleHorizontal).toBe('-');
    expect(ASCII_BOX_CHARS.singleVertical).toBe('|');
  });
});

describe('drawBox', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should render single-line content correctly', () => {
    const result = drawBox('Hello World');
    expect(result).toContain('Hello World');
    expect(result.split('\n').length).toBeGreaterThan(2);
  });

  it('should render multi-line content correctly', () => {
    const content = ['Line 1', 'Line 2', 'Line 3'];
    const result = drawBox(content);
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
  });

  it('should render multi-line string content correctly', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const result = drawBox(content);
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
  });

  it('should include title when provided', () => {
    const result = drawBox('Content', { title: 'Test Title' });
    expect(result).toContain('Test Title');
  });

  it('should apply padding correctly with default padding', () => {
    const result = drawBox('Content');
    const lines = result.split('\n');
    // Should have: top border, padding, content, padding, bottom border
    expect(lines.length).toBeGreaterThan(4);
  });

  it('should apply padding correctly with custom padding', () => {
    const result = drawBox('Content', { padding: 2 });
    const lines = result.split('\n');
    // Should have: top border, 2 padding, content, 2 padding, bottom border
    expect(lines.length).toBeGreaterThan(6);
  });

  it('should apply zero padding correctly', () => {
    const result = drawBox('Content', { padding: 0 });
    const lines = result.split('\n');
    // Should have exactly: top border, content, bottom border
    expect(lines.length).toBe(3);
  });

  it('should use ASCII fallback when Unicode not supported', () => {
    process.env.SPECI_ASCII = '1';
    const result = drawBox('Test');
    expect(result).toContain('+');
    expect(result).toContain('-');
    expect(result).toContain('|');
    expect(result).not.toContain('╔');
    expect(result).not.toContain('═');
  });

  it('should handle empty content', () => {
    const result = drawBox('');
    expect(result).toBeDefined();
    expect(result.split('\n').length).toBeGreaterThan(0);
  });

  it('should handle single character content', () => {
    const result = drawBox('X');
    expect(result).toContain('X');
  });

  it('should respect width option', () => {
    const result = drawBox('Short', { width: 80 });
    expect(result).toBeDefined();
  });

  it('should handle content wider than width', () => {
    const longContent = 'A'.repeat(100);
    const result = drawBox(longContent, { width: 20 });
    expect(result).toBeDefined();
  });
});

describe('infoBox', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should format key-value pairs correctly', () => {
    const data = {
      Name: 'Test Project',
      Version: '1.0.0',
      Status: 'Active',
    };
    const result = infoBox('Project Info', data);
    expect(result).toContain('Project Info');
    expect(result).toContain('Name: Test Project');
    expect(result).toContain('Version: 1.0.0');
    expect(result).toContain('Status: Active');
  });

  it('should format array of lines correctly', () => {
    const lines = ['First line', 'Second line', 'Third line'];
    const result = infoBox('Information', lines);
    expect(result).toContain('Information');
    expect(result).toContain('First line');
    expect(result).toContain('Second line');
    expect(result).toContain('Third line');
  });

  it('should handle empty object', () => {
    const result = infoBox('Empty', {});
    expect(result).toContain('Empty');
  });

  it('should handle empty array', () => {
    const result = infoBox('Empty', []);
    expect(result).toContain('Empty');
  });

  it('should handle single key-value pair', () => {
    const result = infoBox('Single', { Key: 'Value' });
    expect(result).toContain('Key: Value');
  });
});
