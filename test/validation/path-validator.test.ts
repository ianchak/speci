import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PathValidator } from '@/validation/path-validator.js';

describe('PathValidator', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(process.cwd(), '.test-validation-path');
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('exists()', () => {
    it('should succeed for existing file', () => {
      const filePath = join(testDir, 'exists.txt');
      writeFileSync(filePath, 'content');

      const result = new PathValidator(filePath).exists().validate();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(filePath);
      }
    });

    it('should fail for non-existing file', () => {
      const filePath = join(testDir, 'not-exists.txt');

      const result = new PathValidator(filePath).exists().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('path');
        expect(result.error.message).toContain('Path not found');
        expect(result.error.message).toContain(filePath);
        expect(result.error.suggestions).toContain('Check the path spelling');
      }
    });

    it('should succeed for existing directory', () => {
      const result = new PathValidator(testDir).exists().validate();

      expect(result.success).toBe(true);
    });
  });

  describe('isReadable()', () => {
    it('should succeed for readable file', () => {
      const filePath = join(testDir, 'readable.txt');
      writeFileSync(filePath, 'content');

      const result = new PathValidator(filePath).isReadable().validate();

      expect(result.success).toBe(true);
    });

    it('should fail for non-readable file', () => {
      // Skip on Windows (chmod doesn't work the same way)
      if (process.platform === 'win32') {
        return;
      }

      const filePath = join(testDir, 'unreadable.txt');
      writeFileSync(filePath, 'content');
      chmodSync(filePath, 0o000); // Remove all permissions

      const result = new PathValidator(filePath).isReadable().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not readable');
        expect(result.error.suggestions).toContain('Check file permissions');
      }

      // Restore permissions for cleanup
      chmodSync(filePath, 0o644);
    });

    it('should fail for non-existing file', () => {
      const filePath = join(testDir, 'not-exists.txt');

      const result = new PathValidator(filePath).isReadable().validate();

      expect(result.success).toBe(false);
    });
  });

  describe('isWritable()', () => {
    it('should succeed for writable file', () => {
      const filePath = join(testDir, 'writable.txt');
      writeFileSync(filePath, 'content');

      const result = new PathValidator(filePath).isWritable().validate();

      expect(result.success).toBe(true);
    });

    it('should fail for non-writable file', () => {
      // Skip on Windows (chmod doesn't work the same way)
      if (process.platform === 'win32') {
        return;
      }

      const filePath = join(testDir, 'readonly.txt');
      writeFileSync(filePath, 'content');
      chmodSync(filePath, 0o444); // Read-only

      const result = new PathValidator(filePath).isWritable().validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not writable');
      }

      // Restore permissions for cleanup
      chmodSync(filePath, 0o644);
    });
  });

  describe('isWithinProject()', () => {
    it('should succeed for path within project', () => {
      const filePath = join(testDir, 'file.txt');
      writeFileSync(filePath, 'content');

      const result = new PathValidator(filePath)
        .isWithinProject(testDir)
        .validate();

      expect(result.success).toBe(true);
    });

    it('should fail for path outside project', () => {
      const outsidePath = join(testDir, '..', 'outside.txt');

      const result = new PathValidator(outsidePath)
        .isWithinProject(testDir)
        .validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('must be within project');
        expect(result.error.suggestions).toBeDefined();
      }
    });

    it('should handle relative paths', () => {
      const relativePath = 'file.txt';
      const absolutePath = resolve(testDir, relativePath);

      const result = new PathValidator(relativePath)
        .isWithinProject(testDir)
        .validate();

      // Relative path resolves correctly when resolved from testDir
      expect(result.success).toBe(true);
    });
  });

  describe('builder pattern', () => {
    it('should chain multiple validations', () => {
      const filePath = join(testDir, 'chain.txt');
      writeFileSync(filePath, 'content');

      const result = new PathValidator(filePath)
        .exists()
        .isReadable()
        .isWithinProject(testDir)
        .validate();

      expect(result.success).toBe(true);
    });

    it('should return first error in chain', () => {
      const filePath = join(testDir, 'not-exists.txt');

      const result = new PathValidator(filePath)
        .exists()
        .isReadable()
        .validate();

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should get "not found" error, not "not readable"
        expect(result.error.message).toContain('not found');
      }
    });

    it('should allow validations in any order', () => {
      const filePath = join(testDir, 'order.txt');
      writeFileSync(filePath, 'content');

      const result1 = new PathValidator(filePath)
        .exists()
        .isReadable()
        .validate();

      const result2 = new PathValidator(filePath)
        .isReadable()
        .exists()
        .validate();

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty path', () => {
      const result = new PathValidator('').exists().validate();

      expect(result.success).toBe(false);
    });

    it('should handle path with spaces', () => {
      const filePath = join(testDir, 'file with spaces.txt');
      writeFileSync(filePath, 'content');

      const result = new PathValidator(filePath).exists().validate();

      expect(result.success).toBe(true);
    });

    it('should handle path with special characters', () => {
      const filePath = join(testDir, 'file-name_123.txt');
      writeFileSync(filePath, 'content');

      const result = new PathValidator(filePath).exists().validate();

      expect(result.success).toBe(true);
    });
  });
});
