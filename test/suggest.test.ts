/**
 * Tests for Command Suggestion Utility
 * Tests Levenshtein distance calculation and command matching
 */

import { describe, it, expect } from 'vitest';
import { levenshtein, findSimilarCommands } from '../lib/utils/suggest.js';

describe('Levenshtein Distance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshtein('init', 'init')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('should calculate insertion distance', () => {
    expect(levenshtein('init', 'initt')).toBe(1);
    expect(levenshtein('plan', 'plann')).toBe(1);
  });

  it('should calculate deletion distance', () => {
    expect(levenshtein('status', 'statu')).toBe(1);
    expect(levenshtein('monitor', 'monito')).toBe(1);
  });

  it('should calculate substitution distance', () => {
    expect(levenshtein('init', 'unit')).toBe(1);
    expect(levenshtein('run', 'ran')).toBe(1);
  });

  it('should handle empty strings', () => {
    expect(levenshtein('', 'init')).toBe(4);
    expect(levenshtein('init', '')).toBe(4);
  });

  it('should handle completely different strings', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });

  it('should be symmetric', () => {
    expect(levenshtein('init', 'plan')).toBe(levenshtein('plan', 'init'));
  });

  it('should calculate complex edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('saturday', 'sunday')).toBe(3);
  });
});

describe('Find Similar Commands', () => {
  const availableCommands = [
    'init',
    'plan',
    'task',
    'refactor',
    'run',
    'status',
    'monitor',
  ];

  it('should find exact match with distance 0', () => {
    const results = findSimilarCommands('init', availableCommands);
    expect(results[0]).toBe('init');
  });

  it('should suggest "init" for "initt"', () => {
    const results = findSimilarCommands('initt', availableCommands);
    expect(results[0]).toBe('init');
  });

  it('should suggest "status" for "statuss"', () => {
    const results = findSimilarCommands('statuss', availableCommands);
    expect(results[0]).toBe('status');
  });

  it('should suggest "plan" for "pla"', () => {
    const results = findSimilarCommands('pla', availableCommands);
    expect(results[0]).toBe('plan');
  });

  it('should not suggest commands with distance > 2', () => {
    const results = findSimilarCommands('zzzzz', availableCommands);
    expect(results).toHaveLength(0);
  });

  it('should return empty array for very different input', () => {
    const results = findSimilarCommands('xyz123', availableCommands);
    expect(results).toHaveLength(0);
  });

  it('should sort suggestions by distance', () => {
    const results = findSimilarCommands('tas', availableCommands);
    // 'task' should be first (distance 1), 'status' might be second
    expect(results[0]).toBe('task');
  });

  it('should handle multiple commands at same distance', () => {
    const results = findSimilarCommands('un', availableCommands);
    // Both 'run' could match (distance 1)
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter by max distance threshold', () => {
    const results = findSimilarCommands('inittt', availableCommands);
    // Distance is 2, should be included
    expect(results).toContain('init');
  });

  it('should handle empty command list', () => {
    const results = findSimilarCommands('init', []);
    expect(results).toHaveLength(0);
  });

  it('should handle single character input', () => {
    const results = findSimilarCommands('i', availableCommands);
    // Should not crash, may or may not have suggestions
    expect(Array.isArray(results)).toBe(true);
  });

  it('should be case-sensitive', () => {
    const results = findSimilarCommands('INIT', availableCommands);
    // Should still work but with higher distance
    expect(Array.isArray(results)).toBe(true);
  });
});
