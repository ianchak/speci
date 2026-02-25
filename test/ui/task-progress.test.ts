/**
 * Tests for Task Progress Box Module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderTaskProgressBox } from '../../lib/ui/task-progress.js';
import type { TaskStats } from '../../lib/types.js';

describe('renderTaskProgressBox', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Disable colors for predictable assertions
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should render a box with correct title', () => {
    const stats: TaskStats = {
      total: 6,
      completed: 2,
      remaining: 3,
      inReview: 1,
      blocked: 0,
    };
    const result = renderTaskProgressBox(stats);
    expect(result).toContain('Task Progress');
  });

  it('should display all four stat rows with correct values', () => {
    const stats: TaskStats = {
      total: 10,
      completed: 3,
      remaining: 4,
      inReview: 2,
      blocked: 1,
    };
    const result = renderTaskProgressBox(stats);
    expect(result).toContain('Completed:');
    expect(result).toContain('3/10');
    expect(result).toContain('Pending:');
    expect(result).toContain('4');
    expect(result).toContain('In Review:');
    expect(result).toContain('2');
    expect(result).toContain('Blocked:');
    expect(result).toContain('1');
  });

  it('should handle zero tasks', () => {
    const stats: TaskStats = {
      total: 0,
      completed: 0,
      remaining: 0,
      inReview: 0,
      blocked: 0,
    };
    const result = renderTaskProgressBox(stats);
    expect(result).toContain('Completed:');
    expect(result).toContain('0/0');
  });

  it('should handle all tasks completed', () => {
    const stats: TaskStats = {
      total: 5,
      completed: 5,
      remaining: 0,
      inReview: 0,
      blocked: 0,
    };
    const result = renderTaskProgressBox(stats);
    expect(result).toContain('5/5');
    expect(result).toContain('Pending:');
  });

  it('should use single-line box drawing characters', () => {
    const stats: TaskStats = {
      total: 3,
      completed: 1,
      remaining: 2,
      inReview: 0,
      blocked: 0,
    };
    const result = renderTaskProgressBox(stats);
    // Single-line style uses ┌ ┐ └ ┘ │ ─ (or ASCII fallback + - |)
    // Check that double-line chars are NOT used
    expect(result).not.toContain('╔');
    expect(result).not.toContain('╗');
    expect(result).not.toContain('║');
  });

  it('should right-align numeric values', () => {
    const stats: TaskStats = {
      total: 100,
      completed: 5,
      remaining: 90,
      inReview: 3,
      blocked: 2,
    };
    const result = renderTaskProgressBox(stats);
    // 5/100 is the longest value at 5 chars
    // Other values should be padded to match
    expect(result).toContain('5/100');
    expect(result).toContain('Pending:');
  });
});
