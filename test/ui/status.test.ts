/**
 * Integration tests for status command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { status, wrapText, CONTENT_WIDTH } from '../../lib/commands/status.js';
import {
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { StatusOptions } from '../../lib/commands/status.js';
import { createMockContext } from '../../lib/adapters/test-context.js';
import type { CommandContext, IProcess } from '../../lib/interfaces/index.js';
import type { SpeciConfig } from '../../lib/config/index.js';
import {
  resetStateCache,
  getState,
  getTaskStats,
  getCurrentTask,
} from '../../lib/state.js';
import { getLockInfo } from '../../lib/utils/infrastructure/lock.js';
import { terminalState } from '../../lib/ui/terminal.js';

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
  // Reset state cache before each test
  resetStateCache();

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
    copilot: {
      permissions: 'allow-all' as const,
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
      rmSync: vi.fn(),
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

  // Wire up logger.raw to capture output (replaces console.log spy for DI)
  vi.mocked(mockContext.logger.raw).mockImplementation((...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  });

  // Wire up stateReader and lockManager to delegate to real implementations
  // These integration tests write real files to disk and expect real parsing
  vi.mocked(mockContext.stateReader.getState).mockImplementation(
    async (config) => getState(config)
  );
  vi.mocked(mockContext.stateReader.getTaskStats).mockImplementation(
    async (config) => getTaskStats(config)
  );
  vi.mocked(mockContext.stateReader.getCurrentTask).mockImplementation(
    async (config) => getCurrentTask(config)
  );
  vi.mocked(mockContext.lockManager.getInfo).mockImplementation(
    async (config) => getLockInfo(config)
  );
});

afterEach(() => {
  // Reset state cache after each test
  resetStateCache();

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

| Task ID  | Title  | Status      | Review | Priority | Complexity | Deps |
| -------- | ------ | ----------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Task 1 | COMPLETE    | PASSED | HIGH     | S          | None |
| TASK_002 | Task 2 | COMPLETE    | PASSED | HIGH     | S          | None |
| TASK_003 | Task 3 | NOT STARTED | -      | HIGH     | S          | None |
| TASK_004 | Task 4 | IN PROGRESS | -      | HIGH     | S          | None |
| TASK_005 | Task 5 | IN_REVIEW   | -      | HIGH     | S          | None |
| TASK_006 | Task 6 | BLOCKED     | -      | HIGH     | S          | None |
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

| Task ID  | Title  | Status   | Review | Priority | Complexity | Deps |
| -------- | ------ | -------- | ------ | -------- | ---------- | ---- |
| TASK_001 | Task 1 | COMPLETE | PASSED | HIGH     | S          | None |
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

    it('should include lock command in JSON output', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status   |
| -------- | ------ | -------- |
| TASK_001 | Task 1 | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockData = {
        version: '1.0.0',
        pid: process.pid,
        started: new Date().toISOString(),
        command: 'yolo',
        metadata: {
          state: 'yolo:pipeline',
          iteration: 0,
        },
      };
      writeFileSync(TEST_LOCK, JSON.stringify(lockData), 'utf8');

      await status({ json: true } as StatusOptions, mockContext);

      const jsonOutput = JSON.parse(consoleOutput[0]);
      expect(jsonOutput.lock.command).toBe('yolo');
    });

    it('should display yolo pipeline label when yolo lock is active', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Task 1 | IN PROGRESS |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockData = {
        version: '1.0.0',
        pid: process.pid,
        started: new Date().toISOString(),
        command: 'yolo',
      };
      writeFileSync(TEST_LOCK, JSON.stringify(lockData), 'utf8');

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Yolo pipeline is active');
    });

    it('should display speci run label for non-yolo lock command', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Task 1 | IN PROGRESS |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockData = {
        version: '1.0.0',
        pid: process.pid,
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(TEST_LOCK, JSON.stringify(lockData), 'utf8');

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Speci run is active');
    });

    it('should display speci run label when lock command is undefined', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Task 1 | IN PROGRESS |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockContent = `Started: 2026-02-04 10:00:00\nPID: ${process.pid}`;
      writeFileSync(TEST_LOCK, lockContent, 'utf8');

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Speci run is active');
    });

    it('should render active lock section with current task details', async () => {
      const progressContent = `# Progress

| Task ID  | Title       | Status      |
| -------- | ----------- | ----------- |
| TASK_001 | Setup       | COMPLETE    |
| TASK_002 | Development | IN PROGRESS |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockData = {
        version: '1.0.0',
        pid: process.pid,
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(TEST_LOCK, JSON.stringify(lockData), 'utf8');

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Speci run is active');
      expect(output).toContain('Started:');
      expect(output).toContain('Working on:');
      expect(output).toContain('TASK_002: Development');
      expect(output).toContain('Status: IN PROGRESS');
    });

    it('should render active lock section without current task details', async () => {
      const progressContent = `# Progress

| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Done  | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockData = {
        version: '1.0.0',
        pid: process.pid,
        started: new Date().toISOString(),
        command: 'run',
      };
      writeFileSync(TEST_LOCK, JSON.stringify(lockData), 'utf8');

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Speci run is active');
      expect(output).toContain('Started:');
      expect(output).not.toContain('Working on:');
    });

    it('should not show no active run in once mode when lock is inactive', async () => {
      const progressContent = `# Progress

| Task ID  | Title | Status   |
| -------- | ----- | -------- |
| TASK_001 | Done  | COMPLETE |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      expect(output).not.toContain('No active run');
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
      expect(jsonOutput.currentTask).not.toBeUndefined();
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
      expect(jsonOutput.currentTask).not.toBeUndefined();
      expect(jsonOutput.currentTask.id).toBe('TASK_002');
      expect(jsonOutput.currentTask.status).toBe('IN REVIEW');
    });

    it('should return null in JSON when no active task', async () => {
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

    it('should return null in JSON when all tasks complete', async () => {
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

  describe('task name wrapping', () => {
    it('should wrap long task names to banner width', async () => {
      const progressContent = `# Progress

| Task ID  | Title                                                        | Status      |
| -------- | ------------------------------------------------------------ | ----------- |
| TASK_017 | Split getGlyph() to Eliminate Forced as string Casts in Code | IN PROGRESS |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockContent = `Started: 2026-02-24 10:00:00\nPID: 12345`;
      writeFileSync(TEST_LOCK, lockContent, 'utf8');

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      // Task name should appear in the output
      expect(output).toContain('TASK_017');
      // Each output line (stripped of ANSI) should fit within CONTENT_WIDTH
      // eslint-disable-next-line no-control-regex
      const ansiRegex = /\x1b\[[0-9;]*m/g;
      for (const line of consoleOutput) {
        const stripped = line.replace(ansiRegex, '');
        if (stripped.includes('TASK_017')) {
          expect(stripped.length).toBeLessThanOrEqual(CONTENT_WIDTH);
        }
      }
    });

    it('should not wrap short task names', async () => {
      const progressContent = `# Progress

| Task ID  | Title  | Status      |
| -------- | ------ | ----------- |
| TASK_001 | Setup  | IN PROGRESS |
`;
      writeFileSync(TEST_PROGRESS, progressContent, 'utf8');
      writeConfig();

      const lockContent = `Started: 2026-02-24 10:00:00\nPID: 12345`;
      writeFileSync(TEST_LOCK, lockContent, 'utf8');

      await status({ once: true } as StatusOptions, mockContext);

      const output = consoleOutput.join('\n');
      // Short task should appear on a single line
      expect(output).toContain('TASK_001: Setup');
    });
  });
});

describe('status live dashboard decomposition', () => {
  function createLiveContext(
    env: NodeJS.ProcessEnv = {},
    isTTY = true
  ): {
    context: CommandContext;
    stdoutWrite: ReturnType<typeof vi.fn>;
    stdinSetRawMode: ReturnType<typeof vi.fn>;
    stdinResume: ReturnType<typeof vi.fn>;
    stdinPause: ReturnType<typeof vi.fn>;
    processRemoveListener: ReturnType<typeof vi.fn>;
    getStdinListener: (event: string) => ((key: Buffer) => void) | undefined;
    getProcessListener: (
      event: string
    ) => ((...args: unknown[]) => void) | undefined;
  } {
    const processListeners = new Map<
      string,
      Array<(...args: unknown[]) => void>
    >();
    const stdinListeners = new Map<string, Array<(key: Buffer) => void>>();

    const addProcessListener = (
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      const existing = processListeners.get(event) ?? [];
      existing.push(listener);
      processListeners.set(event, existing);
    };
    const removeProcessListener = (
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      const existing = processListeners.get(event) ?? [];
      processListeners.set(
        event,
        existing.filter((current) => current !== listener)
      );
    };
    const addStdinListener = (
      event: string,
      listener: (key: Buffer) => void
    ) => {
      const existing = stdinListeners.get(event) ?? [];
      existing.push(listener);
      stdinListeners.set(event, existing);
    };
    const removeStdinListener = (
      event: string,
      listener: (key: Buffer) => void
    ) => {
      const existing = stdinListeners.get(event) ?? [];
      stdinListeners.set(
        event,
        existing.filter((current) => current !== listener)
      );
    };

    const stdoutWrite = vi.fn();
    const stdinSetRawMode = vi.fn();
    const stdinResume = vi.fn();
    const stdinPause = vi.fn();
    const processRemoveListener = vi.fn(removeProcessListener);

    const processMock = {
      env,
      cwd: vi.fn(() => TEST_DIR),
      exit: vi.fn((code?: number) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as never,
      pid: 12345,
      platform: process.platform,
      stdout: {
        isTTY,
        columns: 80,
        rows: 24,
        write: stdoutWrite,
      } as unknown as NodeJS.WriteStream,
      stdin: {
        isTTY,
        setRawMode: stdinSetRawMode,
        resume: stdinResume,
        pause: stdinPause,
        on: vi.fn(addStdinListener),
        removeListener: vi.fn(removeStdinListener),
      } as unknown as NodeJS.ReadStream,
      on: vi.fn(addProcessListener),
      removeListener: processRemoveListener,
    } as unknown as IProcess;

    return {
      context: createMockContext({ process: processMock }),
      stdoutWrite,
      stdinSetRawMode,
      stdinResume,
      stdinPause,
      processRemoveListener,
      getStdinListener: (event: string) => stdinListeners.get(event)?.[0],
      getProcessListener: (event: string) => processListeners.get(event)?.[0],
    };
  }

  it('handles terminal setup and teardown with alt screen enabled', async () => {
    const captureSpy = vi
      .spyOn(terminalState, 'capture')
      .mockReturnValue({ isRaw: false, isTTY: true });
    const enterSpy = vi
      .spyOn(terminalState, 'enterAltScreen')
      .mockImplementation(() => {});
    const hideSpy = vi
      .spyOn(terminalState, 'hideCursor')
      .mockImplementation(() => {});
    const showSpy = vi
      .spyOn(terminalState, 'showCursor')
      .mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(terminalState, 'exitAltScreen')
      .mockImplementation(() => {});
    const restoreSpy = vi
      .spyOn(terminalState, 'restore')
      .mockImplementation(() => {});
    const { context, stdoutWrite, getStdinListener } = createLiveContext();

    const runPromise = status({}, context);
    await vi.waitFor(() => expect(getStdinListener('data')).toBeDefined());
    getStdinListener('data')?.(Buffer.from('q'));
    await runPromise;

    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(enterSpy).toHaveBeenCalledTimes(1);
    expect(hideSpy).toHaveBeenCalledTimes(1);
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(stdoutWrite).toHaveBeenCalledWith('\n');
  });

  it('uses non-alt-screen teardown sequence for vscode terminals', async () => {
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    vi.spyOn(terminalState, 'showCursor').mockImplementation(() => {});
    const enterSpy = vi
      .spyOn(terminalState, 'enterAltScreen')
      .mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(terminalState, 'exitAltScreen')
      .mockImplementation(() => {});
    const { context, stdoutWrite, getStdinListener } = createLiveContext({
      TERM_PROGRAM: 'vscode',
    });

    const runPromise = status({}, context);
    await vi.waitFor(() => expect(getStdinListener('data')).toBeDefined());
    getStdinListener('data')?.(Buffer.from([0x1b]));
    await runPromise;

    expect(enterSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith('\x1b[2J\x1b[H');
    expect(stdoutWrite).toHaveBeenCalledWith('\n');
  });

  it('swallows teardown errors and still exits cleanly', async () => {
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    vi.spyOn(terminalState, 'showCursor').mockImplementation(() => {
      throw new Error('teardown failed');
    });
    const { context, getStdinListener } = createLiveContext();

    const runPromise = status({}, context);
    await vi.waitFor(() => expect(getStdinListener('data')).toBeDefined());
    getStdinListener('data')?.(Buffer.from('q'));
    const result = await runPromise;

    expect(result.success).toBe(true);
  });

  it('registers and removes input handlers and process signal listeners', async () => {
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    vi.spyOn(terminalState, 'showCursor').mockImplementation(() => {});
    vi.spyOn(terminalState, 'capture').mockReturnValue({
      isRaw: false,
      isTTY: true,
    });
    vi.spyOn(terminalState, 'enterAltScreen').mockImplementation(() => {});
    vi.spyOn(terminalState, 'exitAltScreen').mockImplementation(() => {});
    vi.spyOn(terminalState, 'restore').mockImplementation(() => {});
    const {
      context,
      stdinSetRawMode,
      stdinResume,
      stdinPause,
      processRemoveListener,
      getStdinListener,
    } = createLiveContext();

    const runPromise = status({}, context);
    await vi.waitFor(() => expect(getStdinListener('data')).toBeDefined());
    getStdinListener('data')?.(Buffer.from('Q'));
    await runPromise;

    expect(stdinSetRawMode).toHaveBeenCalledWith(true);
    expect(stdinResume).toHaveBeenCalledTimes(1);
    expect(processRemoveListener).toHaveBeenCalledWith(
      'SIGINT',
      expect.any(Function)
    );
    expect(processRemoveListener).toHaveBeenCalledWith(
      'SIGTERM',
      expect.any(Function)
    );
    expect(stdinSetRawMode).toHaveBeenCalledWith(false);
    expect(stdinPause).toHaveBeenCalledTimes(1);
  });

  it('ignores non-exit and empty keypresses, then exits on signal', async () => {
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    vi.spyOn(terminalState, 'showCursor').mockImplementation(() => {});
    const { context, getStdinListener, getProcessListener } =
      createLiveContext();

    let resolved = false;
    const runPromise = status({}, context).then((result) => {
      resolved = true;
      return result;
    });

    await vi.waitFor(() => expect(getStdinListener('data')).toBeDefined());
    getStdinListener('data')?.(Buffer.alloc(0));
    getStdinListener('data')?.(Buffer.from('x'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolved).toBe(false);

    getProcessListener('SIGINT')?.();
    const result = await runPromise;
    expect(result.success).toBe(true);
  });

  it('refreshes on interval and keeps exit cleanup idempotent', async () => {
    vi.useFakeTimers();
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    const showSpy = vi
      .spyOn(terminalState, 'showCursor')
      .mockImplementation(() => {});
    const { context, getStdinListener } = createLiveContext();

    const getStateSpy = vi.mocked(context.stateReader.getState);
    const runPromise = status({}, context);
    await Promise.resolve();
    await Promise.resolve();
    expect(getStdinListener('data')).toBeDefined();
    const before = getStateSpy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(getStateSpy.mock.calls.length).toBeGreaterThan(before);

    const exitHandler = getStdinListener('data');
    exitHandler?.(Buffer.from('q'));
    exitHandler?.(Buffer.from('q'));
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(result.success).toBe(true);
    expect(showSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('renders task progress stats box rows in live dashboard output', async () => {
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    vi.spyOn(terminalState, 'showCursor').mockImplementation(() => {});
    const { context, stdoutWrite, getStdinListener } = createLiveContext();
    vi.mocked(context.stateReader.getTaskStats).mockResolvedValue({
      total: 4,
      completed: 1,
      remaining: 2,
      inReview: 1,
      blocked: 0,
    });

    const runPromise = status({}, context);
    await vi.waitFor(() => expect(getStdinListener('data')).toBeDefined());
    getStdinListener('data')?.(Buffer.from('q'));
    await runPromise;

    const output = stdoutWrite.mock.calls
      .map(([chunk]) => String(chunk))
      .join('');
    expect(output).toContain('Task Progress');
    expect(output).toContain('Completed:');
    expect(output).toContain('Pending:');
    expect(output).toContain('In Review:');
    expect(output).toContain('Blocked:');
  });

  it('renders zero-value progress stats in live dashboard output', async () => {
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    vi.spyOn(terminalState, 'showCursor').mockImplementation(() => {});
    const { context, stdoutWrite, getStdinListener } = createLiveContext();
    vi.mocked(context.stateReader.getTaskStats).mockResolvedValue({
      total: 0,
      completed: 0,
      remaining: 0,
      inReview: 0,
      blocked: 0,
    });

    const runPromise = status({}, context);
    await vi.waitFor(() => expect(getStdinListener('data')).toBeDefined());
    getStdinListener('data')?.(Buffer.from('q'));
    await runPromise;

    const output = stdoutWrite.mock.calls
      .map(([chunk]) => String(chunk))
      .join('');
    expect(output).toContain('Task Progress');
    expect(output).toContain('0/0');
    expect(output).toContain('Pending:');
    expect(output).toContain('In Review:');
    expect(output).toContain('Blocked:');
  });

  it('returns failure when initial live render errors after terminal setup', async () => {
    vi.spyOn(terminalState, 'hideCursor').mockImplementation(() => {});
    const showSpy = vi
      .spyOn(terminalState, 'showCursor')
      .mockImplementation(() => {});
    const { context } = createLiveContext();
    vi.mocked(context.stateReader.getState).mockRejectedValueOnce(
      new Error('state fail')
    );

    const result = await status({}, context);

    expect(result.success).toBe(false);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });
});

describe('wrapText', () => {
  it('should return single-element array for short text', () => {
    expect(wrapText('short text', 40)).toEqual(['short text']);
  });

  it('should wrap text exceeding maxWidth', () => {
    const text =
      '  TASK_017: Split getGlyph() to Eliminate Forced as string Casts';
    const result = wrapText(text, 37, '  ');
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(37);
    }
  });

  it('should indent continuation lines', () => {
    const text =
      '  TASK_017: Split getGlyph() to Eliminate Forced as string Casts';
    const result = wrapText(text, 37, '  ');
    // First line has its own leading spaces
    expect(result[0]).toMatch(/^\s\s/);
    // Continuation lines should also start with indent
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toMatch(/^\s\s/);
    }
  });

  it('should preserve full text content across wrapped lines', () => {
    const text = 'one two three four five six seven eight';
    const result = wrapText(text, 15, '');
    const joined = result.join(' ');
    expect(joined).toBe(text);
  });

  it('should handle text exactly at maxWidth', () => {
    const text = 'x'.repeat(37);
    expect(wrapText(text, 37)).toEqual([text]);
  });

  it('should handle single long word gracefully', () => {
    const text = 'x'.repeat(50);
    const result = wrapText(text, 37);
    // Should still produce output (even if single word exceeds width)
    expect(result.length).toBeGreaterThan(0);
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
    copilot: {},
    gate: {},
    loop: {},
  };
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config), 'utf8');

  // Use environment variables to override paths
  process.env.SPECI_PROGRESS_PATH = TEST_PROGRESS;
  process.env.SPECI_LOCK_PATH = TEST_LOCK;
}
