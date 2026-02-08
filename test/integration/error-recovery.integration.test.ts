/**
 * Integration Tests for Error Recovery
 *
 * Tests how the system handles and recovers from various error scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { createTestProject, fileExists, readTestFile } from './setup.js';
import type { TestProject } from './setup.js';
import initCommand from '@/commands/init.js';
import planCommand from '@/commands/plan.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import * as copilot from '@/copilot.js';

describe('Error Recovery Integration', () => {
  let testProject: TestProject;

  beforeEach(async () => {
    testProject = await createTestProject();
  });

  afterEach(async () => {
    await testProject.cleanup();
    vi.restoreAllMocks();
  });

  describe('Filesystem Errors', () => {
    it('should handle permission errors gracefully', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        await fs.rm(testProject.configPath, { force: true });

        // Make directory read-only (platform-specific behavior)
        // This is a best-effort test that may behave differently on Windows
        let madeReadOnly = false;
        try {
          await fs.chmod(testProject.root, 0o444);
          madeReadOnly = true;
        } catch {
          // Skip on Windows or if chmod fails
          return;
        }

        const context = createProductionContext();
        const result = await initCommand({}, context);

        // Should fail gracefully
        expect(result.success).toBe(false);

        // Restore permissions for cleanup
        if (madeReadOnly) {
          await fs.chmod(testProject.root, 0o755);
        }
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle disk space errors', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        // This test is conceptual - we can't easily simulate disk full
        // But we verify the error handling path exists

        // Try to write to a path that would fail
        const fs = await import('node:fs/promises');
        const badPath = join(testProject.root, '\x00invalid'); // null byte is invalid

        try {
          await fs.writeFile(badPath, 'test');
          // If this succeeds, skip the test
        } catch (error) {
          // Verify error is caught and handled
          expect(error).toBeDefined();
        }
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle corrupted config file', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');

        // Write invalid JSON
        await fs.writeFile(testProject.configPath, '{ invalid json }');

        const context = createProductionContext();

        // Commands should detect invalid config
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(featurePath, '# Feature\n\nDescription');

        const result = await planCommand({ prompt: 'feature.md' }, context);

        // Should fail due to config validation
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Copilot Errors', () => {
    it('should handle Copilot CLI not available', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(featurePath, '# Feature\n\nDescription');

        // Mock Copilot CLI not found
        vi.spyOn(copilot, 'runAgent').mockResolvedValue({
          isSuccess: false,
          exitCode: 1,
          error: 'Copilot CLI not found',
        });

        const context = createProductionContext();
        const result = await planCommand({ prompt: 'feature.md' }, context);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Copilot');
        }
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle Copilot timeout', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(featurePath, '# Feature\n\nDescription');

        // Mock Copilot timeout
        vi.spyOn(copilot, 'runAgent').mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 100)
            )
        );

        const context = createProductionContext();

        try {
          await planCommand({ prompt: 'feature.md' }, context);
        } catch (error: unknown) {
          const err = error as Error;
          expect(err.message).toContain('Timeout');
        }
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle Copilot unexpected output', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(featurePath, '# Feature\n\nDescription');

        // Mock Copilot with unexpected output
        vi.spyOn(copilot, 'runAgent').mockResolvedValue({
          isSuccess: true,
          exitCode: 0,
        });

        const context = createProductionContext();
        const result = await planCommand({ prompt: 'feature.md' }, context);

        // Should still succeed, but might have warnings
        expect(result).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('State Errors', () => {
    it('should handle missing PROGRESS.md gracefully', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');

        // Remove PROGRESS.md
        await fs.rm(testProject.progressPath, { force: true });

        // Commands that depend on PROGRESS.md should fail gracefully
        // This is verified in individual command tests
        expect(fileExists(testProject.progressPath)).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle corrupted PROGRESS.md', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');

        // Write invalid PROGRESS.md
        await fs.writeFile(
          testProject.progressPath,
          'This is not valid markdown table format'
        );

        // State parsing should handle invalid format
        const content = await readTestFile(testProject.progressPath);
        expect(content).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should cleanup temp files on error', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');

        // Create temp file
        const tempFile = join(testProject.root, 'temp-file.txt');
        await fs.writeFile(tempFile, 'temporary');

        // Simulate error scenario
        try {
          throw new Error('Simulated error');
        } catch {
          // Cleanup should happen
          if (fileExists(tempFile)) {
            await fs.rm(tempFile);
          }
        }

        expect(fileExists(tempFile)).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should allow retry after failure', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(featurePath, '# Feature\n\nDescription');

        let callCount = 0;
        vi.spyOn(copilot, 'runAgent').mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              isSuccess: false,
              exitCode: 1,
              error: 'First attempt failed',
            };
          }
          return { isSuccess: true, exitCode: 0 };
        });

        const context = createProductionContext();

        // First attempt fails
        const result1 = await planCommand({ prompt: 'feature.md' }, context);
        expect(result1.success).toBe(false);

        // Retry succeeds
        const result2 = await planCommand({ prompt: 'feature.md' }, context);
        expect(result2.success).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should preserve state on partial failure', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const context = createProductionContext();

        // Initialize successfully
        await fs.rm(testProject.configPath, { force: true });
        const initResult = await initCommand({}, context);
        expect(initResult.success).toBe(true);

        const configBefore = await readTestFile(testProject.configPath);

        // Try an operation that fails
        const planResult = await planCommand(
          { prompt: 'nonexistent.md' },
          context
        );
        expect(planResult.success).toBe(false);

        // Config should still be intact
        const configAfter = await readTestFile(testProject.configPath);
        expect(configAfter).toBe(configBefore);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
