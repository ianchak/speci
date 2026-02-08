/**
 * Integration Tests for Plan Command
 *
 * Tests the plan command end-to-end with real filesystem operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import {
  createTestProject,
  readTestFile,
  createMockProgress,
} from './setup.js';
import type { TestProject } from './setup.js';
import planCommand from '@/commands/plan.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import * as copilot from '@/copilot.js';

describe('Plan Command Integration', () => {
  let testProject: TestProject;

  beforeEach(async () => {
    testProject = await createTestProject();

    // Create PROGRESS.md
    await createMockProgress(testProject.progressPath, [
      { id: 'TASK_001', title: 'Test Task 1', status: 'NOT STARTED' },
    ]);
  });

  afterEach(async () => {
    await testProject.cleanup();
    vi.restoreAllMocks();
  });

  it('should invoke Copilot with planning agent', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      // Mock Copilot CLI
      const mockCopilot = vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });

      const context = createProductionContext();
      const result = await planCommand({ prompt: 'test-feature.md' }, context);

      expect(mockCopilot).toHaveBeenCalled();
      expect(result.success).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle missing source file', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const context = createProductionContext();
      const result = await planCommand({ prompt: 'nonexistent.md' }, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not found');
      }
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle Copilot invocation failure', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      // Create source file
      const fs = await import('node:fs/promises');
      const sourcePath = join(testProject.root, 'test-feature.md');
      await fs.writeFile(sourcePath, '# Test Feature\n\nDescription');

      // Mock Copilot failure
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: false,
        exitCode: 1,
        error: 'Copilot error',
      });

      const context = createProductionContext();
      const result = await planCommand({ prompt: 'test-feature.md' }, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should use custom agent path if specified', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      // Create custom agent file
      const fs = await import('node:fs/promises');
      const agentDir = join(testProject.root, 'custom-agents');
      await fs.mkdir(agentDir, { recursive: true });
      const agentPath = join(agentDir, 'plan.md');
      await fs.writeFile(agentPath, '# Custom Plan Agent\n\nInstructions...');

      // Update config with custom agent path
      const configContent = await readTestFile(testProject.configPath);
      const config = JSON.parse(configContent);
      config.agents.plan = 'custom-agents/plan.md';
      await fs.writeFile(
        testProject.configPath,
        JSON.stringify(config, null, 2)
      );

      // Create source file
      const sourcePath = join(testProject.root, 'test-feature.md');
      await fs.writeFile(sourcePath, '# Test Feature\n\nDescription');

      // Mock Copilot
      const mockCopilot = vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });

      const context = createProductionContext();
      await planCommand({ prompt: 'test-feature.md' }, context);

      // Verify custom agent was used
      expect(mockCopilot).toHaveBeenCalledWith(
        expect.objectContaining({
          agentPath: expect.stringContaining('custom-agents'),
        }),
        expect.any(Object)
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});
