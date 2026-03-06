import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductionContext } from '@/adapters/context-factory.js';
import { clean, cleanFiles } from '@/commands/clean.js';
import { createTestProject, fileExists } from './setup.js';
import type { TestProject } from './setup.js';
import type { SpeciConfig } from '@/types.js';

describe('Clean Integration', () => {
  let testProject: TestProject;

  beforeEach(async () => {
    testProject = await createTestProject();
  });

  afterEach(async () => {
    await testProject.cleanup();
    vi.restoreAllMocks();
  });

  it('cleanFiles() deletes tasks and progress files and returns success', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const context = createProductionContext();
      const config = await context.configLoader.load();
      const taskPath = join(testProject.tasksDir, 'TASK_001.md');
      await writeFile(taskPath, '# Task');
      await writeFile(testProject.progressPath, '# Progress');

      const result = cleanFiles(config, context);

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(fileExists(taskPath)).toBe(false);
      expect(fileExists(testProject.progressPath)).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('clean() with --yes deletes files end-to-end', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const context = createProductionContext();
      const config = await context.configLoader.load();
      const taskPath = join(testProject.tasksDir, 'TASK_001.md');
      await writeFile(taskPath, '# Task');
      await writeFile(testProject.progressPath, '# Progress');

      const result = await clean({ yes: true }, context, config);

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(fileExists(taskPath)).toBe(false);
      expect(fileExists(testProject.progressPath)).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('clean() returns failure when lock file is present', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const context = createProductionContext();
      const config = await context.configLoader.load();
      const lockPath = join(testProject.root, config.paths.lock);
      await writeFile(lockPath, String(process.pid));

      const result = await clean({ yes: true }, context, config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Cannot clean while speci is running');
      }
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('cleanFiles() returns failure for out-of-project configured path', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const context = createProductionContext();
      const config = await context.configLoader.load();
      const outsideConfig: SpeciConfig = {
        ...config,
        paths: {
          ...config.paths,
          tasks: '..\\..\\outside',
        },
      };
      await mkdir(join(testProject.root, 'docs', 'tasks'), { recursive: true });
      await writeFile(
        join(testProject.root, 'docs', 'tasks', 'TASK_001.md'),
        '#'
      );

      const result = cleanFiles(outsideConfig, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('outside the project root');
      }
    } finally {
      process.chdir(originalCwd);
    }
  });
});
