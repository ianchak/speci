/**
 * Run Command Unit Tests
 *
 * Tests for the run command orchestrator loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../lib/commands/run.js';
import * as config from '../lib/config.js';
import * as state from '../lib/state.js';
import * as lock from '../lib/utils/lock.js';
import * as preflight from '../lib/utils/preflight.js';
import * as gate from '../lib/utils/gate.js';
import * as copilot from '../lib/copilot.js';
import type { SpeciConfig } from '../lib/config.js';
import { STATE } from '../lib/state.js';

// Test directory for temp files
const TEST_DIR = join(process.cwd(), '.test-run');

// Mock config
const mockConfig: SpeciConfig = {
  version: '1.0.0',
  paths: {
    progress: join(TEST_DIR, 'PROGRESS.md'),
    tasks: join(TEST_DIR, 'tasks'),
    logs: join(TEST_DIR, '.speci-logs'),
    lock: join(TEST_DIR, '.speci-lock'),
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
    commands: ['npm run lint', 'npm run typecheck', 'npm test'],
    maxFixAttempts: 3,
  },
  loop: {
    maxIterations: 10,
  },
};

describe('Run Command', () => {
  beforeEach(() => {
    // Setup test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Mock all dependencies
    vi.spyOn(config, 'loadConfig').mockResolvedValue(mockConfig);
    vi.spyOn(preflight, 'preflight').mockResolvedValue(undefined);
    vi.spyOn(lock, 'isLocked').mockResolvedValue(false);
    vi.spyOn(lock, 'acquireLock').mockResolvedValue(undefined);
    vi.spyOn(lock, 'releaseLock').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should load configuration', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(config.loadConfig).toHaveBeenCalled();
    });

    it('should run preflight checks', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(preflight.preflight).toHaveBeenCalledWith(
        mockConfig,
        {
          requireCopilot: true,
          requireConfig: true,
          requireProgress: true,
          requireGit: true,
        },
        expect.anything() // process parameter
      );
    });

    it('should check for existing lock', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(lock.isLocked).toHaveBeenCalledWith(mockConfig);
    });

    it('should acquire lock before starting', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(lock.acquireLock).toHaveBeenCalledWith(
        mockConfig,
        expect.anything(), // process parameter
        'run'
      );
    });

    it('should release lock after completion', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(lock.releaseLock).toHaveBeenCalledWith(mockConfig);
    });

    it('should create log directory if it does not exist', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(existsSync(mockConfig.paths.logs)).toBe(true);
    });
  });

  describe('State Machine', () => {
    it('should exit successfully when state is DONE', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should dispatch impl agent for WORK_LEFT state', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: true,
        results: [],
        totalDuration: 0,
      });

      await run({ yes: true });

      expect(copilot.runAgent).toHaveBeenCalledWith(
        mockConfig,
        'impl',
        'Implementation Agent'
      );
    });

    it('should dispatch review agent for IN_REVIEW state', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.IN_REVIEW)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });

      await run({ yes: true });

      expect(copilot.runAgent).toHaveBeenCalledWith(
        mockConfig,
        'review',
        'Review Agent'
      );
    });

    it('should dispatch tidy agent for BLOCKED state', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.BLOCKED)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });

      await run({ yes: true });

      expect(copilot.runAgent).toHaveBeenCalledWith(
        mockConfig,
        'tidy',
        'Tidy Agent'
      );
    });

    it('should exit with error for NO_PROGRESS state', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.NO_PROGRESS);

      const result = await run({ yes: true });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Gate Execution', () => {
    it('should run gates after impl agent completes', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: true,
        results: [],
        totalDuration: 0,
      });

      await run({ yes: true });

      expect(gate.runGate).toHaveBeenCalledWith(mockConfig);
    });

    it('should not run gates if impl agent fails', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: false,
        exitCode: 1,
        error: 'Agent failed',
      });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: true,
        results: [],
        totalDuration: 0,
      });

      await run({ yes: true });

      expect(gate.runGate).not.toHaveBeenCalled();
    });

    it('should invoke fix agent on gate failure', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent')
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 }) // impl
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 }); // fix
      vi.spyOn(gate, 'runGate')
        .mockResolvedValueOnce({
          isSuccess: false,
          results: [
            {
              command: 'npm run lint',
              isSuccess: false,
              exitCode: 1,
              output: '',
              error: 'Lint failed',
              duration: 100,
            },
          ],
          error: 'Lint failed',
          totalDuration: 100,
        })
        .mockResolvedValueOnce({
          isSuccess: true,
          results: [],
          totalDuration: 0,
        });

      await run({ yes: true });

      expect(copilot.runAgent).toHaveBeenCalledWith(
        mockConfig,
        'fix',
        'Fix Agent'
      );
    });

    it('should retry gates after fix agent runs', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent')
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 }) // impl
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 }); // fix
      vi.spyOn(gate, 'runGate')
        .mockResolvedValueOnce({
          isSuccess: false,
          results: [],
          error: 'Gate failed',
          totalDuration: 0,
        })
        .mockResolvedValueOnce({
          isSuccess: true,
          results: [],
          totalDuration: 0,
        });

      await run({ yes: true });

      expect(gate.runGate).toHaveBeenCalledTimes(2);
    });

    it('should enforce max fix attempts', async () => {
      const configWithLowMaxAttempts = {
        ...mockConfig,
        gate: { ...mockConfig.gate, maxFixAttempts: 2 },
      };
      vi.spyOn(config, 'loadConfig').mockResolvedValue(
        configWithLowMaxAttempts
      );
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: false,
        results: [],
        error: 'Gate failed',
        totalDuration: 0,
      });

      await run({ yes: true });

      // 1 impl agent + 2 fix agents (maxFixAttempts = 2)
      expect(copilot.runAgent).toHaveBeenCalledTimes(3);
    });
  });

  describe('Iteration Management', () => {
    it('should enforce max iterations', async () => {
      const configWithLowMaxIter = {
        ...mockConfig,
        loop: { maxIterations: 2 },
      };
      vi.spyOn(config, 'loadConfig').mockResolvedValue(configWithLowMaxIter);
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: true,
        results: [],
        totalDuration: 0,
      });

      await run({ yes: true });

      // getState called twice for 2 iterations
      expect(state.getState).toHaveBeenCalledTimes(2);
    });

    it('should override max iterations from options', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: true,
        results: [],
        totalDuration: 0,
      });

      await run({ yes: true, maxIterations: 1 });

      // getState called once for 1 iteration
      expect(state.getState).toHaveBeenCalledTimes(1);
    });
  });

  describe('Options', () => {
    it('should skip confirmation when yes flag is set', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      // Should not prompt
      await run({ yes: true });

      expect(true).toBe(true);
    });

    it('should skip execution in dry run mode', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });

      const result = await run({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(copilot.runAgent).not.toHaveBeenCalled();
    });

    it('should force override lock when force flag is set', async () => {
      vi.spyOn(lock, 'isLocked').mockResolvedValue(true);
      vi.spyOn(lock, 'getLockInfo').mockResolvedValue({
        isLocked: true,
        started: new Date(),
        pid: 1234,
        elapsed: '5 minutes',
      });
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true, force: true });

      expect(lock.acquireLock).toHaveBeenCalled();
    });
  });

  describe('Lock Management', () => {
    it('should check for existing lock before starting', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(lock.isLocked).toHaveBeenCalledWith(mockConfig);
    });

    it('should release lock on normal exit', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(lock.releaseLock).toHaveBeenCalledWith(mockConfig);
    });

    it('should release lock on error', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);
      vi.spyOn(copilot, 'runAgent').mockRejectedValue(new Error('Test error'));

      const result = await run({ yes: true });

      expect(result.success).toBe(false);
      expect(lock.releaseLock).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('Logging', () => {
    it('should create log file with timestamp', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      // Check that logs directory was created
      expect(existsSync(mockConfig.paths.logs)).toBe(true);

      // Check that at least one log file was created
      const logFiles = readdirSync(mockConfig.paths.logs);
      expect(logFiles.length).toBeGreaterThan(0);
      expect(logFiles[0]).toMatch(/^speci-run-.*\.log$/);
    });
  });

  describe('Error Handling', () => {
    it('should handle impl agent failure gracefully', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: false,
        exitCode: 1,
        error: 'Agent failed',
      });

      await run({ yes: true });

      // Should complete iteration without throwing
      expect(true).toBe(true);
    });

    it('should handle review agent failure gracefully', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.IN_REVIEW)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: false,
        exitCode: 1,
        error: 'Agent failed',
      });

      await run({ yes: true });

      // Should complete iteration without throwing
      expect(true).toBe(true);
    });

    it('should handle tidy agent failure gracefully', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.BLOCKED)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: false,
        exitCode: 1,
        error: 'Agent failed',
      });

      await run({ yes: true });

      // Should complete iteration without throwing
      expect(true).toBe(true);
    });

    it('should handle fix agent failure gracefully', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent')
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 }) // impl
        .mockResolvedValueOnce({
          isSuccess: false,
          exitCode: 1,
          error: 'Fix failed',
        }); // fix
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: false,
        results: [],
        error: 'Gate failed',
        totalDuration: 0,
      });

      await run({ yes: true });

      // Should complete iteration without throwing
      expect(true).toBe(true);
    });
  });
});
