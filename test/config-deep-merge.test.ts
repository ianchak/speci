import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadConfig,
  resetConfigCache,
  type SpeciConfig,
} from '../lib/config.js';

/**
 * Tests for type-safe deep merge functionality in lib/config.ts (TASK_032)
 *
 * These tests verify that the deep merge logic works correctly without
 * unsafe type assertions, maintaining type safety throughout.
 *
 * Testing Strategy:
 * Since deepMerge, isPlainObject, and setNestedValue are internal functions,
 * we test them through the public API (loadConfig) which exercises all the
 * deep merge functionality.
 */

describe('Deep Merge Type Safety (TASK_032)', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();
    originalEnv = { ...process.env };

    // Reset cache before each test
    resetConfigCache();

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    process.env = originalEnv;

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Deep merge preserves nested object structure', () => {
    it('should merge nested paths config without losing other paths', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          paths: {
            progress: 'custom-progress.md',
          },
        })
      );

      const config = loadConfig();

      // Custom path should be merged
      expect(config.paths.progress).toBe('custom-progress.md');

      // Default paths should still be present
      expect(config.paths.tasks).toBe('docs/tasks');
      expect(config.paths.logs).toBe('.speci-logs');
      expect(config.paths.lock).toBe('.speci-lock');
    });

    it('should merge nested agents config without losing other agents', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          agents: {
            impl: 'custom/impl.md',
          },
        })
      );

      const config = loadConfig();

      // Custom agent should be set
      expect(config.agents.impl).toBe('custom/impl.md');

      // Other agents should remain null (default)
      expect(config.agents.plan).toBeNull();
      expect(config.agents.task).toBeNull();
      expect(config.agents.review).toBeNull();
    });

    it('should merge nested copilot.models without losing copilot.permissions', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          copilot: {
            permissions: 'strict',
            models: {
              impl: 'claude-opus-4.6',
            },
          },
        })
      );

      const config = loadConfig();

      // Copilot settings should be merged
      expect(config.copilot.permissions).toBe('strict');
      expect(config.copilot.models.impl).toBe('claude-opus-4.6');

      // Other model settings should remain null
      expect(config.copilot.models.plan).toBeNull();
      expect(config.copilot.models.task).toBeNull();
    });
  });

  describe('Deep merge handles null and undefined correctly', () => {
    it('should preserve null values in config', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          agents: {
            impl: null,
          },
          copilot: {
            model: null,
          },
        })
      );

      const config = loadConfig();

      // Null values should be preserved
      expect(config.agents.impl).toBeNull();
      expect(config.copilot.model).toBeNull();
    });

    it('should not merge undefined values from partial config', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          paths: {
            progress: 'custom.md',
          },
        })
      );

      const config = loadConfig();

      // Defined value should be set
      expect(config.paths.progress).toBe('custom.md');

      // Undefined keys in partial config should use defaults
      expect(config.paths.tasks).toBe('docs/tasks');
    });
  });

  describe('Deep merge does not mutate source objects', () => {
    it('should not mutate default config when merging user config', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          paths: {
            progress: 'modified.md',
          },
        })
      );

      const config1 = loadConfig();
      expect(config1.paths.progress).toBe('modified.md');

      // Reset and load again with different config
      resetConfigCache();
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          paths: {
            progress: 'different.md',
          },
        })
      );

      const config2 = loadConfig();
      expect(config2.paths.progress).toBe('different.md');

      // Previous config should still have its value (immutability)
      expect(config1.paths.progress).toBe('modified.md');
    });
  });

  describe('Environment overrides with setNestedValue', () => {
    it('should apply environment override to nested path correctly', () => {
      process.env.SPECI_PROGRESS_PATH = 'env-progress.md';

      const config = loadConfig();

      expect(config.paths.progress).toBe('env-progress.md');
      expect(config.paths.tasks).toBe('docs/tasks'); // Other paths unchanged
    });

    it('should create intermediate objects for nested env overrides', () => {
      process.env.SPECI_MAX_ITERATIONS = '50';

      const config = loadConfig();

      expect(config.loop.maxIterations).toBe(50);
    });

    it('should apply multiple env overrides correctly', () => {
      process.env.SPECI_PROGRESS_PATH = 'env-progress.md';
      process.env.SPECI_TASKS_PATH = 'env-tasks';
      process.env.SPECI_MAX_ITERATIONS = '200';

      const config = loadConfig();

      expect(config.paths.progress).toBe('env-progress.md');
      expect(config.paths.tasks).toBe('env-tasks');
      expect(config.loop.maxIterations).toBe(200);
    });
  });

  describe('Array values are not deep merged (shallow replace)', () => {
    it('should replace gate commands array, not merge it', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          gate: {
            commands: ['npm run lint'],
          },
        })
      );

      const config = loadConfig();

      // Array should be completely replaced, not merged
      expect(config.gate.commands).toEqual(['npm run lint']);
      expect(config.gate.commands).not.toContain('npm run typecheck');
      expect(config.gate.commands).not.toContain('npm test');
    });

    it('should replace extraFlags array, not merge it', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          copilot: {
            extraFlags: ['--flag1', '--flag2'],
          },
        })
      );

      const config = loadConfig();

      expect(config.copilot.extraFlags).toEqual(['--flag1', '--flag2']);
    });
  });

  describe('Type safety and compile-time guarantees', () => {
    it('should maintain SpeciConfig type through merge operations', () => {
      const config: SpeciConfig = loadConfig();

      // TypeScript should know these properties exist without casts
      expect(config.version).toBeDefined();
      expect(config.paths.progress).toBeDefined();
      expect(config.agents.impl).toBeDefined();
      expect(config.copilot.permissions).toBeDefined();
      expect(config.gate.commands).toBeDefined();
      expect(config.loop.maxIterations).toBeDefined();
    });

    it('should return frozen config object (immutability)', () => {
      const config = loadConfig();

      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.paths)).toBe(true);
      expect(Object.isFrozen(config.agents)).toBe(true);
      expect(Object.isFrozen(config.copilot)).toBe(true);
    });
  });

  describe('Regression tests - all existing config behavior works', () => {
    it('should still merge complex nested structures correctly', () => {
      writeFileSync(
        'speci.config.json',
        JSON.stringify({
          version: '1.0.0',
          paths: {
            progress: 'custom/progress.md',
            tasks: 'custom/tasks',
          },
          agents: {
            impl: 'custom/impl.md',
            review: 'custom/review.md',
          },
          copilot: {
            permissions: 'yolo',
            model: 'gpt-5',
            models: {
              impl: 'claude-opus-4.6',
              review: 'claude-sonnet-4.5',
            },
          },
          gate: {
            commands: ['npm run format', 'npm run lint'],
            maxFixAttempts: 3,
          },
          loop: {
            maxIterations: 50,
          },
        })
      );

      const config = loadConfig();

      // All custom values should be set
      expect(config.version).toBe('1.0.0');
      expect(config.paths.progress).toBe('custom/progress.md');
      expect(config.paths.tasks).toBe('custom/tasks');
      expect(config.agents.impl).toBe('custom/impl.md');
      expect(config.agents.review).toBe('custom/review.md');
      expect(config.copilot.permissions).toBe('yolo');
      expect(config.copilot.model).toBe('gpt-5');
      expect(config.copilot.models.impl).toBe('claude-opus-4.6');
      expect(config.copilot.models.review).toBe('claude-sonnet-4.5');
      expect(config.gate.commands).toEqual(['npm run format', 'npm run lint']);
      expect(config.gate.maxFixAttempts).toBe(3);
      expect(config.loop.maxIterations).toBe(50);

      // Default values should fill in gaps
      expect(config.paths.logs).toBe('.speci-logs');
      expect(config.paths.lock).toBe('.speci-lock');
      expect(config.agents.plan).toBeNull();
      expect(config.copilot.models.plan).toBeNull();
    });
  });
});
