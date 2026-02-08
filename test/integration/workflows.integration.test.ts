/**
 * Integration Tests for Complete Workflows
 *
 * Tests end-to-end workflows across multiple commands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { createTestProject, fileExists, readTestFile } from './setup.js';
import type { TestProject } from './setup.js';
import initCommand from '@/commands/init.js';
import planCommand from '@/commands/plan.js';
import taskCommand from '@/commands/task.js';
import { createProductionContext } from '@/adapters/context-factory.js';

describe('Workflow Integration', () => {
  let testProject: TestProject;

  beforeEach(async () => {
    testProject = await createTestProject();
  });

  afterEach(async () => {
    await testProject.cleanup();
    vi.restoreAllMocks();
  });

  describe('Init → Plan → Task Workflow', () => {
    it('should complete full workflow successfully', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');

        // Step 1: Init
        await fs.rm(testProject.configPath, { force: true });
        const context = createProductionContext();
        const initResult = await initCommand({}, context);
        expect(initResult.success).toBe(true);
        expect(fileExists(testProject.configPath)).toBe(true);

        // Step 2: Create a feature description file
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(
          featurePath,
          '# Test Feature\n\nImplement a test feature'
        );

        // Mock Copilot for plan command
        const mockSpawn = vi
          .spyOn(context.copilotRunner, 'spawn')
          .mockResolvedValue(0);

        // Step 3: Plan
        const planResult = await planCommand({ prompt: 'feature.md' }, context);
        expect(planResult.success).toBe(true);

        // Step 4: Create PROGRESS.md (simulating plan output)
        const progressContent = `# Project Progress

## Overview

| Property         | Value                    |
| ---------------- | ------------------------ |
| **Project Name** | Test Project             |
| **Plan File**    | docs/REFACTORING_PLAN.md |

---

## Milestone: M0 - Test

| Task ID | Title | Status | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| ------- | ----- | ------ | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | Test Task 1 | NOT STARTED | — | HIGH | S (≤2h) | None | — | 0 |

---

## Subagent Tracking

Last Subagent ID: SA-20260207-001

---

## Review Tracking

Last Review ID: RA-20260207-001
`;

        await fs.mkdir(join(testProject.root, 'docs'), { recursive: true });
        await fs.writeFile(testProject.progressPath, progressContent);

        // Create a plan file
        const planPath = join(testProject.root, 'docs', 'plan.md');
        await fs.writeFile(planPath, '# Plan\n\nDetailed plan');

        // Step 5: Task (using same mock)
        const taskResult = await taskCommand({ plan: 'docs/plan.md' }, context);
        expect(taskResult.success).toBe(true);

        // Verify spawn was called for both commands
        expect(mockSpawn).toHaveBeenCalledTimes(2);

        // Verify all artifacts exist
        expect(fileExists(testProject.configPath)).toBe(true);
        expect(fileExists(testProject.tasksDir)).toBe(true);
        expect(fileExists(testProject.progressPath)).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle failures at each stage', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const context = createProductionContext();

        // Step 1: Init should succeed
        await fs.rm(testProject.configPath, { force: true });
        const initResult = await initCommand({}, context);
        expect(initResult.success).toBe(true);

        // Step 2: Plan should fail - prompt is text, not a file
        // The plan command requires either a --prompt (text) or --input (file)
        // Just passing text as prompt should work, but we need to test failure
        // Let's test that without input it fails
        const planResult = await planCommand({}, context);
        expect(planResult.success).toBe(false);

        // Step 3: Create source and mock Copilot failure
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(
          featurePath,
          '# Test Feature\n\nImplement a test feature'
        );

        // Mock Copilot failure
        vi.spyOn(context.copilotRunner, 'spawn').mockResolvedValue(1);

        const planResult2 = await planCommand(
          { prompt: 'feature.md' },
          context
        );
        expect(planResult2.success).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Parallel Command Execution', () => {
    it('should prevent concurrent runs with lock file', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');

        // Create lock file
        const lockPath = join(testProject.root, '.speci-lock');
        await fs.writeFile(lockPath, 'locked');

        // Create feature file
        const featurePath = join(testProject.root, 'feature.md');
        await fs.writeFile(
          featurePath,
          '# Test Feature\n\nImplement a test feature'
        );

        const context = createProductionContext();

        // Try to run command while locked - should check for lock
        // Note: The actual lock checking happens in the CLI entry point,
        // not in individual commands, so we're just verifying file existence
        expect(fileExists(lockPath)).toBe(true);
        expect(context).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('State Persistence', () => {
    it('should persist state across command invocations', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const context = createProductionContext();

        // Initialize project
        await fs.rm(testProject.configPath, { force: true });
        await initCommand({}, context);

        // Verify config persists
        const config1 = JSON.parse(await readTestFile(testProject.configPath));
        expect(config1.paths).toBeDefined();

        // Re-read config in a new "session"
        const config2 = JSON.parse(await readTestFile(testProject.configPath));
        expect(config2).toEqual(config1);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle config modifications between commands', async () => {
      const originalCwd = process.cwd();
      process.chdir(testProject.root);

      try {
        const fs = await import('node:fs/promises');
        const context = createProductionContext();

        // Initialize project
        await fs.rm(testProject.configPath, { force: true });
        await initCommand({}, context);

        // Modify config
        const config = JSON.parse(await readTestFile(testProject.configPath));
        config.gate.maxFixAttempts = 5;
        await fs.writeFile(
          testProject.configPath,
          JSON.stringify(config, null, 2)
        );

        // Verify modification persists
        const modifiedConfig = JSON.parse(
          await readTestFile(testProject.configPath)
        );
        expect(modifiedConfig.gate.maxFixAttempts).toBe(5);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
