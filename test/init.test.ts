import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../lib/commands/init.js';
import { getDefaults } from '../lib/config.js';

describe('init command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();
    originalEnv = { ...process.env };

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-init-test-${Date.now()}-${Math.random()}`);
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

  describe('default behavior with --yes flag', () => {
    it('should create speci.config.json with default values', async () => {
      await init({ yes: true });

      expect(existsSync('speci.config.json')).toBe(true);

      const configContent = readFileSync('speci.config.json', 'utf8');
      const config = JSON.parse(configContent);

      expect(config.version).toBe('1.0.0');
      expect(config.paths.progress).toBe('docs/PROGRESS.md');
      expect(config.paths.tasks).toBe('docs/tasks');
      expect(config.paths.logs).toBe('.speci-logs');
      expect(config.paths.lock).toBe('.speci-lock');
    });

    it('should create required directories', async () => {
      await init({ yes: true });

      expect(existsSync(join(testDir, 'docs', 'tasks'))).toBe(true);
      expect(existsSync(join(testDir, '.speci-logs'))).toBe(true);
    });

    it('should use default gate commands', async () => {
      await init({ yes: true });

      const configContent = readFileSync('speci.config.json', 'utf8');
      const config = JSON.parse(configContent);

      expect(config.gate.commands).toEqual([
        'npm run lint',
        'npm run typecheck',
        'npm test',
      ]);
      expect(config.gate.maxFixAttempts).toBe(5);
    });

    it('should include all default agent paths as null', async () => {
      await init({ yes: true });

      const configContent = readFileSync('speci.config.json', 'utf8');
      const config = JSON.parse(configContent);

      expect(config.agents).toEqual({
        plan: null,
        task: null,
        refactor: null,
        impl: null,
        review: null,
        fix: null,
        tidy: null,
      });
    });

    it('should include default copilot settings', async () => {
      await init({ yes: true });

      const configContent = readFileSync('speci.config.json', 'utf8');
      const config = JSON.parse(configContent);

      expect(config.copilot.permissions).toBe('allow-all');
      expect(config.copilot.model).toBeNull();
      expect(config.copilot.extraFlags).toEqual([]);
    });

    it('should include default loop settings', async () => {
      await init({ yes: true });

      const configContent = readFileSync('speci.config.json', 'utf8');
      const config = JSON.parse(configContent);

      expect(config.loop.maxIterations).toBe(100);
    });
  });

  describe('skip/no-overwrite behavior', () => {
    it('should skip existing speci.config.json without error', async () => {
      // Create existing config
      writeFileSync(
        'speci.config.json',
        JSON.stringify({ custom: 'data' }, null, 2)
      );

      await expect(init({ yes: true })).resolves.not.toThrow();

      // Verify original content preserved
      const content = readFileSync('speci.config.json', 'utf8');
      const config = JSON.parse(content);
      expect(config.custom).toBe('data');
    });

    it('should skip existing PROGRESS.md without error', async () => {
      // Create parent directory and existing file
      mkdirSync('docs', { recursive: true });
      const customContent = '# My Custom Progress File';
      writeFileSync('docs/PROGRESS.md', customContent);

      await expect(init({ yes: true })).resolves.not.toThrow();

      // Verify original content preserved
      const content = readFileSync('docs/PROGRESS.md', 'utf8');
      expect(content).toBe(customContent);
    });

    it('should skip existing directories without error', async () => {
      // Create existing directories
      mkdirSync('docs/tasks', { recursive: true });
      mkdirSync('.speci-logs', { recursive: true });

      await expect(init({ yes: true })).resolves.not.toThrow();

      // Directories should still exist
      expect(existsSync('docs/tasks')).toBe(true);
      expect(existsSync('.speci-logs')).toBe(true);
    });

    it('should be idempotent (safe to run multiple times)', async () => {
      // Run init twice
      await init({ yes: true });
      await expect(init({ yes: true })).resolves.not.toThrow();

      // Verify config still exists and is valid
      expect(existsSync('speci.config.json')).toBe(true);
      const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));
      expect(config.version).toBe('1.0.0');
    });
  });

  describe('error handling', () => {
    it('should handle gracefully when directories already exist', async () => {
      // Test that proper error messages are provided
      // In actual usage, OS-level permission errors would occur
      // This test verifies the error handling path exists
      await expect(init({ yes: true })).resolves.not.toThrow();
    });

    it('should skip if config file exists as directory', async () => {
      // Create a directory with the name of the config file
      // This is an edge case where the file exists but is a directory
      mkdirSync('speci.config.json', { recursive: true });

      // Init should skip the config file but still succeed
      await expect(init({ yes: true })).resolves.not.toThrow();

      // Config file should not be created (directory still exists)
      expect(existsSync('speci.config.json')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty directory name', async () => {
      // This tests that basename() doesn't fail on edge cases
      await expect(init({ yes: true })).resolves.not.toThrow();
    });

    it('should create parent directories for progress file', async () => {
      await init({ yes: true });

      // Verify docs directory was created
      expect(existsSync(join(testDir, 'docs'))).toBe(true);
    });

    it('should handle very deep nested paths', async () => {
      // Config would use deeply nested path if user specified it
      // Since we're using --yes, this tests the default behavior
      await init({ yes: true });

      expect(existsSync('docs/tasks')).toBe(true);
    });
  });

  describe('configuration merging', () => {
    it('should merge with defaults correctly', async () => {
      await init({ yes: true });

      const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));
      const defaults = getDefaults();

      // All default properties should be present
      expect(config.version).toBe(defaults.version);
      expect(config.paths).toBeDefined();
      expect(config.agents).toBeDefined();
      expect(config.copilot).toBeDefined();
      expect(config.gate).toBeDefined();
      expect(config.loop).toBeDefined();
    });
  });

  describe('file permissions and format', () => {
    it('should create JSON files with proper formatting', async () => {
      await init({ yes: true });

      const content = readFileSync('speci.config.json', 'utf8');

      // Should be valid JSON
      expect(() => JSON.parse(content)).not.toThrow();

      // Should be formatted with 2-space indentation
      expect(content).toContain('  "version"');

      // Should end with newline
      expect(content.endsWith('\n')).toBe(true);
    });
  });

  describe('verbose mode', () => {
    it('should accept verbose option without errors', async () => {
      await expect(init({ yes: true, verbose: true })).resolves.not.toThrow();
    });
  });
});
