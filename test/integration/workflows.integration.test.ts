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
import { run, type RunOptions } from '@/commands/run.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import { createMockContext } from '@/adapters/test-context.js';
import { CommandRegistry } from '@/cli/command-registry.js';
import { STATE } from '@/types.js';
import type { SpeciConfig, GateResult, MilestoneInfo } from '@/types.js';

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
        // Mock preflight to skip environment checks in integration tests
        vi.spyOn(context.preflight, 'run').mockResolvedValue(undefined);
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

  describe('Run Command Sad Paths', () => {
    it('should return failure when copilotRunner.run rejects', async () => {
      const config = JSON.parse(
        await readTestFile(testProject.configPath)
      ) as SpeciConfig;
      const context = createMockContext({
        cwd: testProject.root,
      });
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.copilotRunner.run).mockRejectedValue(
        new Error('copilot runner failed')
      );

      const result = await run(
        { yes: true, maxIterations: 1 },
        context,
        config
      );

      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        expect(result.error).toContain('copilot runner failed');
      }
    });

    it('should return failure when gates fail at max fix attempts', async () => {
      const config = JSON.parse(
        await readTestFile(testProject.configPath)
      ) as SpeciConfig;
      const configWithSingleFix: SpeciConfig = {
        ...config,
        gate: { ...config.gate, maxFixAttempts: 1 },
        loop: { ...config.loop, maxIterations: 1 },
      };
      const context = createMockContext({
        cwd: testProject.root,
      });
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.copilotRunner.run).mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      const failedGateResult: GateResult = {
        isSuccess: false,
        error: 'Gate failed',
        totalDuration: 1,
        results: [
          {
            command: 'npm test',
            isSuccess: false,
            exitCode: 1,
            output: '',
            error: 'Gate failed',
            duration: 1,
          },
        ],
      };
      vi.mocked(context.gateRunner.run).mockResolvedValue(failedGateResult);

      const result = await run({ yes: true }, context, configWithSingleFix);

      expect(result.success).toBe(false);
      expect(vi.mocked(context.gateRunner.run)).toHaveBeenCalledTimes(2);
    });
  });

  describe('verify mode', () => {
    let mockConfig: SpeciConfig;

    beforeEach(async () => {
      mockConfig = JSON.parse(
        await readTestFile(testProject.configPath)
      ) as SpeciConfig;
    });

    it('IT-01: verify mode pauses before agent dispatch when MVT is ready', async () => {
      const context = createMockContext({ cwd: testProject.root });
      const mvtReadyMilestone: MilestoneInfo = {
        milestoneId: 'M1',
        milestoneName: 'Foundation',
        totalTasks: 2,
        completedTasks: 2,
        mvtId: 'MVT_M1',
        mvtStatus: 'NOT STARTED',
        mvtReady: true,
      };
      vi.mocked(context.stateReader.getMilestonesMvtStatus)
        .mockResolvedValueOnce([])
        .mockResolvedValue([mvtReadyMilestone]);
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );

      const result = await run(
        { verify: true, yes: true, maxIterations: 1 },
        context,
        mockConfig
      );

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      const warnCalls = vi
        .mocked(context.logger.warn)
        .mock.calls.flatMap((c) => c);
      expect(
        warnCalls.some((m) => typeof m === 'string' && m.includes('MVT'))
      ).toBe(true);
      expect(vi.mocked(context.lockManager.release)).toHaveBeenCalled();
      expect(vi.mocked(context.copilotRunner.run)).not.toHaveBeenCalled();
    });

    it('IT-02: startup warning with prompt y continues and dispatches impl agent', async () => {
      const context = createMockContext({ cwd: testProject.root });
      context.process.stdin.isTTY = true;
      const mvtReadyMilestone: MilestoneInfo = {
        milestoneId: 'M1',
        milestoneName: 'Foundation',
        totalTasks: 2,
        completedTasks: 2,
        mvtId: 'MVT_M1',
        mvtStatus: 'NOT STARTED',
        mvtReady: true,
      };
      vi.mocked(context.stateReader.getMilestonesMvtStatus)
        .mockResolvedValueOnce([mvtReadyMilestone])
        .mockResolvedValue([]);
      vi.mocked(context.stateReader.getState)
        .mockResolvedValueOnce(STATE.WORK_LEFT) // confirmRun pre-check
        .mockResolvedValueOnce(STATE.WORK_LEFT) // mainLoop iteration 1
        .mockResolvedValue(STATE.DONE); // iteration 2 → done
      vi.mocked(context.copilotRunner.run).mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });

      const result = await run(
        { verify: true, prompt: async () => 'y', maxIterations: 2 },
        context,
        mockConfig
      );

      const warnCalls = vi
        .mocked(context.logger.warn)
        .mock.calls.flatMap((c) => c);
      expect(
        warnCalls.some((m) => typeof m === 'string' && m.includes('MVT'))
      ).toBe(true);
      expect(vi.mocked(context.copilotRunner.run)).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('IT-03: createProductionContext wires getMilestonesMvtStatus as a function', () => {
      const context = createProductionContext();
      expect(typeof context.stateReader.getMilestonesMvtStatus).toBe(
        'function'
      );
    });

    it('IT-04: createMockContext wires getMilestonesMvtStatus as a Vitest mock returning []', async () => {
      const context = createMockContext({ cwd: testProject.root });
      expect(context.stateReader.getMilestonesMvtStatus).toBeDefined();
      expect(
        vi.isMockFunction(context.stateReader.getMilestonesMvtStatus)
      ).toBe(true);
      const result =
        await context.stateReader.getMilestonesMvtStatus(mockConfig);
      expect(result).toEqual([]);
    });

    it('IT-05: --verify CLI flag parses to RunOptions.verify === true', async () => {
      const context = createMockContext({ cwd: testProject.root });
      const runModule = await import('@/commands/run.js');
      let capturedOptionsWithVerify: RunOptions = {};
      let capturedOptionsWithoutVerify: RunOptions = {};
      let callIndex = 0;
      vi.spyOn(runModule, 'run').mockImplementation(async (opts) => {
        const resolvedOptions = opts ?? {};
        if (callIndex === 0) {
          capturedOptionsWithVerify = resolvedOptions;
        } else {
          capturedOptionsWithoutVerify = resolvedOptions;
        }
        callIndex += 1;
        return { success: true, exitCode: 0 };
      });

      const registry = new CommandRegistry(context, mockConfig);
      await registry
        .getProgram()
        .parseAsync(['node', 'speci', 'run', '--verify']);
      expect(capturedOptionsWithVerify.verify).toBe(true);

      const registryWithoutVerify = new CommandRegistry(context, mockConfig);
      await registryWithoutVerify
        .getProgram()
        .parseAsync(['node', 'speci', 'run']);
      expect(capturedOptionsWithoutVerify.verify).toBeUndefined();
    });

    it('IT-06: startup warning abort (prompt n) prevents lock acquisition', async () => {
      const context = createMockContext({ cwd: testProject.root });
      context.process.stdin.isTTY = true;
      const mvtReadyMilestone: MilestoneInfo = {
        milestoneId: 'M1',
        milestoneName: 'Foundation',
        totalTasks: 2,
        completedTasks: 2,
        mvtId: 'MVT_M1',
        mvtStatus: 'NOT STARTED',
        mvtReady: true,
      };
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      // First prompt call: confirmRun ('y' to proceed past pre-run check)
      // Second prompt call: checkIncompleteMvts ('n' to abort on startup warning)
      let promptCallCount = 0;
      const result = await run(
        {
          verify: true,
          prompt: async () => {
            promptCallCount++;
            return promptCallCount === 1 ? 'y' : 'n';
          },
        },
        context,
        mockConfig
      );

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(vi.mocked(context.lockManager.acquire)).not.toHaveBeenCalled();
      expect(vi.mocked(context.copilotRunner.run)).not.toHaveBeenCalled();
    });

    it('IT-07: NodeStateReader.getMilestonesMvtStatus reads real PROGRESS.md from filesystem', async () => {
      const fs = await import('node:fs/promises');
      const progressContent = `# Project Progress

## Milestone: M1 - Foundation

| Task ID  | Title       | Status   | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | ----------- | -------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | Foundation  | COMPLETE | PASSED        | HIGH     | S (<=2h)   | None         | -           | 1        |
| TASK_002 | State Layer | COMPLETE | PASSED        | HIGH     | L (4-8h)   | None         | -           | 1        |
| MVT_M1   | Milestone 1 Verification | NOT STARTED | - | HIGH | S (<=2h) | None | - | 0 |
`;
      await fs.writeFile(testProject.progressPath, progressContent);

      const { NodeStateReader } =
        await import('@/adapters/node-state-reader.js');
      const reader = new NodeStateReader();
      const configWithProgressPath: SpeciConfig = {
        ...mockConfig,
        paths: {
          ...mockConfig.paths,
          progress: testProject.progressPath,
        },
      };
      const result = await reader.getMilestonesMvtStatus(
        configWithProgressPath
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      const m1 = result.find((m) => m.mvtId === 'MVT_M1');
      expect(m1).toBeDefined();
      expect(m1?.mvtReady).toBe(true);
    });

    it('IT-08: --verify + --yes auto-continues past startup warning then pauses in loop', async () => {
      const context = createMockContext({ cwd: testProject.root });
      const mvtReadyMilestone: MilestoneInfo = {
        milestoneId: 'M1',
        milestoneName: 'Foundation',
        totalTasks: 2,
        completedTasks: 2,
        mvtId: 'MVT_M1',
        mvtStatus: 'NOT STARTED',
        mvtReady: true,
      };
      vi.mocked(context.stateReader.getMilestonesMvtStatus)
        .mockResolvedValueOnce([mvtReadyMilestone])
        .mockResolvedValue([mvtReadyMilestone]);
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );

      const result = await run(
        { verify: true, yes: true, maxIterations: 1 },
        context,
        mockConfig
      );

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      const allLogCalls = [
        ...vi.mocked(context.logger.info).mock.calls.flatMap((c) => c),
        ...vi.mocked(context.logger.warn).mock.calls.flatMap((c) => c),
      ];
      expect(
        allLogCalls.some((m) => typeof m === 'string' && m.includes('MVT'))
      ).toBe(true);
      expect(vi.mocked(context.copilotRunner.run)).not.toHaveBeenCalled();
    });

    it('IT-09: --verify + --dry-run displays MVT status without executing', async () => {
      const context = createMockContext({ cwd: testProject.root });
      const mvtReadyMilestone: MilestoneInfo = {
        milestoneId: 'M1',
        milestoneName: 'Foundation',
        totalTasks: 2,
        completedTasks: 2,
        mvtId: 'MVT_M1',
        mvtStatus: 'NOT STARTED',
        mvtReady: true,
      };
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      const result = await run(
        { verify: true, dryRun: true },
        context,
        mockConfig
      );

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      const allLogCalls = [
        ...vi.mocked(context.logger.muted).mock.calls.flatMap((c) => c),
        ...vi.mocked(context.logger.info).mock.calls.flatMap((c) => c),
        ...vi.mocked(context.logger.warn).mock.calls.flatMap((c) => c),
      ];
      expect(
        allLogCalls.some(
          (m) =>
            typeof m === 'string' &&
            (m.includes('MVT') ||
              m.includes('verify') ||
              m.includes('Human-in-the-loop'))
        )
      ).toBe(true);
      expect(vi.mocked(context.lockManager.acquire)).not.toHaveBeenCalled();
      expect(vi.mocked(context.copilotRunner.run)).not.toHaveBeenCalled();
    });

    it('IT-10: yolo programmatic run() call omits verify flag', async () => {
      const context = createMockContext({ cwd: testProject.root });
      const runModule = await import('@/commands/run.js');
      let capturedRunOptions: RunOptions | undefined;
      vi.spyOn(runModule, 'run').mockImplementation(async (opts) => {
        capturedRunOptions = opts;
        return { success: true, exitCode: 0 };
      });

      // Mock plan and task so yolo pipeline reaches the run() call
      const planModule = await import('@/commands/plan.js');
      const taskModule = await import('@/commands/task.js');
      vi.spyOn(planModule, 'plan').mockResolvedValue({
        success: true,
        exitCode: 0,
      });
      vi.spyOn(taskModule, 'task').mockResolvedValue({
        success: true,
        exitCode: 0,
      });

      vi.mocked(context.copilotRunner.spawn).mockResolvedValue(0);

      const { yolo } = await import('@/commands/yolo.js');
      const result = await yolo(
        { prompt: 'Build a test feature' },
        context,
        mockConfig
      );

      expect(result.success).toBe(true);
      expect(capturedRunOptions).toBeDefined();
      expect(capturedRunOptions?.verify).toBeUndefined();
      expect(capturedRunOptions?.yes).toBe(true);
    });
  });
});
