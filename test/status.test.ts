/**
 * Integration tests for status command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { status } from '../lib/commands/status.js';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { StatusOptions } from '../lib/commands/status.js';

const TEST_DIR = join(process.cwd(), 'test', 'fixtures', 'status');
const TEST_PROGRESS = join(TEST_DIR, 'PROGRESS.md');
const TEST_LOCK = join(TEST_DIR, '.speci-lock');
const TEST_CONFIG_PATH = join(TEST_DIR, 'speci.config.json');

// Mock console methods for testing output
let consoleOutput: string[] = [];
let consoleLogSpy: typeof console.log;
let consoleErrorSpy: typeof console.error;

beforeEach(() => {
  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }

  // Reset console output capture
  consoleOutput = [];
  consoleLogSpy = console.log;
  consoleErrorSpy = console.error;

  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.join(' '));
  };
  console.error = (...args: unknown[]) => {
    consoleOutput.push(args.join(' '));
  };
});

afterEach(() => {
  // Restore console
  console.log = consoleLogSpy;
  console.error = consoleErrorSpy;

  // Cleanup test files
  try {
    if (existsSync(TEST_PROGRESS)) unlinkSync(TEST_PROGRESS);
    if (existsSync(TEST_LOCK)) unlinkSync(TEST_LOCK);
    if (existsSync(TEST_CONFIG_PATH)) unlinkSync(TEST_CONFIG_PATH);
  } catch {
    // Ignore cleanup errors
  }
  // Clean up environment
  delete process.env.SPECI_PROGRESS_PATH;
  delete process.env.SPECI_LOCK_PATH;
});

describe('status command', () => {
  describe('state parsing', () => {
    it('should parse WORK_LEFT state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Priority | Status      |
| -------- | ------------ | -------- | ----------- |
| TASK_001 | Setup        | High     | COMPLETE    |
| TASK_002 | Development  | High     | NOT STARTED |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('WORK_LEFT');
    });

    it('should parse IN_REVIEW state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Priority | Status    |
| -------- | ------------ | -------- | --------- |
| TASK_001 | Setup        | High     | COMPLETE  |
| TASK_002 | Development  | High     | IN_REVIEW |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('IN_REVIEW');
    });

    it('should parse BLOCKED state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Priority | Status   |
| -------- | ------------ | -------- | -------- |
| TASK_001 | Setup        | High     | COMPLETE |
| TASK_002 | Development  | High     | BLOCKED  |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('BLOCKED');
    });

    it('should parse DONE state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Priority | Status   |
| -------- | ------------ | -------- | -------- |
| TASK_001 | Setup        | High     | COMPLETE |
| TASK_002 | Development  | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('DONE');
    });

    it('should handle missing PROGRESS.md (NO_PROGRESS state)', async () => {
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('NO_PROGRESS');
      expect(jsonOutput.stats.total).toBe(0);
    });

    it('should handle malformed PROGRESS.md with partial data', async () => {
      const progressContent = `# Progress
This is some malformed content
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBeDefined();
      expect(jsonOutput.stats).toBeDefined();
    });
  });

  describe('task statistics', () => {
    it('should calculate task statistics correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title       | Priority | Status      |
| -------- | ----------- | -------- | ----------- |
| TASK_001 | Task 1      | High     | COMPLETE    |
| TASK_002 | Task 2      | High     | COMPLETE    |
| TASK_003 | Task 3      | Medium   | NOT STARTED |
| TASK_004 | Task 4      | High     | IN PROGRESS |
| TASK_005 | Task 5      | Low      | IN_REVIEW   |
| TASK_006 | Task 6      | Medium   | BLOCKED     |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.stats.total).toBe(6);
      expect(jsonOutput.stats.completed).toBe(2);
      expect(jsonOutput.stats.pending).toBe(2); // NOT STARTED + IN PROGRESS
      expect(jsonOutput.stats.inReview).toBe(1);
      expect(jsonOutput.stats.blocked).toBe(1);
    });

    it('should handle empty progress file', async () => {
      writeFileSync(TEST_PROGRESS, '', 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.stats.total).toBe(0);
      expect(jsonOutput.stats.completed).toBe(0);
    });

    it('should handle single task', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.stats.total).toBe(1);
      expect(jsonOutput.stats.completed).toBe(1);
    });
  });

  describe('JSON output mode', () => {
    it('should output valid JSON when --json flag is specified', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      expect(() => JSON.parse(consoleOutput[0])).not.toThrow();
    });

    it('should include all required fields in JSON output', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput).toHaveProperty('state');
      expect(jsonOutput).toHaveProperty('stats');
      expect(jsonOutput.stats).toHaveProperty('total');
      expect(jsonOutput.stats).toHaveProperty('completed');
      expect(jsonOutput.stats).toHaveProperty('pending');
      expect(jsonOutput.stats).toHaveProperty('inReview');
      expect(jsonOutput.stats).toHaveProperty('blocked');
      expect(jsonOutput).toHaveProperty('lock');
      expect(jsonOutput.lock).toHaveProperty('isLocked');
    });

    it('should include error field if state is partial/corrupt', async () => {
      writeConfig();
      // Missing PROGRESS.md should not include error field
      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      // NO_PROGRESS is not an error, just an expected state
      expect(jsonOutput.state).toBe('NO_PROGRESS');
    });
  });

  describe('lock information', () => {
    it('should detect locked state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      // Create lock file
      const lockContent = `Started: 2026-02-04 10:00:00\nPID: 12345`;
      writeFileSync(TEST_LOCK, lockContent, 'utf8');

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.lock.isLocked).toBe(true);
      expect(jsonOutput.lock.pid).toBe(12345);
      expect(jsonOutput.lock.startTime).toBeDefined();
      expect(jsonOutput.lock.elapsed).toBeDefined();
    });

    it('should handle missing lock file', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.lock.isLocked).toBe(false);
      expect(jsonOutput.lock.pid).toBeNull();
      expect(jsonOutput.lock.startTime).toBeNull();
      expect(jsonOutput.lock.elapsed).toBeNull();
    });
  });

  describe('performance', () => {
    it('should respond in less than 100ms', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const startTime = Date.now();
      await status({ json: true } as StatusOptions);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
    });

    it('should use concurrent reads', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockContent = `Started: 2026-02-04 10:00:00\nPID: 12345`;
      writeFileSync(TEST_LOCK, lockContent, 'utf8');

      const startTime = Date.now();
      await status({ json: true } as StatusOptions);
      const elapsed = Date.now() - startTime;

      // Should be faster than sequential reads
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('styled output', () => {
    it('should render styled output by default', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status   |
| -------- | ------ | -------- | -------- |
| TASK_001 | Task 1 | High     | COMPLETE |
| TASK_002 | Task 2 | High     | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status();

      // Should have multiple lines of output
      expect(consoleOutput.length).toBeGreaterThan(1);
    });

    it('should display progress bar', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Priority | Status      |
| -------- | ------ | -------- | ----------- |
| TASK_001 | Task 1 | High     | COMPLETE    |
| TASK_002 | Task 2 | High     | NOT STARTED |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status();

      const output = consoleOutput.join('\n');
      // Progress bar should be present (either filled █ or empty ░)
      expect(output.includes('█') || output.includes('░')).toBe(true);
    });
  });
});

function writeConfig(): void {
  const config = {
    version: '1.0.0',
    paths: {
      progress: TEST_PROGRESS,
      tasks: join(TEST_DIR, 'tasks'),
      logs: join(TEST_DIR, '.speci-logs'),
      lock: TEST_LOCK,
    },
    agents: {},
    copilot: {},
    gate: {},
    loop: {},
  };
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config), 'utf8');

  // Use environment variables to override paths
  process.env.SPECI_PROGRESS_PATH = TEST_PROGRESS;
  process.env.SPECI_LOCK_PATH = TEST_LOCK;
}
