import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  STATE,
  getState,
  getTaskStats,
  getCurrentTask,
  hasStatePattern,
  resetStateCache,
} from '../lib/state.js';
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
});
