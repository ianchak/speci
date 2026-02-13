import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  PathValidator,
  ConfigValidator,
  InputValidator,
} from '@/validation/index.js';
import type { SpeciConfig } from '@/types.js';
import type { IFileSystem } from '@/interfaces.js';

describe('Validation Module Integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(process.cwd(), '.test-validation-integration');
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('module exports', () => {
    it('should export all validators', () => {
      expect(PathValidator).toBeDefined();
      expect(ConfigValidator).toBeDefined();
      expect(InputValidator).toBeDefined();
    });

    it('should export types', () => {
      // Type check - if this compiles, types are exported
      const result: import('@/validation/types.js').ValidationResult<string> = {
        success: true,
        value: 'test',
      };
      expect(result.success).toBe(true);
    });
  });

  describe('error message consistency', () => {
    it('should have consistent error format across validators', () => {
      // PathValidator error
      const pathResult = new PathValidator('nonexistent.txt')
        .exists()
        .validate();

      // ConfigValidator error
      const badConfig = { version: '2.0.0' };
      const configResult = new ConfigValidator(badConfig)
        .validateVersion()
        .validate();

      // Both should have error.message and error.suggestions
      expect(pathResult.success).toBe(false);
      expect(configResult.success).toBe(false);

      if (!pathResult.success && !configResult.success) {
        expect(pathResult.error.message).toBeDefined();
        expect(configResult.error.message).toBeDefined();

        expect(pathResult.error.suggestions).toBeDefined();
        expect(configResult.error.suggestions).toBeDefined();
      }
    });

    it('should provide actionable suggestions', () => {
      const pathResult = new PathValidator('missing.txt').exists().validate();

      expect(pathResult.success).toBe(false);
      if (!pathResult.success) {
        const suggestions = pathResult.error.suggestions || [];
        expect(suggestions.length).toBeGreaterThan(0);
        // Suggestions should be helpful, not just generic
        expect(suggestions.some((s) => s.length > 10)).toBe(true);
      }
    });
  });

  describe('real-world scenarios', () => {
    it('should validate plan command input', () => {
      const inputFile = join(testDir, 'design.md');
      writeFileSync(inputFile, '# Design Doc');

      // Mock filesystem
      const mockFs: IFileSystem = {
        existsSync: (path: string) => path === inputFile,
      } as IFileSystem;

      // Validate input like plan command does
      const result = new InputValidator(mockFs)
        .requireInput([inputFile], undefined)
        .validateFiles([inputFile])
        .validate();

      expect(result.success).toBe(true);
    });

    it('should validate config file structure', () => {
      const validConfig: SpeciConfig = {
        version: '1.0.0',
        paths: {
          progress: 'docs/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: 'logs',
          lock: '.speci-lock',
        },
        gate: {
          commands: ['npm test'],
          maxFixAttempts: 3,
          strategy: 'sequential',
        },
        loop: {
          maxIterations: 10,
        },
        copilot: {
          permissions: 'allow-all',
          models: {
            plan: 'claude-opus-4.6',
            task: 'claude-sonnet-4.5',
            refactor: 'claude-sonnet-4.5',
            impl: 'gpt-5.3-codex',
            review: 'claude-sonnet-4.5',
            fix: 'claude-sonnet-4.5',
            tidy: 'gpt-5.2',
          },
          extraFlags: [],
        },
      };

      const result = new ConfigValidator(validConfig).validate();

      expect(result.success).toBe(true);
    });
  });

  describe('validator composition', () => {
    it('should compose multiple validators for complex validation', () => {
      const inputFile = join(testDir, 'input.md');
      writeFileSync(inputFile, 'input content');

      const config: SpeciConfig = {
        version: '1.0.0',
        paths: {
          progress: 'docs/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: 'logs',
          lock: '.speci-lock',
        },
        gate: {
          maxFixAttempts: 3,
          commands: [],
          strategy: 'sequential',
        },
        loop: {
          maxIterations: 10,
        },
        copilot: {
          permissions: 'allow-all',
          models: {
            plan: 'claude-opus-4.6',
            task: 'claude-sonnet-4.5',
            refactor: 'claude-sonnet-4.5',
            impl: 'gpt-5.3-codex',
            review: 'claude-sonnet-4.5',
            fix: 'claude-sonnet-4.5',
            tidy: 'gpt-5.2',
          },
          extraFlags: [],
        },
      };

      // Validate config
      const configResult = new ConfigValidator(config).validate();
      expect(configResult.success).toBe(true);

      // Validate input file
      const pathResult = new PathValidator(inputFile).exists().validate();
      expect(pathResult.success).toBe(true);
    });
  });
});
