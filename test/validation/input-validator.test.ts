import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { InputValidator } from '@/validation/input-validator.js';
import type { IFileSystem } from '@/interfaces.js';

// Mock filesystem for testing
class MockFileSystem implements IFileSystem {
  private files = new Set<string>();

  addFile(path: string): void {
    this.files.add(path);
  }

  existsSync(path: string): boolean {
    return this.files.has(path);
  }

  readFileSync(): string {
    return '';
  }

  writeFileSync(): void {}

  mkdirSync(): void {}

  readdirSync(): string[] {
    return [];
  }

  statSync(): { isDirectory: () => boolean; isFile: () => boolean } {
    return { isDirectory: () => false, isFile: () => false };
  }

  rmSync(): void {}

  accessSync(): void {}

  unlinkSync(): void {}

  copyFileSync(): void {}

  readFile(): Promise<string> {
    return Promise.resolve('');
  }

  writeFile(): Promise<void> {
    return Promise.resolve();
  }
}

describe('InputValidator', () => {
  let testDir: string;
  let mockFs: MockFileSystem;

  beforeEach(() => {
    testDir = join(process.cwd(), '.test-validation-input');
    mkdirSync(testDir, { recursive: true });
    mockFs = new MockFileSystem();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('requireInput()', () => {
    it('should succeed with input files', () => {
      const result = new InputValidator(mockFs)
        .requireInput(['file1.md', 'file2.md'], undefined)
        .validate();

      expect(result.success).toBe(true);
    });

    it('should succeed with prompt', () => {
      const result = new InputValidator(mockFs)
        .requireInput(undefined, 'Some prompt text')
        .validate();

      expect(result.success).toBe(true);
    });

    it('should succeed with both files and prompt', () => {
      const result = new InputValidator(mockFs)
        .requireInput(['file.md'], 'Prompt text')
        .validate();

      expect(result.success).toBe(true);
    });

    it('should fail without files or prompt', () => {
      const result = new InputValidator(mockFs)
        .requireInput(undefined, undefined)
        .validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('input');
        expect(result.error.message).toContain('Missing required input');
        expect(result.error.suggestions).toContain(
          'Provide input files: --input file1.md file2.md'
        );
      }
    });

    it('should fail with empty files array and no prompt', () => {
      const result = new InputValidator(mockFs)
        .requireInput([], undefined)
        .validate();

      expect(result.success).toBe(false);
    });

    it('should fail with empty prompt and no files', () => {
      const result = new InputValidator(mockFs)
        .requireInput(undefined, '')
        .validate();

      expect(result.success).toBe(false);
    });

    it('should fail with whitespace-only prompt and no files', () => {
      const result = new InputValidator(mockFs)
        .requireInput(undefined, '   ')
        .validate();

      expect(result.success).toBe(false);
    });
  });

  describe('validateFiles()', () => {
    it('should succeed for existing files', () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      mockFs.addFile(file1);
      mockFs.addFile(file2);

      const result = new InputValidator(mockFs)
        .validateFiles([file1, file2])
        .validate();

      expect(result.success).toBe(true);
    });

    it('should fail for non-existing file', () => {
      const result = new InputValidator(mockFs)
        .validateFiles(['nonexistent.md'])
        .validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('input');
        expect(result.error.message).toContain('Input file not found');
        expect(result.error.message).toContain('nonexistent.md');
      }
    });

    it('should succeed with empty files array', () => {
      const result = new InputValidator(mockFs).validateFiles([]).validate();

      expect(result.success).toBe(true);
    });

    it('should provide helpful error with resolved path', () => {
      const result = new InputValidator(mockFs)
        .validateFiles(['missing.md'])
        .validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.suggestions?.some((s) => s.includes('Resolved path'))
        ).toBe(true);
      }
    });
  });

  describe('combined validation', () => {
    it('should chain requireInput and validateFiles', () => {
      const file = join(testDir, 'test.md');
      mockFs.addFile(file);

      const result = new InputValidator(mockFs)
        .requireInput([file], undefined)
        .validateFiles([file])
        .validate();

      expect(result.success).toBe(true);
    });

    it('should return first error from chain', () => {
      // Missing input requirement
      const result = new InputValidator(mockFs)
        .requireInput(undefined, undefined)
        .validateFiles(['some-file.md'])
        .validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should get "missing input" error first
        expect(result.error.message).toContain('Missing required input');
      }
    });

    it('should validate file existence after input requirement', () => {
      const result = new InputValidator(mockFs)
        .requireInput(['missing.md'], undefined)
        .validateFiles(['missing.md'])
        .validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should get file not found error
        expect(result.error.message).toContain('not found');
      }
    });
  });
});
