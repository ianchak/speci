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
});
