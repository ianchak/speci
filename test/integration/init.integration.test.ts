/**
 * Integration Tests for Init Command
 *
 * Tests the init command end-to-end with real filesystem operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { createTestProject, fileExists, readTestFile } from './setup.js';
import type { TestProject } from './setup.js';
import initCommand from '@/commands/init.js';
import { createProductionContext } from '@/adapters/context-factory.js';

describe('Init Command Integration', () => {
  let testProject: TestProject;

  beforeEach(async () => {
    testProject = await createTestProject();
  });

  afterEach(async () => {
    await testProject.cleanup();
  });

  it('should create config file, directories, and agent files', async () => {
    // Change to test project directory
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      // Remove the config file created by setup to test creation
      const fs = await import('node:fs/promises');
      await fs.rm(testProject.configPath, { force: true });

      const context = createProductionContext();
      const result = await initCommand({}, context);

      expect(result.success).toBe(true);
      expect(fileExists(testProject.configPath)).toBe(true);
      expect(fileExists(testProject.tasksDir)).toBe(true);
      expect(fileExists(testProject.logsDir)).toBe(true);

      // Verify config content
      const configContent = await readTestFile(testProject.configPath);
      const config = JSON.parse(configContent);
      expect(config.paths).toBeDefined();
      expect(config.agents).toBeDefined();
      expect(config.gate).toBeDefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should not overwrite existing config file', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      // Write custom config
      const fs = await import('node:fs/promises');
      const customConfig = { custom: 'value' };
      await fs.writeFile(
        testProject.configPath,
        JSON.stringify(customConfig, null, 2)
      );

      const context = createProductionContext();
      await initCommand({}, context);

      // Verify config wasn't overwritten
      const configContent = await readTestFile(testProject.configPath);
      const config = JSON.parse(configContent);
      expect(config.custom).toBe('value');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle verbose option', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const fs = await import('node:fs/promises');
      await fs.rm(testProject.configPath, { force: true });

      const context = createProductionContext();
      const result = await initCommand({ verbose: true }, context);

      expect(result.success).toBe(true);
      expect(fileExists(testProject.configPath)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should create .github/agents directory structure', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const fs = await import('node:fs/promises');
      await fs.rm(testProject.configPath, { force: true });

      const context = createProductionContext();
      await initCommand({}, context);

      const githubDir = join(testProject.root, '.github', 'agents');
      expect(fileExists(githubDir)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle directory creation errors gracefully', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const fs = await import('node:fs/promises');
      await fs.rm(testProject.configPath, { force: true });

      // Remove docs directory and create a file in its place
      await fs.rm(join(testProject.root, 'docs'), {
        recursive: true,
        force: true,
      });
      const badPath = join(testProject.root, 'docs');
      await fs.writeFile(badPath, 'blocking file');

      const context = createProductionContext();
      const result = await initCommand({}, context);

      // Should fail gracefully
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    } finally {
      process.chdir(originalCwd);
    }
  });
});
