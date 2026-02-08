import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  STATE,
  getState,
  getTaskStats,
  hasStatePattern,
} from '../lib/state.js';
import { type SpeciConfig } from '../lib/config.js';

describe('state', () => {
  let testDir: string;
  let originalCwd: string;
  let mockConfig: SpeciConfig;

  beforeEach(() => {
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
      agents: {
        plan: null,
        task: null,
        refactor: null,
        impl: null,
        review: null,
        fix: null,
        tidy: null,
      },
      copilot: {
        permissions: 'allow-all',
        model: null,
        models: {
          plan: null,
          task: null,
          refactor: null,
          impl: null,
          review: null,
          fix: null,
          tidy: null,
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
| Task ID  | Title    | Status      |
| -------- | -------- | ----------- |
| TASK_001 | Setup    | COMPLETE    |
| TASK_002 | Parse    | COMPLETE    |
| TASK_003 | Test     | IN_REVIEW   |
| TASK_004 | Build    | NOT STARTED |
| TASK_005 | Deploy   | IN PROGRESS |
| TASK_006 | Monitor  | BLOCKED     |
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
| Task ID  | Title | Status    |
| -------- | ----- | --------- |
| TASK_001 | Test1 | COMPLETED |
| TASK_002 | Test2 | DONE      |
| TASK_003 | Test3 | IN REVIEW |
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
| Task ID  | Title    | Status      |
| -------- | -------- | ----------- |
| TASK_001 | Setup    | COMPLETE    |
| TASK_002 | Parse    | IN_REVIEW   |
| TASK_003 | Test     | NOT STARTED |
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

| Task ID  | Title | Status      |
| -------- | ----- | ----------- |
| TASK_001 | Setup | COMPLETE    |
| TASK_002 | Parse | IN_PROGRESS |
| TASK_003 | Test  | NOT STARTED |
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
});
