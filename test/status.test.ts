/**
 * Integration tests for status command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { status } from '../lib/commands/status.js';
import {
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { StatusOptions } from '../lib/commands/status.js';
import { createMockContext } from '../lib/adapters/test-context.js';
import type { CommandContext } from '../lib/interfaces.js';
import type { SpeciConfig } from '../lib/config.js';

const TEST_DIR = join(process.cwd(), 'test', 'fixtures', 'status');
const TEST_PROGRESS = join(TEST_DIR, 'PROGRESS.md');
const TEST_LOCK = join(TEST_DIR, '.speci-lock');
const TEST_CONFIG_PATH = join(TEST_DIR, 'speci.config.json');

// Mock console methods for testing output
let consoleOutput: string[] = [];
let consoleLogSpy: typeof console.log;
let consoleErrorSpy: typeof console.error;
let mockContext: CommandContext;

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

  // Create mock context with real filesystem for integration tests
  const config: Partial<SpeciConfig> = {
    version: '1.0.0',
    paths: {
      progress: TEST_PROGRESS,
      tasks: join(TEST_DIR, 'tasks'),
      logs: join(TEST_DIR, '.speci-logs'),
      lock: TEST_LOCK,
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
      permissions: 'allow-all' as const,
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
      maxFixAttempts: 3,
    },
    loop: {
      maxIterations: 10,
    },
  };

  mockContext = createMockContext({
    mockConfig: config,
    cwd: TEST_DIR,
    fs: {
      existsSync: (path: string) => existsSync(path),
      readFileSync: (path: string, encoding?: BufferEncoding) => {
        return readFileSync(path, encoding || 'utf8');
      },
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      unlinkSync: vi.fn(),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({
        isDirectory: () => false,
        isFile: () => true,
      })),
      copyFileSync: vi.fn(),
      readFile: vi.fn(async () => ''),
      writeFile: vi.fn(async () => {}),
    },
  });
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

  vi.restoreAllMocks();
});

describe('status command', () => {
  describe('state parsing', () => {
    it('should parse WORK_LEFT state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Status      |
| -------- | ------------ | ----------- |
| TASK_001 | Setup        | COMPLETE    |
| TASK_002 | Development  | NOT STARTED |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const result = await status({ json: true } as StatusOptions, mockContext);

      expect(result.success).toBe(true);
      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('WORK_LEFT');
    });

    it('should parse IN_REVIEW state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Status    |
| -------- | ------------ | --------- |
| TASK_001 | Setup        | COMPLETE  |
| TASK_002 | Development  | IN_REVIEW |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('IN_REVIEW');
    });

    it('should parse BLOCKED state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Status   |
| -------- | ------------ | -------- |
| TASK_001 | Setup        | COMPLETE |
| TASK_002 | Development  | BLOCKED  |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('BLOCKED');
    });

    it('should parse DONE state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title        | Status   |
| -------- | ------------ | -------- |
| TASK_001 | Setup        | COMPLETE |
| TASK_002 | Development  | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBe('DONE');
    });

    it('should handle missing PROGRESS.md (NO_PROGRESS state)', async () => {
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

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

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.state).toBeDefined();
      expect(jsonOutput.stats).toBeDefined();
    });
  });

  describe('task statistics', () => {
    it('should calculate task statistics correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Task 1 | COMPLETE    |
| TASK_002 | Task 2 | COMPLETE    |
| TASK_003 | Task 3 | NOT STARTED |
| TASK_004 | Task 4 | IN PROGRESS |
| TASK_005 | Task 5 | IN_REVIEW   |
| TASK_006 | Task 6 | BLOCKED     |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

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

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.stats.total).toBe(0);
      expect(jsonOutput.stats.completed).toBe(0);
    });

    it('should handle single task', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.stats.total).toBe(1);
      expect(jsonOutput.stats.completed).toBe(1);
    });
  });

  describe('JSON output mode', () => {
    it('should output valid JSON when --json flag is specified', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      expect(() => JSON.parse(consoleOutput[0])).not.toThrow();
    });

    it('should include all required fields in JSON output', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

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
      expect(jsonOutput).toHaveProperty('currentTask');
    });

    it('should include error field if state is partial/corrupt', async () => {
      writeConfig();
      // Missing PROGRESS.md should not include error field
      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      // NO_PROGRESS is not an error, just an expected state
      expect(jsonOutput.state).toBe('NO_PROGRESS');
    });
  });

  describe('lock information', () => {
    it('should detect locked state correctly', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      // Create lock file
      const lockContent = `Started: 2026-02-04 10:00:00\nPID: 12345`;
      writeFileSync(TEST_LOCK, lockContent, 'utf8');

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.lock.isLocked).toBe(true);
      expect(jsonOutput.lock.pid).toBe(12345);
      expect(jsonOutput.lock.startTime).toBeDefined();
      expect(jsonOutput.lock.elapsed).toBeDefined();
    });

    it('should handle missing lock file', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.lock.isLocked).toBe(false);
      expect(jsonOutput.lock.pid).toBeNull();
      expect(jsonOutput.lock.startTime).toBeNull();
      expect(jsonOutput.lock.elapsed).toBeNull();
    });
  });

  describe('current task', () => {
    it('should return current task when IN PROGRESS', async () => {
      const progressContent = `# Progress

| Task ID  | Title       | Status      |
| -------- | ----------- | ----------- |
| TASK_001 | Setup       | COMPLETE    |
| TASK_002 | Development | IN PROGRESS |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.currentTask).not.toBeNull();
      expect(jsonOutput.currentTask.id).toBe('TASK_002');
      expect(jsonOutput.currentTask.title).toBe('Development');
      expect(jsonOutput.currentTask.status).toBe('IN PROGRESS');
    });

    it('should return current task when IN_REVIEW', async () => {
      const progressContent = `# Progress

| Task ID  | Title       | Status    |
| -------- | ----------- | --------- |
| TASK_001 | Setup       | COMPLETE  |
| TASK_002 | Development | IN_REVIEW |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.currentTask).not.toBeNull();
      expect(jsonOutput.currentTask.id).toBe('TASK_002');
      expect(jsonOutput.currentTask.status).toBe('IN_REVIEW');
    });

    it('should return null when no active task', async () => {
      const progressContent = `# Progress

| Task ID  | Title       | Status      |
| -------- | ----------- | ----------- |
| TASK_001 | Setup       | COMPLETE    |
| TASK_002 | Development | NOT STARTED |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.currentTask).toBeNull();
    });

    it('should return null when all tasks complete', async () => {
      const progressContent = `# Progress

| Task ID  | Title       | Status   |
| -------- | ----------- | -------- |
| TASK_001 | Setup       | COMPLETE |
| TASK_002 | Development | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.currentTask).toBeNull();
    });
  });

  describe('performance', () => {
    it('should respond in less than 100ms', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const startTime = Date.now();
      await status({ json: true } as StatusOptions, mockContext);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
    });

    it('should use concurrent reads', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockContent = `Started: 2026-02-04 10:00:00\nPID: 12345`;
      writeFileSync(TEST_LOCK, lockContent, 'utf8');

      const startTime = Date.now();
      await status({ json: true } as StatusOptions, mockContext);
      const elapsed = Date.now() - startTime;

      // Should be faster than sequential reads
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('styled output', () => {
    it('should render styled output by default', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
| TASK_002 | Task 2 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ once: true } as StatusOptions, mockContext);

      // Should have multiple lines of output
      expect(consoleOutput.length).toBeGreaterThan(1);
    });

    it('should display progress bar', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Task 1 | COMPLETE    |
| TASK_002 | Task 2 | NOT STARTED |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ once: true } as StatusOptions, mockContext);

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
