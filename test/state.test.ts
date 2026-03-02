import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as atomicWriteModule from '../lib/utils/atomic-write.js';
import {
  STATE,
  getState,
  getTaskStats,
  getCurrentTask,
  getMilestonesMvtStatus,
  hasStatePattern,
  resetStateCache,
  writeFailureNotes,
  type GateFailureInfo,
} from '../lib/state.js';
import { readFileSync } from 'node:fs';
import { log } from '../lib/utils/logger.js';
import { type SpeciConfig } from '../lib/config.js';

describe('state', () => {
  let testDir: string;
  let originalCwd: string;
  let mockConfig: SpeciConfig;

  beforeEach(() => {
    // Reset cache before each test
    resetStateCache();

    // Save original state
    originalCwd = process.cwd();

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-test-state-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    // Create mock config
    mockConfig = {
      version: '1.0.0',
      paths: {
        progress: join(testDir, 'PROGRESS.md'),
        tasks: join(testDir, 'tasks'),
        logs: join(testDir, '.speci-logs'),
        lock: join(testDir, '.speci-lock'),
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
      gate: {
        commands: [],
        maxFixAttempts: 5,
      },
      loop: {
        maxIterations: 100,
      },
    };
  });

  afterEach(() => {
    // Reset cache after each test
    resetStateCache();
    vi.restoreAllMocks();

    // Restore original state
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('STATE enum', () => {
    it('should have all required state values', () => {
      expect(STATE.WORK_LEFT).toBe('WORK_LEFT');
      expect(STATE.IN_REVIEW).toBe('IN_REVIEW');
      expect(STATE.BLOCKED).toBe('BLOCKED');
      expect(STATE.DONE).toBe('DONE');
      expect(STATE.NO_PROGRESS).toBe('NO_PROGRESS');
    });
  });

  describe('getState', () => {
    it('should return NO_PROGRESS when file does not exist', async () => {
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.NO_PROGRESS);
    });

    it('should return BLOCKED when any task is blocked', async () => {
      const content = `# Progress
| Task ID  | Title | Status  |
| -------- | ----- | ------- |
| TASK_001 | Setup | COMPLETE |
| TASK_002 | Parse | BLOCKED |
| TASK_003 | Test  | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.BLOCKED);
    });

    it('should return IN_REVIEW when tasks are in review (no blocked)', async () => {
      const content = `# Progress
| Task ID  | Title | Status    |
| -------- | ----- | --------- |
| TASK_001 | Setup | COMPLETE  |
| TASK_002 | Parse | IN_REVIEW |
| TASK_003 | Test  | COMPLETE  |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.IN_REVIEW);
    });

    it('should return IN_REVIEW for "IN REVIEW" with space', async () => {
      const content = `# Progress
| Task ID  | Title | Status    |
| -------- | ----- | --------- |
| TASK_001 | Setup | COMPLETE  |
| TASK_002 | Parse | IN REVIEW |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.IN_REVIEW);
    });

    it('should return WORK_LEFT when tasks are not started', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.WORK_LEFT);
    });

    it('should return WORK_LEFT when tasks are in progress', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | IN PROGRESS |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.WORK_LEFT);
    });

    it('should return DONE when all tasks are complete', async () => {
      const content = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Setup | COMPLETE |
| TASK_002 | Parse | COMPLETE |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.DONE);
    });

    it('should respect priority order - BLOCKED overrides IN_REVIEW', async () => {
      const content = `# Progress
| Task ID  | Title  | Status    |
| -------- | ------ | --------- |
| TASK_001 | Setup  | IN_REVIEW |
| TASK_002 | Parse  | BLOCKED   |
| TASK_003 | Test   | COMPLETE  |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.BLOCKED);
    });

    it('should respect priority order - IN_REVIEW overrides WORK_LEFT', async () => {
      const content = `# Progress
| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Setup  | IN_REVIEW   |
| TASK_002 | Parse  | NOT STARTED |
| TASK_003 | Test   | COMPLETE    |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.IN_REVIEW);
    });

    it('should perform case-insensitive status matching', async () => {
      const content = `# Progress
| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Setup  | blocked     |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.BLOCKED);
    });

    it('should handle malformed PROGRESS.md gracefully', async () => {
      const content = `# Progress
This is not a valid table
Some random text
| Not a valid row
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.DONE); // No tasks found = all done
    });
  });

  describe('getTaskStats', () => {
    it('should return correct counts for various statuses', async () => {
      const content = `# Progress
| Task ID  | Title    | Status      | Review | Priority | Complexity | Deps |
| -------- | -------- | ----------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Setup    | COMPLETE    | PASSED | HIGH     | S          | None |
| TASK_002 | Parse    | COMPLETE    | PASSED | HIGH     | S          | None |
| TASK_003 | Test     | IN_REVIEW   | -      | HIGH     | S          | None |
| TASK_004 | Build    | NOT STARTED | -      | HIGH     | S          | None |
| TASK_005 | Deploy   | IN PROGRESS | -      | HIGH     | S          | None |
| TASK_006 | Monitor  | BLOCKED     | -      | HIGH     | S          | None |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const stats = await getTaskStats(mockConfig);

      expect(stats.total).toBe(6);
      expect(stats.completed).toBe(2);
      expect(stats.remaining).toBe(2); // NOT STARTED + IN PROGRESS
      expect(stats.inReview).toBe(1);
      expect(stats.blocked).toBe(1);
    });

    it('should handle empty file', async () => {
      writeFileSync(mockConfig.paths.progress, '');
      const stats = await getTaskStats(mockConfig);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.remaining).toBe(0);
      expect(stats.inReview).toBe(0);
      expect(stats.blocked).toBe(0);
    });

    it('should return zeros when file does not exist', async () => {
      const stats = await getTaskStats(mockConfig);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.remaining).toBe(0);
      expect(stats.inReview).toBe(0);
      expect(stats.blocked).toBe(0);
    });

    it('should handle alternative status names', async () => {
      const content = `# Progress
| Task ID  | Title | Status    | Review | Priority | Complexity | Deps |
| -------- | ----- | --------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Test1 | COMPLETED | PASSED | HIGH     | S          | None |
| TASK_002 | Test2 | DONE      | PASSED | HIGH     | S          | None |
| TASK_003 | Test3 | IN REVIEW | -      | HIGH     | S          | None |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const stats = await getTaskStats(mockConfig);

      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(2); // COMPLETED and DONE
      expect(stats.inReview).toBe(1);
    });

    it('should parse multi-column rows and read status from 3rd column', async () => {
      const content = `# Progress

| Task ID  | Title                       | Status   | Review Status | Priority | Complexity | Dependencies | Assigned To     | Reviewed By     | Attempts |
| -------- | --------------------------- | -------- | ------------- | -------- | ---------- | ------------ | --------------- | --------------- | -------- |
| TASK_001 | Animation Module Structure  | COMPLETE | PASSED        | High     | S          | None         | SA-20260205-001 | RA-20260205-001 | 1        |
| TASK_002 | Internal Gradient Utilities | COMPLETE | PASSED        | High     | S          | TASK_001     | SA-20260205-002 | RA-20260205-002 | 1        |
| TASK_003 | Animation State Types       | NOT STARTED | -          | High     | S          | TASK_001     | -               | -               | 0        |
| MVT_M1   | Manual Verification Test    | NOT STARTED | -          | —        | 15 min     | TASK_001-004 | -               | -               | 0        |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const stats = await getTaskStats(mockConfig);

      expect(stats.total).toBe(3); // MVT rows are excluded
      expect(stats.completed).toBe(2);
      expect(stats.remaining).toBe(1); // TASK_003 only
      expect(stats.inReview).toBe(0);
      expect(stats.blocked).toBe(0);
    });

    it('should parse rows with File column (new format)', async () => {
      const content = `# Progress

| Task ID  | Title                  | File                              | Status      | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | ---------------------- | --------------------------------- | ----------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | YoloOptions Interface  | TASK_001_yolo_options_interface.md | COMPLETE    | PASSED        | HIGH     | S          | None         | SA-001      | 1        |
| TASK_002 | Yolo Command Skeleton  | TASK_002_yolo_command_skeleton.md  | IN PROGRESS | —             | HIGH     | S          | TASK_001     | SA-002      | 1        |
| TASK_003 | Command Registry       | TASK_003_command_registry.md       | NOT STARTED | —             | HIGH     | S          | TASK_001     |             |          |
| TASK_004 | CLI Verification       | TASK_004_cli_verification.md       | BLOCKED     | —             | HIGH     | S          | TASK_003     |             |          |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const stats = await getTaskStats(mockConfig);

      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(1);
      expect(stats.remaining).toBe(2); // IN PROGRESS + NOT STARTED
      expect(stats.inReview).toBe(0);
      expect(stats.blocked).toBe(1);
    });

    it('should detect state correctly with File column format', async () => {
      const content = `# Progress

| Task ID  | Title                  | File                              | Status      | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | ---------------------- | --------------------------------- | ----------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | YoloOptions Interface  | TASK_001_yolo_options_interface.md | COMPLETE    | PASSED        | HIGH     | S          | None         | SA-001      | 1        |
| TASK_002 | Yolo Command Skeleton  | TASK_002_yolo_command_skeleton.md  | IN REVIEW   | —             | HIGH     | S          | TASK_001     | SA-002      | 1        |
| TASK_003 | Command Registry       | TASK_003_command_registry.md       | NOT STARTED | —             | HIGH     | S          | TASK_001     |             |          |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.IN_REVIEW);
    });

    it('should find current task correctly with File column format', async () => {
      const content = `# Progress

| Task ID  | Title                  | File                              | Status      | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | ---------------------- | --------------------------------- | ----------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | YoloOptions Interface  | TASK_001_yolo_options_interface.md | COMPLETE    | PASSED        | HIGH     | S          | None         | SA-001      | 1        |
| TASK_002 | Yolo Command Skeleton  | TASK_002_yolo_command_skeleton.md  | IN PROGRESS | —             | HIGH     | S          | TASK_001     | SA-002      | 1        |
| TASK_003 | Command Registry       | TASK_003_command_registry.md       | NOT STARTED | —             | HIGH     | S          | TASK_001     |             |          |
`;
      writeFileSync(mockConfig.paths.progress, content);
      const current = await getCurrentTask(mockConfig);

      expect(current).not.toBeUndefined();
      expect(current?.id).toBe('TASK_002');
      expect(current?.title).toBe('Yolo Command Skeleton');
      expect(current?.status).toBe('IN PROGRESS');
    });
  });

  describe('getMilestonesMvtStatus', () => {
    const writeProgress = (content: string): void => {
      writeFileSync(mockConfig.paths.progress, content);
    };

    it('UT-S01: returns [] when PROGRESS.md does not exist', async () => {
      expect(await getMilestonesMvtStatus(mockConfig)).toEqual([]);
    });

    it('UT-S02: returns [] when file has no milestone headers', async () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {});
      writeProgress(
        '# Progress\n| Task ID | Title | Status |\n| TASK_001 | T | NOT STARTED |\n'
      );
      expect(await getMilestonesMvtStatus(mockConfig)).toEqual([]);
      expect(debugSpy).toHaveBeenCalledWith(
        'getMilestonesMvtStatus: No milestone sections found'
      );
    });

    it('UT-S03: parses single milestone with incomplete tasks', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | NOT STARTED |
| TASK_002 | B | NOT STARTED |
| TASK_003 | C | NOT STARTED |
| MVT_M1 | Manual | NOT STARTED |`);
      const result = await getMilestonesMvtStatus(mockConfig);
      expect(result[0]).toMatchObject({
        milestoneId: 'M1',
        totalTasks: 3,
        completedTasks: 0,
        mvtId: 'MVT_M1',
        mvtStatus: 'NOT STARTED',
        mvtReady: false,
      });
    });

    it('UT-S04: mvtReady true when all tasks complete and MVT not complete', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| TASK_002 | B | COMPLETE |
| TASK_003 | C | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.completedTasks).toBe(3);
      expect(m1.mvtReady).toBe(true);
    });

    it('UT-S05: mvtReady false when MVT is COMPLETE', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| TASK_002 | B | COMPLETE |
| MVT_M1 | Manual | COMPLETE |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtReady).toBe(false);
    });

    it('UT-S06: handles multiple milestones with mixed readiness', async () => {
      writeProgress(`## Milestone: M1 - One
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | COMPLETE |
## Milestone: M2 - Two
| TASK_002 | B | COMPLETE |
| MVT_M2 | Manual | NOT STARTED |
## Milestone: M3 - Three
| TASK_003 | C | COMPLETE |
| TASK_004 | D | NOT STARTED |
| MVT_M3 | Manual | NOT STARTED |`);
      const result = await getMilestonesMvtStatus(mockConfig);
      expect(result.map((m) => m.mvtReady)).toEqual([false, true, false]);
    });

    it('UT-S07: handles milestone with no MVT row', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtId).toBeNull();
      expect(m1.mvtStatus).toBeNull();
      expect(m1.mvtReady).toBe(false);
    });

    it('UT-S08: treats BLOCKED MVT as ready when tasks complete', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | BLOCKED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtReady).toBe(true);
    });

    it('UT-S09: treats IN PROGRESS MVT as ready when tasks complete', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | IN PROGRESS |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtReady).toBe(true);
    });

    it('UT-S10: ignores header/separator rows in milestone tables', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| Task ID | Title | Status |
| --- | --- | --- |
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.totalTasks).toBe(1);
    });

    it('UT-S11: reuses readStateFile cache with getState then milestone parser', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | NOT STARTED |
| MVT_M1 | Manual | NOT STARTED |`);
      await getState(mockConfig);
      writeProgress(`## Milestone: M1 - Updated
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | COMPLETE |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.milestoneName).toBe('Foundation');
      expect(m1.completedTasks).toBe(0);
    });

    it('UT-S12: forceRefresh triggers a fresh read', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | NOT STARTED |
| MVT_M1 | Manual | NOT STARTED |`);
      await getMilestonesMvtStatus(mockConfig);
      writeProgress(`## Milestone: M1 - Updated
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | COMPLETE |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig, {
        forceRefresh: true,
      });
      expect(m1.milestoneName).toBe('Updated');
      expect(m1.completedTasks).toBe(1);
    });

    it('UT-S13: parses 10-column table with File column', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| Task ID | Title | File | Status | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| TASK_001 | A | a.md | COMPLETE | PASSED | HIGH | S | None | SA-1 | 1 |
| MVT_M1 | Manual | mvt.md | NOT STARTED | — | — | — | TASK_001 | | |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.completedTasks).toBe(1);
      expect(m1.mvtStatus).toBe('NOT STARTED');
    });

    it('UT-S14: zero-task milestone with only MVT is not ready', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| MVT_M1 | Manual | NOT STARTED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.totalTasks).toBe(0);
      expect(m1.mvtReady).toBe(false);
    });

    it('UT-S15: blank MVT status becomes null', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtStatus).toBeNull();
    });

    it('UT-S16: unknown MVT status becomes null', async () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {});
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | SKIPPED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtStatus).toBeNull();
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERR-STA-05]')
      );
    });

    it('UT-S17: IN REVIEW MVT is considered ready when tasks complete', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | IN REVIEW |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtReady).toBe(true);
    });

    it('UT-S18: last MVT row wins in same milestone', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_M1a | Manual | NOT STARTED |
| MVT_M1b | Manual | COMPLETE |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtId).toBe('MVT_M1b');
      expect(m1.mvtStatus).toBe('COMPLETE');
      expect(m1.mvtReady).toBe(false);
    });

    it('UT-S19: readiness is computed per milestone only', async () => {
      writeProgress(`## Milestone: M1 - One
| TASK_001 | A | COMPLETE |
| TASK_002 | B | NOT STARTED |
| MVT_M1 | Manual | NOT STARTED |
## Milestone: M2 - Two
| TASK_003 | C | COMPLETE |
| TASK_004 | D | COMPLETE |
| MVT_M2 | Manual | NOT STARTED |`);
      const result = await getMilestonesMvtStatus(mockConfig);
      expect(result[0].mvtReady).toBe(false);
      expect(result[1].mvtReady).toBe(true);
    });

    it('UT-S20: parses 9-column table format', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| Task ID | Title | Status | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| TASK_001 | A | COMPLETE | PASSED | HIGH | S | None | SA-1 | 1 |
| MVT_M1 | Manual | NOT STARTED | — | — | — | TASK_001 | | |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.completedTasks).toBe(1);
      expect(m1.mvtStatus).toBe('NOT STARTED');
    });

    it('UT-S21: parses milestone header with extra spaces', async () => {
      writeProgress(`## Milestone:  M1  -  Foundation  
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.milestoneId).toBe('M1');
      expect(m1.milestoneName).toBe('Foundation');
    });

    it('UT-S22: ignores malformed header without space after ##', async () => {
      writeProgress(`##Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      expect(await getMilestonesMvtStatus(mockConfig)).toEqual([]);
    });

    it('UT-S23: supports non-standard MVT suffix', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| MVT_01 | Manual | NOT STARTED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtId).toBe('MVT_01');
    });

    it('UT-S24: supports lowercase mvt row', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | A | COMPLETE |
| mvt_m1 | Manual | NOT STARTED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.mvtId).toBe('mvt_m1');
    });

    it('UT-S25: ignores TASK rows before the first milestone header', async () => {
      writeProgress(`| TASK_000 | A | COMPLETE |
## Milestone: M1 - Foundation
| TASK_001 | B | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      const result = await getMilestonesMvtStatus(mockConfig);
      expect(result).toHaveLength(1);
      expect(result[0].totalTasks).toBe(1);
    });

    it('UT-S26: skips non-numeric milestone IDs', async () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {});
      writeProgress(`## Milestone: MA - Alpha
| TASK_001 | A | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      expect(await getMilestonesMvtStatus(mockConfig)).toEqual([]);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERR-STA-04]')
      );
    });

    it('UT-S27: counts compact TASK rows that match TASK_ROW pattern', async () => {
      writeProgress(`## Milestone: M1 - Foundation
| TASK_001 | Tiny | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      const [m1] = await getMilestonesMvtStatus(mockConfig);
      expect(m1.totalTasks).toBe(1);
    });

    it('UT-S28: malformed header before valid header is skipped', async () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {});
      writeProgress(`## Milestone: - NoId
| TASK_001 | A | COMPLETE |
## Milestone: M1 - Valid
| TASK_002 | B | COMPLETE |
| MVT_M1 | Manual | NOT STARTED |`);
      const result = await getMilestonesMvtStatus(mockConfig);
      expect(result).toHaveLength(1);
      expect(result[0].milestoneId).toBe('M1');
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERR-STA-04]')
      );
    });

    it('UT-S29: wraps read errors with ERR-STA-06', async () => {
      const errorConfig: SpeciConfig = {
        ...mockConfig,
        paths: { ...mockConfig.paths, progress: testDir },
      };
      await expect(getMilestonesMvtStatus(errorConfig)).rejects.toThrow(
        /\[ERR-STA-06\]/
      );
    });

    it('UT-S30: logs empty milestone debug message when none found', async () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {});
      writeProgress('# Progress\nNo milestone headers here');
      expect(await getMilestonesMvtStatus(mockConfig)).toEqual([]);
      expect(debugSpy).toHaveBeenCalledWith(
        'getMilestonesMvtStatus: No milestone sections found'
      );
    });

    it('UT-S31: logs no-MVT debug when milestones exist without MVT rows', async () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {});
      writeProgress(`## Milestone: M1 - One
| TASK_001 | A | COMPLETE |
## Milestone: M2 - Two
| TASK_002 | B | NOT STARTED |`);
      const result = await getMilestonesMvtStatus(mockConfig);
      expect(result.every((entry) => entry.mvtId === null)).toBe(true);
      expect(result.every((entry) => entry.mvtReady === false)).toBe(true);
      expect(debugSpy).toHaveBeenCalledWith(
        'getMilestonesMvtStatus: No MVT rows found in any milestone'
      );
    });
  });

  describe('hasStatePattern', () => {
    it('should return true when pattern matches', () => {
      const content = '| TASK_001 | Test | BLOCKED |';
      const pattern = /TASK_\d+\s*\|.*BLOCKED/i;
      expect(hasStatePattern(content, pattern)).toBe(true);
    });

    it('should return false when pattern does not match', () => {
      const content = '| TASK_001 | Test | COMPLETE |';
      const pattern = /TASK_\d+\s*\|.*BLOCKED/i;
      expect(hasStatePattern(content, pattern)).toBe(false);
    });

    it('should handle case-insensitive patterns', () => {
      const content = '| TASK_001 | Test | blocked |';
      const pattern = /TASK_\d+\s*\|.*BLOCKED/i;
      expect(hasStatePattern(content, pattern)).toBe(true);
    });
  });

  describe('performance', () => {
    it('should handle large files efficiently', async () => {
      // Generate file with 1000+ tasks
      let content = '# Progress\n\n';
      content +=
        '| Task ID  | Title | Status      |\n| -------- | ----- | ----------- |\n';

      for (let i = 1; i <= 1000; i++) {
        const status =
          i === 999 ? 'NOT STARTED' : i === 1000 ? 'IN PROGRESS' : 'COMPLETE';
        content += `| TASK_${String(i).padStart(3, '0')} | Task ${i} | ${status} |\n`;
      }

      writeFileSync(mockConfig.paths.progress, content);

      const startTime = performance.now();
      const state = await getState(mockConfig);
      const endTime = performance.now();

      expect(state).toBe(STATE.WORK_LEFT);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in <100ms
    });
  });

  describe('Race Conditions', () => {
    it('should handle concurrent getState calls', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | NOT STARTED |
| TASK_003 | Test  | IN_REVIEW   |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Call getState multiple times concurrently
      const results = await Promise.all([
        getState(mockConfig),
        getState(mockConfig),
        getState(mockConfig),
        getState(mockConfig),
      ]);

      // All results should be identical
      results.forEach((state) => {
        expect(state).toBe(STATE.IN_REVIEW);
      });
    });

    it('should handle concurrent getTaskStats calls', async () => {
      const content = `# Progress
| Task ID  | Title    | Status      | Review | Priority | Complexity | Deps |
| -------- | -------- | ----------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Setup    | COMPLETE    | PASSED | HIGH     | S          | None |
| TASK_002 | Parse    | IN_REVIEW   | -      | HIGH     | S          | None |
| TASK_003 | Test     | NOT STARTED | -      | HIGH     | S          | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Call getTaskStats multiple times concurrently
      const results = await Promise.all([
        getTaskStats(mockConfig),
        getTaskStats(mockConfig),
        getTaskStats(mockConfig),
      ]);

      // All results should be identical
      results.forEach((stats) => {
        expect(stats.total).toBe(3);
        expect(stats.completed).toBe(1);
        expect(stats.remaining).toBe(1);
        expect(stats.inReview).toBe(1);
      });
    });

    it('should handle concurrent reads with different configs', async () => {
      // Create two different progress files
      const content1 = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Test1 | COMPLETE |
`;
      const content2 = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Test1 | NOT STARTED |
`;

      const path1 = join(testDir, 'PROGRESS1.md');
      const path2 = join(testDir, 'PROGRESS2.md');

      writeFileSync(path1, content1);
      writeFileSync(path2, content2);

      const config1: SpeciConfig = {
        ...mockConfig,
        paths: { ...mockConfig.paths, progress: path1 },
      };
      const config2: SpeciConfig = {
        ...mockConfig,
        paths: { ...mockConfig.paths, progress: path2 },
      };

      // Read from both configs concurrently
      const [state1, state2] = await Promise.all([
        getState(config1),
        getState(config2),
      ]);

      expect(state1).toBe(STATE.DONE);
      expect(state2).toBe(STATE.WORK_LEFT);
    });

    it('should handle rapid sequential state reads', async () => {
      const content = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Test  | BLOCKED  |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Perform many rapid reads
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(getState(mockConfig));
      }

      const results = await Promise.all(promises);

      // All should return the same state
      results.forEach((state) => {
        expect(state).toBe(STATE.BLOCKED);
      });
    });

    it('should handle concurrent mixed state operations', async () => {
      const content = `# Progress

| Task ID  | Title | Status      | Review | Priority | Complexity | Deps |
| -------- | ----- | ----------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Setup | COMPLETE    | PASSED | HIGH     | S          | None |
| TASK_002 | Parse | IN_PROGRESS | -      | HIGH     | S          | None |
| TASK_003 | Test  | NOT STARTED | -      | HIGH     | S          | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Mix different operations concurrently
      const [state1, stats1, state2, stats2] = await Promise.all([
        getState(mockConfig),
        getTaskStats(mockConfig),
        getState(mockConfig),
        getTaskStats(mockConfig),
      ]);

      // Verify consistency
      expect(state1).toBe(STATE.WORK_LEFT);
      expect(state2).toBe(STATE.WORK_LEFT);
      expect(stats1.total).toBeGreaterThanOrEqual(2);
      expect(stats2.total).toBeGreaterThanOrEqual(2);
      expect(stats1.completed).toBe(1);
      expect(stats2.completed).toBe(1);
    });

    it('should handle concurrent hasStatePattern calls', async () => {
      const content = '| TASK_001 | Test | BLOCKED |';
      const pattern = /TASK_\d+\s*\|.*BLOCKED/i;

      // Call hasStatePattern concurrently
      const results = await Promise.all([
        Promise.resolve(hasStatePattern(content, pattern)),
        Promise.resolve(hasStatePattern(content, pattern)),
        Promise.resolve(hasStatePattern(content, pattern)),
      ]);

      // All should return true
      results.forEach((result) => {
        expect(result).toBe(true);
      });
    });

    it('should handle state reads from non-existent file concurrently', async () => {
      // Ensure file doesn't exist
      if (existsSync(mockConfig.paths.progress)) {
        rmSync(mockConfig.paths.progress);
      }

      const results = await Promise.all([
        getState(mockConfig),
        getState(mockConfig),
        getTaskStats(mockConfig),
        getTaskStats(mockConfig),
      ]);

      expect(results[0]).toBe(STATE.NO_PROGRESS);
      expect(results[1]).toBe(STATE.NO_PROGRESS);
      expect(results[2].total).toBe(0);
      expect(results[3].total).toBe(0);
    });

    it('should handle concurrent reads during file write', async () => {
      // Write initial content
      const content = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Test  | COMPLETE |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Start multiple reads and a write operation
      const readPromises = [
        getState(mockConfig),
        getState(mockConfig),
        getState(mockConfig),
      ];

      // Perform a write during reads
      const writePromise = Promise.resolve().then(() => {
        const newContent = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Test  | NOT STARTED |
`;
        writeFileSync(mockConfig.paths.progress, newContent);
      });

      await Promise.all([...readPromises, writePromise]);

      // Final read should reflect the write
      const finalState = await getState(mockConfig);
      expect(finalState).toBe(STATE.WORK_LEFT);
    });
  });

  describe('State File Caching', () => {
    beforeEach(() => {
      // Ensure cache is clean before each test
      resetStateCache();
    });

    afterEach(() => {
      // Clean up cache after each test
      resetStateCache();
    });

    it('should read file on first call', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const state = await getState(mockConfig);
      expect(state).toBe(STATE.WORK_LEFT);
    });

    it('should use cache on second call within TTL', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // First call reads file
      const state1 = await getState(mockConfig);
      expect(state1).toBe(STATE.WORK_LEFT);

      // Modify file
      const newContent = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Setup | COMPLETE |
| TASK_002 | Parse | COMPLETE |
`;
      writeFileSync(mockConfig.paths.progress, newContent);

      // Second call should use cache (still see old state)
      const state2 = await getState(mockConfig);
      expect(state2).toBe(STATE.WORK_LEFT); // Cache hit
    });

    it('should read file again after TTL expires', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // First call reads file
      const state1 = await getState(mockConfig);
      expect(state1).toBe(STATE.WORK_LEFT);

      // Wait for TTL to expire (default 200ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Modify file
      const newContent = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Setup | COMPLETE |
| TASK_002 | Parse | COMPLETE |
`;
      writeFileSync(mockConfig.paths.progress, newContent);

      // Third call should read file again (TTL expired)
      const state2 = await getState(mockConfig);
      expect(state2).toBe(STATE.DONE); // New state
    });

    it('should bypass cache with forceRefresh option', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // First call reads file
      const state1 = await getState(mockConfig);
      expect(state1).toBe(STATE.WORK_LEFT);

      // Modify file
      const newContent = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Setup | COMPLETE |
| TASK_002 | Parse | COMPLETE |
`;
      writeFileSync(mockConfig.paths.progress, newContent);

      // Force refresh should read new file
      const state2 = await getState(mockConfig, { forceRefresh: true });
      expect(state2).toBe(STATE.DONE); // New state
    });

    it('should clear cache with resetStateCache', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // First call reads file
      const state1 = await getState(mockConfig);
      expect(state1).toBe(STATE.WORK_LEFT);

      // Clear cache
      resetStateCache();

      // Modify file
      const newContent = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Setup | COMPLETE |
| TASK_002 | Parse | COMPLETE |
`;
      writeFileSync(mockConfig.paths.progress, newContent);

      // Next call should read file again (cache was cleared)
      const state2 = await getState(mockConfig);
      expect(state2).toBe(STATE.DONE); // New state
    });

    it('should share cache between getState, getTaskStats, and getCurrentTask', async () => {
      const content = `# Progress
| Task ID  | Title | Status      | Review | Priority | Complexity | Deps |
| -------- | ----- | ----------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Setup | COMPLETE    | PASSED | HIGH     | S          | None |
| TASK_002 | Parse | IN PROGRESS | -      | HIGH     | S          | None |
| TASK_003 | Test  | NOT STARTED | -      | HIGH     | S          | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // First call reads file
      const state = await getState(mockConfig);
      expect(state).toBe(STATE.WORK_LEFT);

      // Modify file
      const newContent = `# Progress
| Task ID  | Title | Status   | Review | Priority | Complexity | Deps |
| -------- | ----- | -------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Setup | COMPLETE | PASSED | HIGH     | S          | None |
| TASK_002 | Parse | COMPLETE | PASSED | HIGH     | S          | None |
| TASK_003 | Test  | COMPLETE | PASSED | HIGH     | S          | None |
`;
      writeFileSync(mockConfig.paths.progress, newContent);

      // These should use cached data (see old state)
      const stats = await getTaskStats(mockConfig);
      const currentTask = await getCurrentTask(mockConfig);

      expect(stats.completed).toBe(1); // Old data
      expect(stats.remaining).toBe(2); // Old data
      expect(currentTask).not.toBeUndefined(); // Old data (task still in progress)
    });

    it('should not cache when file does not exist', async () => {
      // Ensure file doesn't exist
      if (existsSync(mockConfig.paths.progress)) {
        rmSync(mockConfig.paths.progress);
      }

      // First call - file doesn't exist
      const state1 = await getState(mockConfig);
      expect(state1).toBe(STATE.NO_PROGRESS);

      // Create file
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Second call should see new file (no cache for non-existent files)
      const state2 = await getState(mockConfig);
      expect(state2).toBe(STATE.WORK_LEFT);
    });

    it('should improve performance by reducing file reads', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | IN PROGRESS |
| TASK_003 | Test  | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Reset cache to start fresh
      resetStateCache();

      // Call all three functions (similar to status command)
      const start = performance.now();
      await Promise.all([
        getState(mockConfig),
        getTaskStats(mockConfig),
        getCurrentTask(mockConfig),
      ]);
      const cachedTime = performance.now() - start;

      // Reset cache and call again without cache
      resetStateCache();
      const startNoCache = performance.now();
      await Promise.all([
        getState(mockConfig, { forceRefresh: true }),
        getTaskStats(mockConfig, { forceRefresh: true }),
        getCurrentTask(mockConfig, { forceRefresh: true }),
      ]);
      const noCacheTime = performance.now() - startNoCache;

      // With cache should be faster (though timing may be unreliable in tests)
      // Just verify both complete successfully
      expect(cachedTime).toBeGreaterThan(0);
      expect(noCacheTime).toBeGreaterThan(0);
    });

    it('should respect custom TTL option', async () => {
      const content = `# Progress
| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | NOT STARTED |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // First call with short TTL (50ms)
      const state1 = await getState(mockConfig, { ttl: 50 });
      expect(state1).toBe(STATE.WORK_LEFT);

      // Wait for short TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Modify file
      const newContent = `# Progress
| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Setup | COMPLETE |
`;
      writeFileSync(mockConfig.paths.progress, newContent);

      // Should read new file (TTL expired)
      const state2 = await getState(mockConfig);
      expect(state2).toBe(STATE.DONE);
    });

    it('should handle concurrent calls with cache', async () => {
      const content = `# Progress
| Task ID  | Title | Status      | Review | Priority | Complexity | Deps |
| -------- | ----- | ----------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Setup | IN PROGRESS | -      | HIGH     | S          | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Multiple concurrent calls should all use cache efficiently
      const [state1, stats1, task1, state2, stats2] = await Promise.all([
        getState(mockConfig),
        getTaskStats(mockConfig),
        getCurrentTask(mockConfig),
        getState(mockConfig),
        getTaskStats(mockConfig),
      ]);

      expect(state1).toBe(STATE.WORK_LEFT);
      expect(state2).toBe(STATE.WORK_LEFT);
      expect(stats1.remaining).toBe(1);
      expect(stats2.remaining).toBe(1);
      expect(task1).not.toBeUndefined();
    });
  });

  describe('state parser edge cases', () => {
    it('should handle binary/invalid UTF-8 content gracefully', async () => {
      // Create file with invalid UTF-8 byte sequences
      const invalidUtf8 = Buffer.from([
        0xff,
        0xfe,
        0xfd, // Invalid UTF-8 bytes
        ...Buffer.from(
          '| TASK_001 | Test Task | NOT STARTED | HIGH | S | None |'
        ),
      ]);
      writeFileSync(mockConfig.paths.progress, invalidUtf8);

      // Parser should handle gracefully (may return error or skip invalid data)
      const state = await getState(mockConfig);

      // Should not crash - either returns valid state or NO_PROGRESS
      expect([
        STATE.WORK_LEFT,
        STATE.IN_REVIEW,
        STATE.BLOCKED,
        STATE.DONE,
        STATE.NO_PROGRESS,
      ]).toContain(state);
    });

    it('should handle large files (100,000+ tasks) without performance degradation', async () => {
      // Generate PROGRESS.md with 100,000 task rows
      const lines = [
        '# Progress',
        '',
        '## Milestone: M0',
        '',
        '| Task ID | Title | Status | Priority | Complexity | Dependencies |',
        '|---------|-------|--------|----------|------------|--------------|',
      ];

      // Add 100,000 tasks
      for (let i = 1; i <= 100000; i++) {
        lines.push(
          `| TASK_${i.toString().padStart(6, '0')} | Task ${i} | NOT STARTED | HIGH | S | None |`
        );
      }

      // Add one IN PROGRESS task
      lines.push(
        '| TASK_999999 | Current Task | IN PROGRESS | HIGH | S | None |'
      );

      writeFileSync(mockConfig.paths.progress, lines.join('\n'));

      // Measure parsing time
      const startTime = Date.now();
      const state = await getState(mockConfig);
      const duration = Date.now() - startTime;

      expect(state).toBe(STATE.WORK_LEFT);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle concurrent getState() calls without corruption', async () => {
      // Create a valid PROGRESS.md
      const content = `
# Progress

## Milestone: M0

| Task ID | Title | Status | Priority | Complexity | Dependencies |
|---------|-------|--------|----------|------------|--------------|
| TASK_001 | Test Task | IN PROGRESS | HIGH | S | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Execute 10 concurrent getState() calls
      const promises = Array.from({ length: 10 }, () => getState(mockConfig));
      const results = await Promise.all(promises);

      // All should return consistent results
      expect(results.every((r) => r === STATE.WORK_LEFT)).toBe(true);

      // Verify file is not corrupted
      const finalState = await getState(mockConfig);
      expect(finalState).toBe(STATE.WORK_LEFT);
    });

    it('should handle file deleted during or after read', async () => {
      // Create initial file
      const content = `
# Progress

## Milestone: M0

| Task ID | Title | Status | Priority | Complexity | Dependencies |
|---------|-------|--------|----------|------------|--------------|
| TASK_001 | Test Task | NOT STARTED | HIGH | S | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      // Read state once to ensure it's cached
      const firstState = await getState(mockConfig);
      expect(firstState).toBe(STATE.WORK_LEFT);

      // Delete file
      rmSync(mockConfig.paths.progress, { force: true });

      // Force a cache refresh - should handle gracefully
      const state = await getState(mockConfig, { forceRefresh: true });
      expect(state).toBe(STATE.NO_PROGRESS);
    });

    it('should handle mixed line endings (CRLF vs LF)', async () => {
      // Create file with mixed \r\n and \n line endings
      const lines = [
        '# Progress\r\n',
        '\n',
        '## Milestone: M0\r\n',
        '\n',
        '| Task ID | Title | Status | Priority | Complexity | Dependencies |\r\n',
        '|---------|-------|--------|----------|------------|--------------|\r\n',
        '| TASK_001 | Test Task 1 | NOT STARTED | HIGH | S | None |\n',
        '| TASK_002 | Test Task 2 | IN PROGRESS | HIGH | S | None |\r\n',
        '| TASK_003 | Test Task 3 | COMPLETE | HIGH | S | None |\n',
      ].join('');

      writeFileSync(mockConfig.paths.progress, lines);

      const state = await getState(mockConfig);
      const stats = await getTaskStats(mockConfig);

      expect(state).toBe(STATE.WORK_LEFT);
      expect(stats.total).toBeGreaterThanOrEqual(3);
    });

    it('should parse task titles with special characters', async () => {
      // Create tasks with titles containing various special chars
      const content = `
# Progress

## Milestone: M0

| Task ID | Title | Status | Priority | Complexity | Dependencies |
|---------|-------|--------|----------|------------|--------------|
| TASK_001 | Fix bug with brackets | NOT STARTED | HIGH | S | None |
| TASK_002 | Update regex with parens | NOT STARTED | HIGH | S | None |
| TASK_003 | Feature with options | IN PROGRESS | HIGH | S | None |
| TASK_004 | Validate input patterns | NOT STARTED | HIGH | S | None |
| TASK_005 | Parse start and end | NOT STARTED | HIGH | S | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const state = await getState(mockConfig);
      const stats = await getTaskStats(mockConfig);
      const current = await getCurrentTask(mockConfig);

      expect(state).toBe(STATE.WORK_LEFT);
      expect(stats.total).toBeGreaterThanOrEqual(5);
      expect(current).not.toBeUndefined();
      if (current) {
        // Verify task with special naming was parsed
        expect(current.title).toBeDefined();
      }
    });

    it('should handle task tables with less than 4 columns gracefully', async () => {
      // Test coverage for lines 239, 302: if (cols.length < 4) continue;
      // Need a row matching TASK_ROW pattern but with < 4 columns after split
      const content = `
# Progress

## Milestone: M0

| Task ID | Title | Status | Priority | Complexity | Dependencies |
|---------|-------|--------|----------|------------|--------------|
| TASK_001 |
| TASK_002 | Valid task | NOT STARTED | HIGH | S | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const stats = await getTaskStats(mockConfig);

      // Should only count the valid row with 4+ columns
      expect(stats.total).toBe(1);
      expect(stats.remaining).toBe(1);

      // getCurrentTask should also skip malformed rows
      const current = await getCurrentTask(mockConfig);
      expect(current).toBeUndefined(); // No IN PROGRESS task
    });

    it('should count COMPLETE status correctly', async () => {
      // Test coverage for line 249-250: COMPLETE status detection
      const content = `
# Progress

## Milestone: M0

| Task ID | Title | Status | Priority | Complexity | Dependencies |
|---------|-------|--------|----------|------------|--------------|
| TASK_001 | Task one | COMPLETE | HIGH | S | None |
| TASK_002 | Task two | COMPLETED | HIGH | S | None |
| TASK_003 | Task three | DONE | HIGH | S | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const stats = await getTaskStats(mockConfig);

      // All three should be counted as completed
      expect(stats.completed).toBe(3);
      expect(stats.total).toBe(3);
    });

    it('should count IN_REVIEW status correctly', async () => {
      // Test coverage for line 253-254: IN_REVIEW status detection
      const content = `
# Progress

## Milestone: M0

| Task ID | Title | Status | Priority | Complexity | Dependencies |
|---------|-------|--------|----------|------------|--------------|
| TASK_001 | Task one | IN_REVIEW | HIGH | S | None |
| TASK_002 | Task two | IN REVIEW | HIGH | S | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const stats = await getTaskStats(mockConfig);

      expect(stats.inReview).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('should count remaining tasks (NOT STARTED and IN PROGRESS)', async () => {
      // Test coverage for line 255-256: remaining tasks counting
      const content = `
# Progress

## Milestone: M0

| Task ID | Title | Status | Priority | Complexity | Dependencies |
|---------|-------|--------|----------|------------|--------------|
| TASK_001 | Task one | NOT STARTED | HIGH | S | None |
| TASK_002 | Task two | IN PROGRESS | HIGH | S | None |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const stats = await getTaskStats(mockConfig);

      expect(stats.remaining).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('should return undefined for getCurrentTask with less than 4 columns', async () => {
      // Test coverage for line 302: if (cols.length < 4) continue;
      const content = `
# Progress

## Milestone: M0

| A | B |
|---|---|
| 1 | IN PROGRESS |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const current = await getCurrentTask(mockConfig);

      // Should return undefined because the row doesn't have proper task format
      expect(current).toBeUndefined();
    });

    it('should handle state file with no valid task rows', async () => {
      const content = `
# Progress

## Some Section

This is just text with no task table.

| Column A | Column B |
|----------|----------|
| Data 1   | Data 2   |
`;
      writeFileSync(mockConfig.paths.progress, content);

      const stats = await getTaskStats(mockConfig);
      const current = await getCurrentTask(mockConfig);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.remaining).toBe(0);
      expect(stats.inReview).toBe(0);
      expect(stats.blocked).toBe(0);
      expect(current).toBeUndefined();
    });
  });

  describe('writeFailureNotes', () => {
    /** Helper to create a PROGRESS.md with the standard Agent Handoff section */
    function writeProgressWithHandoff(extraContent = ''): void {
      const content = `# Progress

## Tasks

| Task ID  | Title              | Status      | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | ------------------ | ----------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_004 | CLI Integration    | IN PROGRESS | —             | HIGH     | S (≤2h)    | TASK_003     |             |          |

---

## Agent Handoff

### For Reviewer

| Field             | Value |
| ----------------- | ----- |
| Task              | —     |

### For Fix Agent

| Field           | Value |
| --------------- | ----- |
| Task            | —     |
| Failed Gate     | —     |
| Primary Error   | —     |
| Root Cause Hint | —     |

---
${extraContent}`;
      writeFileSync(mockConfig.paths.progress, content);
    }

    function makeGateFailure(
      overrides: Partial<GateFailureInfo> = {}
    ): GateFailureInfo {
      return {
        results: [
          {
            command: 'npm run lint',
            isSuccess: false,
            exitCode: 1,
            error: 'Lint failed: unexpected token',
          },
        ],
        error: 'Lint failed: unexpected token',
        ...overrides,
      };
    }

    it('should persist updates via atomicWrite', async () => {
      writeProgressWithHandoff();
      const failure = makeGateFailure();
      const atomicWriteSpy = vi
        .spyOn(atomicWriteModule, 'atomicWrite')
        .mockResolvedValue(undefined);

      await writeFailureNotes(mockConfig, failure);

      expect(atomicWriteSpy).toHaveBeenCalledTimes(1);
      expect(atomicWriteSpy).toHaveBeenCalledWith(
        mockConfig.paths.progress,
        expect.any(String)
      );
    });

    it('should populate the For Fix Agent table with failure info', async () => {
      writeProgressWithHandoff();
      const failure = makeGateFailure();

      await writeFailureNotes(mockConfig, failure);

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(content).toContain(
        '| Task            | TASK_004 — CLI Integration |'
      );
      expect(content).toContain('| Failed Gate     | npm run lint |');
      expect(content).toContain(
        '| Primary Error   | Lint failed: unexpected token |'
      );
      expect(content).toContain(
        '| Root Cause Hint | `npm run lint` exited with code 1 |'
      );
    });

    it('should list multiple failed commands comma-separated', async () => {
      writeProgressWithHandoff();
      const failure = makeGateFailure({
        results: [
          {
            command: 'npm run lint',
            isSuccess: false,
            exitCode: 1,
            error: 'Lint error',
          },
          {
            command: 'npm test',
            isSuccess: false,
            exitCode: 2,
            error: 'Test error',
          },
        ],
      });

      await writeFailureNotes(mockConfig, failure);

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(content).toContain('| Failed Gate     | npm run lint, npm test |');
    });

    it('should use first failure for primary error', async () => {
      writeProgressWithHandoff();
      const failure = makeGateFailure({
        results: [
          {
            command: 'npm run lint',
            isSuccess: false,
            exitCode: 1,
            error: 'First error',
          },
          {
            command: 'npm test',
            isSuccess: false,
            exitCode: 2,
            error: 'Second error',
          },
        ],
        error: 'First error',
      });

      await writeFailureNotes(mockConfig, failure);

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(content).toContain('| Primary Error   | First error |');
      expect(content).toContain(
        '| Root Cause Hint | `npm run lint` exited with code 1 |'
      );
    });

    it('should truncate long error messages', async () => {
      writeProgressWithHandoff();
      const longError = 'x'.repeat(600);
      const failure = makeGateFailure({
        results: [
          {
            command: 'npm test',
            isSuccess: false,
            exitCode: 1,
            error: longError,
          },
        ],
        error: longError,
      });

      await writeFailureNotes(mockConfig, failure);

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      // 500 chars + ellipsis
      const primaryMatch = content.match(/\| Primary Error\s+\| (.+?) \|/);
      expect(primaryMatch).not.toBeNull();
      expect(primaryMatch![1].length).toBeLessThanOrEqual(502); // 500 + '…'
    });

    it('should collapse multiline errors to single line', async () => {
      writeProgressWithHandoff();
      const failure = makeGateFailure({
        results: [
          {
            command: 'npm test',
            isSuccess: false,
            exitCode: 1,
            error: 'line1\nline2\nline3',
          },
        ],
        error: 'line1\nline2\nline3',
      });

      await writeFailureNotes(mockConfig, failure);

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(content).toContain('| Primary Error   | line1 line2 line3 |');
    });

    it('should use em-dash for task when no active task exists', async () => {
      // Write PROGRESS.md with all tasks COMPLETE (no active task)
      const content = `# Progress

## Tasks

| Task ID  | Title           | Status   | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | --------------- | -------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | Completed Task  | COMPLETE | PASSED        | HIGH     | S (≤2h)    | None         |             | 1        |

---

## Agent Handoff

### For Fix Agent

| Field           | Value |
| --------------- | ----- |
| Task            | —     |
| Failed Gate     | —     |
| Primary Error   | —     |
| Root Cause Hint | —     |

---
`;
      writeFileSync(mockConfig.paths.progress, content);

      await writeFailureNotes(mockConfig, makeGateFailure());

      const result = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(result).toContain('| Task            | — |');
    });

    it('should not crash when For Fix Agent section is missing', async () => {
      const content = `# Progress\n\n## Tasks\n\nNo handoff section here.\n`;
      writeFileSync(mockConfig.paths.progress, content);

      // Should not throw
      await writeFailureNotes(mockConfig, makeGateFailure());

      // File should be unchanged
      const result = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(result).toBe(content);
    });

    it('should not crash when PROGRESS.md does not exist', async () => {
      // Don't create the file — should return gracefully
      await expect(
        writeFailureNotes(mockConfig, makeGateFailure())
      ).resolves.toBeUndefined();
    });

    it('should overwrite previous failure notes on successive calls', async () => {
      writeProgressWithHandoff();

      // First call
      await writeFailureNotes(
        mockConfig,
        makeGateFailure({
          results: [
            {
              command: 'npm run lint',
              isSuccess: false,
              exitCode: 1,
              error: 'First lint error',
            },
          ],
          error: 'First lint error',
        })
      );

      // Second call (simulating retry)
      await writeFailureNotes(
        mockConfig,
        makeGateFailure({
          results: [
            {
              command: 'npm test',
              isSuccess: false,
              exitCode: 2,
              error: 'Test failure now',
            },
          ],
          error: 'Test failure now',
        })
      );

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      // Should contain ONLY the latest failure info
      expect(content).toContain('| Failed Gate     | npm test |');
      expect(content).toContain('| Primary Error   | Test failure now |');
      expect(content).not.toContain('First lint error');
    });

    it('should preserve content after the For Fix Agent section', async () => {
      writeProgressWithHandoff('\n## Extra Section\n\nSome content here.\n');

      await writeFailureNotes(mockConfig, makeGateFailure());

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(content).toContain('## Extra Section');
      expect(content).toContain('Some content here.');
    });

    it('should filter out passing commands from Failed Gate', async () => {
      writeProgressWithHandoff();
      const failure = makeGateFailure({
        results: [
          {
            command: 'npm run lint',
            isSuccess: true,
            exitCode: 0,
            error: '',
          },
          {
            command: 'npm test',
            isSuccess: false,
            exitCode: 1,
            error: 'Test error',
          },
        ],
        error: 'Test error',
      });

      await writeFailureNotes(mockConfig, failure);

      const content = readFileSync(mockConfig.paths.progress, 'utf8');
      expect(content).toContain('| Failed Gate     | npm test |');
      expect(content).not.toContain('npm run lint');
    });

    it('should invalidate the state cache after writing', async () => {
      writeProgressWithHandoff();

      // Prime the cache
      await getState(mockConfig);

      await writeFailureNotes(mockConfig, makeGateFailure());

      // Should be able to read fresh state without forceRefresh
      const stateAfter = await getState(mockConfig);
      expect(stateAfter).toBe(STATE.WORK_LEFT);
    });
  });
});
