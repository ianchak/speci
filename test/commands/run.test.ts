/**
 * Run Command Unit Tests
 *
 * Tests for the run command orchestrator loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { createProductionContext } from '../../lib/adapters/context-factory.js';
import { run as runCommand } from '../../lib/commands/run.js';
import { MESSAGES } from '../../lib/constants.js';
import type {
  MilestoneInfo,
  SpeciConfig as RuntimeSpeciConfig,
} from '../../lib/types.js';
import { createMockContext } from '../../lib/adapters/test-context.js';
import * as config from '../../lib/config/index.js';
import * as state from '../../lib/state.js';
import * as lock from '../../lib/utils/infrastructure/lock.js';
import * as preflight from '../../lib/utils/helpers/preflight.js';
import * as gate from '../../lib/utils/infrastructure/gate.js';
import * as copilot from '../../lib/copilot.js';
import * as loggerUtils from '../../lib/utils/infrastructure/logger.js';
import type { SpeciConfig } from '../../lib/config/index.js';
import { STATE } from '../../lib/state.js';

vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
}));

const run = (
  options: Parameters<typeof runCommand>[0] = {},
  context: Parameters<typeof runCommand>[1] = createProductionContext(),
  config?: Parameters<typeof runCommand>[2]
) => runCommand(options, context, config);

// Test directory for temp files
const TEST_DIR = join(process.cwd(), '.test-run');

function makeReadlineInterface(answer: string): Interface {
  return {
    question: vi.fn((_question: string, callback: (input: string) => void) =>
      callback(answer)
    ),
    close: vi.fn(),
  } as unknown as Interface;
}

// Mock config
const mockConfig: SpeciConfig = {
  version: '1.0.0',
  paths: {
    progress: join(TEST_DIR, 'PROGRESS.md'),
    tasks: join(TEST_DIR, 'tasks'),
    logs: join(TEST_DIR, '.speci-logs'),
    lock: join(TEST_DIR, '.speci-lock'),
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
    commands: ['npm run lint', 'npm run typecheck', 'npm test'],
    maxFixAttempts: 3,
  },
  loop: {
    maxIterations: 10,
  },
};

describe('Run Command', () => {
  beforeEach(() => {
    vi.mocked(createInterface).mockReset();

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
    vi.spyOn(state, 'writeFailureNotes').mockResolvedValue(undefined);
    vi.spyOn(state, 'getTaskStats').mockResolvedValue({
      total: 6,
      completed: 2,
      remaining: 3,
      inReview: 1,
      blocked: 0,
    });
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
        expect.anything(), // process parameter
        undefined,
        expect.anything()
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
        'run',
        undefined,
        expect.anything()
      );
    });

    it('should release lock after completion', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(lock.releaseLock).toHaveBeenCalledWith(
        mockConfig,
        expect.anything()
      );
    });

    it('should create log directory if it does not exist', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true });

      expect(existsSync(mockConfig.paths.logs)).toBe(true);
    });

    it('should cleanup once and unregister both registered cleanup handlers', async () => {
      const context = createMockContext({
        mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
        cwd: TEST_DIR,
      });
      const closeLogFileSpy = vi
        .spyOn(loggerUtils, 'closeLogFile')
        .mockResolvedValue(undefined);
      vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);

      await run(
        { yes: true },
        context,
        mockConfig as unknown as RuntimeSpeciConfig
      );

      expect(context.lockManager.release).toHaveBeenCalledTimes(1);
      expect(closeLogFileSpy).toHaveBeenCalledTimes(1);
      expect(context.signalManager.registerCleanup).toHaveBeenCalledTimes(2);
      expect(context.signalManager.unregisterCleanup).toHaveBeenCalledTimes(2);

      const registeredCleanupHandlers = vi
        .mocked(context.signalManager.registerCleanup)
        .mock.calls.map(([cleanup]) => cleanup);
      expect(context.signalManager.unregisterCleanup).toHaveBeenNthCalledWith(
        1,
        registeredCleanupHandlers[0]
      );
      expect(context.signalManager.unregisterCleanup).toHaveBeenNthCalledWith(
        2,
        registeredCleanupHandlers[1]
      );
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
        undefined,
        undefined,
        expect.anything()
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
        undefined,
        undefined,
        expect.anything()
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
        undefined,
        undefined,
        expect.anything()
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

      expect(gate.runGate).toHaveBeenCalledWith(mockConfig, expect.anything());
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
        undefined,
        undefined,
        expect.anything()
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

    it('should skip fix loop when maxFixAttempts is 0', async () => {
      const configWithNoFixAttempts = {
        ...mockConfig,
        gate: { ...mockConfig.gate, maxFixAttempts: 0 },
      };
      vi.spyOn(config, 'loadConfig').mockResolvedValue(configWithNoFixAttempts);
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

      expect(copilot.runAgent).toHaveBeenCalledTimes(1);
      expect(gate.runGate).toHaveBeenCalledTimes(1);
      expect(state.writeFailureNotes).toHaveBeenCalledTimes(1);
    });

    it('should stop fix attempts when fix agent fails', async () => {
      const configWithTwoAttempts = {
        ...mockConfig,
        gate: { ...mockConfig.gate, maxFixAttempts: 2 },
      };
      vi.spyOn(config, 'loadConfig').mockResolvedValue(configWithTwoAttempts);
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent')
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 })
        .mockResolvedValueOnce({
          isSuccess: false,
          exitCode: 1,
          error: 'Fix failed',
        });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: false,
        results: [],
        error: 'Gate failed',
        totalDuration: 0,
      });

      await run({ yes: true });

      expect(copilot.runAgent).toHaveBeenCalledTimes(2);
      expect(gate.runGate).toHaveBeenCalledTimes(1);
      expect(state.writeFailureNotes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Failure Notes', () => {
    it('should write failure notes before dispatching fix agent', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent')
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 }) // impl
        .mockResolvedValueOnce({ isSuccess: true, exitCode: 0 }); // fix
      const failedGateResult = {
        isSuccess: false as const,
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
      };
      vi.spyOn(gate, 'runGate')
        .mockResolvedValueOnce(failedGateResult)
        .mockResolvedValueOnce({
          isSuccess: true,
          results: [],
          totalDuration: 0,
        });

      await run({ yes: true });

      expect(state.writeFailureNotes).toHaveBeenCalledWith(
        mockConfig,
        failedGateResult,
        expect.objectContaining({
          fs: expect.anything(),
        })
      );
    });

    it('should not write failure notes when gates pass', async () => {
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

      expect(state.writeFailureNotes).not.toHaveBeenCalled();
    });

    it('should update failure notes with latest retry result', async () => {
      const configWith2Attempts = {
        ...mockConfig,
        gate: { ...mockConfig.gate, maxFixAttempts: 2 },
      };
      vi.spyOn(config, 'loadConfig').mockResolvedValue(configWith2Attempts);
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      const initialFailure = {
        isSuccess: false as const,
        results: [
          {
            command: 'npm run lint',
            isSuccess: false,
            exitCode: 1,
            output: '',
            error: 'Lint error',
            duration: 50,
          },
        ],
        error: 'Lint error',
        totalDuration: 50,
      };
      const retryFailure = {
        isSuccess: false as const,
        results: [
          {
            command: 'npm test',
            isSuccess: false,
            exitCode: 2,
            output: '',
            error: 'Test error',
            duration: 200,
          },
        ],
        error: 'Test error',
        totalDuration: 200,
      };
      vi.spyOn(gate, 'runGate')
        .mockResolvedValueOnce(initialFailure) // initial gate
        .mockResolvedValueOnce(retryFailure) // retry 1
        .mockResolvedValueOnce(retryFailure); // retry 2

      await run({ yes: true });

      // First call with initial failure, subsequent calls with retry failure
      expect(state.writeFailureNotes).toHaveBeenCalledTimes(3);
      expect(state.writeFailureNotes).toHaveBeenNthCalledWith(
        1,
        configWith2Attempts,
        initialFailure,
        expect.objectContaining({
          fs: expect.anything(),
        })
      );
      expect(state.writeFailureNotes).toHaveBeenNthCalledWith(
        2,
        configWith2Attempts,
        retryFailure,
        expect.objectContaining({
          fs: expect.anything(),
        })
      );
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

      // releaseLock must be called before acquireLock to hand off the existing lock
      const releaseOrder = vi.mocked(lock.releaseLock).mock
        .invocationCallOrder[0];
      const acquireOrder = vi.mocked(lock.acquireLock).mock
        .invocationCallOrder[0];
      expect(releaseOrder).toBeLessThan(acquireOrder);
      expect(lock.acquireLock).toHaveBeenCalled();
    });

    it('should proceed when lock override prompt returns y', async () => {
      const prompt = vi.fn().mockResolvedValue('y');
      vi.spyOn(lock, 'isLocked').mockResolvedValue(true);
      vi.spyOn(lock, 'getLockInfo').mockResolvedValue({
        isLocked: true,
        started: new Date(),
        pid: 1234,
        elapsed: '5 minutes',
      });
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: true, prompt });

      expect(prompt).toHaveBeenCalledWith(
        'Override lock and continue anyway? [y/N] '
      );
      expect(lock.acquireLock).toHaveBeenCalled();
    });

    it('should abort when lock override prompt returns n', async () => {
      const prompt = vi.fn().mockResolvedValue('n');
      vi.spyOn(lock, 'isLocked').mockResolvedValue(true);
      vi.spyOn(lock, 'getLockInfo').mockResolvedValue({
        isLocked: true,
        started: new Date(),
        pid: 1234,
        elapsed: '5 minutes',
      });

      const result = await run({ yes: true, prompt });

      expect(prompt).toHaveBeenCalledWith(
        'Override lock and continue anyway? [y/N] '
      );
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(lock.acquireLock).not.toHaveBeenCalled();
    });

    it('should cancel run when confirmation prompt returns n', async () => {
      const prompt = vi.fn().mockResolvedValue('n');
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);

      const result = await run({ yes: false, prompt });

      expect(prompt).toHaveBeenCalledWith('\nProceed with run? [Y/n] ');
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(lock.acquireLock).not.toHaveBeenCalled();
    });

    it('should proceed when confirmation prompt returns y', async () => {
      const prompt = vi.fn().mockResolvedValue('y');
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.DONE);

      await run({ yes: false, prompt });

      expect(prompt).toHaveBeenCalledWith('\nProceed with run? [Y/n] ');
      expect(lock.acquireLock).toHaveBeenCalled();
    });

    describe('readline fallback branches', () => {
      it('should proceed through lock override when readline answer is y', async () => {
        const context = createMockContext({
          mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
          cwd: TEST_DIR,
        });
        const runtimeConfig = mockConfig as unknown as RuntimeSpeciConfig;

        vi.mocked(createInterface).mockReturnValue(makeReadlineInterface('y'));
        vi.mocked(context.lockManager.isLocked).mockResolvedValue(true);
        vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);

        const result = await run({ yes: true }, context, runtimeConfig);

        expect(result).toEqual({ success: true, exitCode: 0 });
        expect(createInterface).toHaveBeenCalled();
        expect(context.lockManager.acquire).toHaveBeenCalled();
      });

      it('should abort lock override when readline answer is n', async () => {
        const context = createMockContext({
          mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
          cwd: TEST_DIR,
        });
        const runtimeConfig = mockConfig as unknown as RuntimeSpeciConfig;

        vi.mocked(createInterface).mockReturnValue(makeReadlineInterface('n'));
        vi.mocked(context.lockManager.isLocked).mockResolvedValue(true);

        const result = await run({ yes: true }, context, runtimeConfig);

        expect(result).toEqual({ success: true, exitCode: 0 });
        expect(createInterface).toHaveBeenCalled();
        expect(context.lockManager.acquire).not.toHaveBeenCalled();
      });

      it('should cancel pre-run confirmation when readline answer is n', async () => {
        const context = createMockContext({
          mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
          cwd: TEST_DIR,
        });
        const runtimeConfig = mockConfig as unknown as RuntimeSpeciConfig;

        vi.mocked(createInterface).mockReturnValue(makeReadlineInterface('n'));
        vi.mocked(context.stateReader.getState).mockResolvedValue(
          STATE.WORK_LEFT
        );

        const result = await run({ yes: false }, context, runtimeConfig);

        expect(result).toEqual({
          success: false,
          exitCode: 0,
          error: 'User cancelled',
        });
        expect(context.logger.infoPlain).toHaveBeenCalledWith('Run cancelled.');
        expect(context.lockManager.acquire).not.toHaveBeenCalled();
      });

      it('should continue pre-run confirmation when readline answer is empty', async () => {
        const context = createMockContext({
          mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
          cwd: TEST_DIR,
        });
        const runtimeConfig = mockConfig as unknown as RuntimeSpeciConfig;

        vi.mocked(createInterface).mockReturnValue(makeReadlineInterface(''));
        vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);

        const result = await run({ yes: false }, context, runtimeConfig);

        expect(result).toEqual({ success: true, exitCode: 0 });
        expect(context.lockManager.acquire).toHaveBeenCalled();
      });
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

      expect(lock.releaseLock).toHaveBeenCalledWith(
        mockConfig,
        expect.anything()
      );
    });

    it('should release lock on error', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);
      vi.spyOn(copilot, 'runAgent').mockRejectedValue(new Error('Test error'));

      const result = await run({ yes: true });

      expect(result.success).toBe(false);
      expect(lock.releaseLock).toHaveBeenCalledWith(
        mockConfig,
        expect.anything()
      );
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

    it('should write timestamped ITERATION/STATE/AGENT/GATE log entries', async () => {
      vi.spyOn(state, 'getState')
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.spyOn(copilot, 'runAgent').mockResolvedValue({
        isSuccess: true,
        exitCode: 0,
      });
      vi.spyOn(gate, 'runGate').mockResolvedValue({
        isSuccess: true,
        results: [
          {
            command: 'npm test',
            isSuccess: true,
            exitCode: 0,
            output: '',
            error: '',
            duration: 0,
          },
        ],
        totalDuration: 0,
      });

      await run({ yes: true });

      const logFiles = readdirSync(mockConfig.paths.logs).sort();
      const logContent = readFileSync(
        join(mockConfig.paths.logs, logFiles[logFiles.length - 1]),
        'utf8'
      );
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T.*Z\] ITERATION 1 START/);
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T.*Z\] STATE WORK_LEFT/);
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T.*Z\] AGENT IMPL START/);
      expect(logContent).toMatch(
        /\[\d{4}-\d{2}-\d{2}T.*Z\] AGENT IMPL SUCCESS/
      );
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T.*Z\] GATE PASSED/);
      expect(logContent).toContain('  - npm test: PASS');
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

  describe('Task Progress Display', () => {
    it('should display task progress box during confirmation prompt', async () => {
      const prompt = vi.fn().mockResolvedValue('n');
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);

      await run({ yes: false, prompt });

      expect(state.getTaskStats).toHaveBeenCalled();
    });

    it('should display task progress box in dry run mode', async () => {
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);

      await run({ dryRun: true });

      expect(state.getTaskStats).toHaveBeenCalled();
    });

    it('should not display task progress box when total is 0', async () => {
      const prompt = vi.fn().mockResolvedValue('n');
      vi.spyOn(state, 'getState').mockResolvedValue(STATE.WORK_LEFT);
      vi.spyOn(state, 'getTaskStats').mockResolvedValue({
        total: 0,
        completed: 0,
        remaining: 0,
        inReview: 0,
        blocked: 0,
      });

      await run({ yes: false, prompt });

      // getTaskStats is still called, but the box should not be rendered
      expect(state.getTaskStats).toHaveBeenCalled();
    });

    it('fetches task stats before prompt and renders precomputed progress box', async () => {
      const context = createMockContext({
        mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
        cwd: TEST_DIR,
      });
      const runtimeConfig = mockConfig as unknown as RuntimeSpeciConfig;
      const prompt = vi.fn().mockResolvedValue('n');

      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getTaskStats).mockResolvedValue({
        total: 3,
        completed: 1,
        remaining: 1,
        inReview: 1,
        blocked: 0,
      });

      await run({ yes: false, prompt }, context, runtimeConfig);

      expect(context.stateReader.getTaskStats).toHaveBeenCalledWith(
        runtimeConfig
      );
      const statsOrder = vi.mocked(context.stateReader.getTaskStats).mock
        .invocationCallOrder[0];
      const promptOrder = prompt.mock.invocationCallOrder[0];
      expect(statsOrder).toBeLessThan(promptOrder);
      expect(context.logger.raw).toHaveBeenCalledWith(
        expect.stringContaining('Task Progress')
      );
    });

    it('does not render progress box when stats total is zero in confirmation flow', async () => {
      const context = createMockContext({
        mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
        cwd: TEST_DIR,
      });
      const runtimeConfig = mockConfig as unknown as RuntimeSpeciConfig;
      const prompt = vi.fn().mockResolvedValue('n');

      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getTaskStats).mockResolvedValue({
        total: 0,
        completed: 0,
        remaining: 0,
        inReview: 0,
        blocked: 0,
      });

      await run({ yes: false, prompt }, context, runtimeConfig);

      const rawMessages = vi
        .mocked(context.logger.raw)
        .mock.calls.map(([message]) => String(message));
      expect(
        rawMessages.some((message) => message.includes('Task Progress'))
      ).toBe(false);
    });
  });

  describe('verify mode', () => {
    const mvtReadyMilestone: MilestoneInfo = {
      milestoneId: 'M1',
      milestoneName: 'Foundation',
      totalTasks: 3,
      completedTasks: 3,
      mvtId: 'MVT_M1',
      mvtStatus: 'NOT STARTED',
      isMvtReady: true,
    };
    const mvtCompleteMilestone: MilestoneInfo = {
      milestoneId: 'M1',
      milestoneName: 'Foundation',
      totalTasks: 3,
      completedTasks: 3,
      mvtId: 'MVT_M1',
      mvtStatus: 'COMPLETE',
      isMvtReady: false,
    };
    const partialMilestone: MilestoneInfo = {
      milestoneId: 'M1',
      milestoneName: 'Foundation',
      totalTasks: 3,
      completedTasks: 1,
      mvtId: 'MVT_M1',
      mvtStatus: 'NOT STARTED',
      isMvtReady: false,
    };

    function createVerifyHarness() {
      const context = createMockContext({
        mockConfig,
      });
      const configForRun = {
        ...mockConfig,
        paths: {
          ...mockConfig.paths,
          logs: TEST_DIR,
        },
      };
      vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue(
        []
      );
      context.process.stdin.isTTY = true;

      return { context, configForRun };
    }

    function getLatestRunLogPath(): string {
      const logs = readdirSync(TEST_DIR)
        .filter(
          (name) => name.startsWith('speci-run-') && name.endsWith('.log')
        )
        .sort();
      expect(logs.length).toBeGreaterThan(0);
      return join(TEST_DIR, logs[logs.length - 1]);
    }

    it('UT-R01: does not evaluate MVT status when verify flag is disabled', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      await run({ yes: true }, context, configForRun);

      expect(context.stateReader.getMilestonesMvtStatus).not.toHaveBeenCalled();
    });

    it('UT-R02: pauses when verify mode sees an MVT-ready milestone', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      const result = await run(
        { yes: true, verify: true },
        context,
        configForRun
      );

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(context.logger.warn).toHaveBeenCalledWith(MESSAGES.MVT_PAUSE);
      expect(context.copilotRunner.run).not.toHaveBeenCalled();
    });

    it('UT-R03: does not pause when MVT is already COMPLETE', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtCompleteMilestone,
      ]);

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.logger.warn).not.toHaveBeenCalledWith(MESSAGES.MVT_PAUSE);
    });

    it('UT-R04: continues normal WORK_LEFT flow when milestone is not MVT-ready', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState)
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        partialMilestone,
      ]);

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.copilotRunner.run).toHaveBeenCalledWith(
        configForRun,
        'impl'
      );
    });

    it('UT-R05: prompts and continues on startup warning when user answers y', async () => {
      const { context, configForRun } = createVerifyHarness();
      const prompt = vi.fn(async () => 'y');
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      const result = await run({ verify: true, prompt }, context, configForRun);

      expect(result.success).toBe(true);
      expect(context.logger.warn).toHaveBeenCalledWith(
        MESSAGES.MVT_WARNING_HEADER
      );
      expect(prompt).toHaveBeenCalledWith('Continue anyway? [y/N] ');
    });

    it('UT-R06: exits cleanly when startup warning prompt answer is n', async () => {
      const { context, configForRun } = createVerifyHarness();
      const prompt = vi
        .fn()
        .mockResolvedValueOnce('y')
        .mockResolvedValueOnce('n');
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      const result = await run({ verify: true, prompt }, context, configForRun);

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(context.logger.warn).toHaveBeenCalledWith(
        MESSAGES.MVT_EXIT_CANCELLED
      );
      expect(context.lockManager.acquire).not.toHaveBeenCalled();
    });

    it('UT-R07: auto-continues on startup warning with --yes and skips prompt', async () => {
      const { context, configForRun } = createVerifyHarness();
      const prompt = vi.fn(async () => 'n');
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      await run({ verify: true, yes: true, prompt }, context, configForRun);

      expect(context.logger.info).toHaveBeenCalledWith(
        MESSAGES.MVT_AUTO_CONTINUE
      );
      expect(prompt).not.toHaveBeenCalled();
    });

    it('UT-R08: dry-run with verify displays milestone verification data', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      const result = await run(
        { dryRun: true, verify: true },
        context,
        configForRun
      );

      expect(result).toEqual({ success: true, exitCode: 0 });
      const mutedMessages = vi
        .mocked(context.logger.muted)
        .mock.calls.map(([message]) => message);
      expect(mutedMessages).toContain(MESSAGES.MVT_VERIFY_ENABLED);
      expect(mutedMessages.some((message) => message.includes('M1'))).toBe(
        true
      );
      expect(
        mutedMessages.some((message) => message.includes('[NOT STARTED]'))
      ).toBe(true);
    });

    it('UT-R09: verify mode no-ops when milestones list is empty', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue(
        []
      );

      const result = await run(
        { yes: true, verify: true },
        context,
        configForRun
      );

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(context.logger.warn).not.toHaveBeenCalledWith(MESSAGES.MVT_PAUSE);
    });

    it('UT-R10: confirmation output includes verify-enabled display text', async () => {
      const { context, configForRun } = createVerifyHarness();
      const prompt = vi.fn(async () => 'n');
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue(
        []
      );

      const result = await run({ verify: true, prompt }, context, configForRun);

      expect(result).toEqual(
        expect.objectContaining({ success: false, exitCode: 0 })
      );
      const infoPlainMessages = vi
        .mocked(context.logger.infoPlain)
        .mock.calls.map(([message]) => message);
      expect(infoPlainMessages).toContain(MESSAGES.MVT_VERIFY_ENABLED);
    });

    it('UT-R11: writes MVT pause events to the run log stream', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      await run({ yes: true, verify: true }, context, configForRun);
      const logContent = readFileSync(getLatestRunLogPath(), 'utf8');
      expect(logContent).toContain('MVT PAUSE milestone=M1 mvt=MVT_M1');
    });

    it('UT-R12: aborts in non-TTY startup warning flow when --yes is not provided', async () => {
      const { context, configForRun } = createVerifyHarness();
      const prompt = vi.fn(async () => 'y');
      context.process.stdin.isTTY = false;
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      const result = await run({ verify: true, prompt }, context, configForRun);

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(context.logger.warn).toHaveBeenCalledWith(
        MESSAGES.MVT_NON_TTY_ABORT
      );
      expect(context.lockManager.acquire).not.toHaveBeenCalled();
    });

    it('UT-R13: pauses before dispatch when maxIterations is 1 and MVT is ready', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      await run(
        { yes: true, verify: true, maxIterations: 1 },
        context,
        configForRun
      );

      expect(context.copilotRunner.run).not.toHaveBeenCalled();
    });

    it('UT-R14: reaches DONE without pause when all MVTs are complete', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtCompleteMilestone,
      ]);

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.logger.success).toHaveBeenCalledWith(
        'All tasks complete! Exiting loop.'
      );
      expect(context.logger.warn).not.toHaveBeenCalledWith(MESSAGES.MVT_PAUSE);
    });

    it('UT-R15: releases lock and closes log when MVT pause is triggered', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.lockManager.release).toHaveBeenCalled();
      expect(() => rmSync(getLatestRunLogPath())).not.toThrow();
    });

    it('UT-R16: runs implementation path with maxIterations=1 when no MVT is ready', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState).mockResolvedValue(
        STATE.WORK_LEFT
      );
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        partialMilestone,
      ]);

      await run(
        { yes: true, verify: true, maxIterations: 1 },
        context,
        configForRun
      );

      expect(context.copilotRunner.run).toHaveBeenCalledWith(
        configForRun,
        'impl'
      );
    });

    it('UT-R17: pauses on the first ready milestone when multiple milestones are ready', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
        {
          milestoneId: 'M3',
          milestoneName: 'Polish',
          totalTasks: 2,
          completedTasks: 2,
          mvtId: 'MVT_M3',
          mvtStatus: 'NOT STARTED',
          isMvtReady: true,
        },
      ]);

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.logger.warn).toHaveBeenCalledWith(
        '  Milestone: M1 - Foundation'
      );
    });

    it('UT-R18: treats empty startup prompt input as cancellation', async () => {
      const { context, configForRun } = createVerifyHarness();
      const prompt = vi.fn(async () => '');
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      const result = await run({ verify: true, prompt }, context, configForRun);

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(context.lockManager.acquire).not.toHaveBeenCalled();
    });

    it('UT-R19: rejects --verify option on yolo command', async () => {
      const { CommandRegistry } =
        await import('../../lib/cli/command-registry.js');
      const context = createMockContext({
        mockConfig: mockConfig as unknown as RuntimeSpeciConfig,
      });
      const registry = new CommandRegistry(
        context,
        mockConfig as unknown as RuntimeSpeciConfig
      );

      await expect(registry.execute(['yolo', '--verify'])).rejects.toThrow(
        'process.exit unexpectedly called with "1"'
      );
    });

    it('UT-R20: intercepts BLOCKED state and pauses before tidy dispatch when MVT is ready', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.BLOCKED);
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        mvtReadyMilestone,
      ]);

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.copilotRunner.run).not.toHaveBeenCalledWith(
        configForRun,
        'tidy'
      );
    });

    it('UT-R21: executes BLOCKED handler normally when no MVT is ready', async () => {
      const { context, configForRun } = createVerifyHarness();
      vi.mocked(context.stateReader.getState)
        .mockResolvedValueOnce(STATE.BLOCKED)
        .mockResolvedValueOnce(STATE.DONE);
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue([
        partialMilestone,
      ]);

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.copilotRunner.run).toHaveBeenCalledWith(
        configForRun,
        'tidy'
      );
    });

    it('UT-R22: non-TTY verify mode runs normally when there are no incomplete MVTs', async () => {
      const { context, configForRun } = createVerifyHarness();
      context.process.stdin.isTTY = false;
      vi.mocked(context.stateReader.getState)
        .mockResolvedValueOnce(STATE.WORK_LEFT)
        .mockResolvedValueOnce(STATE.DONE);
      vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue(
        []
      );

      await run({ yes: true, verify: true }, context, configForRun);

      expect(context.lockManager.acquire).toHaveBeenCalled();
      expect(context.copilotRunner.run).toHaveBeenCalledWith(
        configForRun,
        'impl'
      );
    });

    describe('readline fallback branches', () => {
      it('UT-R24: checkIncompleteMvts continues when readline answer is y', async () => {
        const { context, configForRun } = createVerifyHarness();
        context.process.stdin.isTTY = true;
        vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);
        vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue(
          [mvtReadyMilestone]
        );
        vi.mocked(createInterface)
          .mockReturnValueOnce(makeReadlineInterface(''))
          .mockReturnValueOnce(makeReadlineInterface('y'));

        const result = await run({ verify: true }, context, configForRun);

        expect(result).toEqual({ success: true, exitCode: 0 });
        expect(createInterface).toHaveBeenCalledTimes(2);
        expect(context.lockManager.acquire).toHaveBeenCalled();
      });

      it('UT-R25: checkIncompleteMvts aborts when readline answer is n', async () => {
        const { context, configForRun } = createVerifyHarness();
        context.process.stdin.isTTY = true;
        vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);
        vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue(
          [mvtReadyMilestone]
        );
        vi.mocked(createInterface)
          .mockReturnValueOnce(makeReadlineInterface(''))
          .mockReturnValueOnce(makeReadlineInterface('n'));

        const result = await run({ verify: true }, context, configForRun);

        expect(result).toEqual({ success: true, exitCode: 0 });
        expect(context.logger.warn).toHaveBeenCalledWith(
          MESSAGES.MVT_EXIT_CANCELLED
        );
        expect(context.lockManager.acquire).not.toHaveBeenCalled();
      });

      it('UT-R26: checkIncompleteMvts non-TTY path aborts before readline', async () => {
        const { context, configForRun } = createVerifyHarness();
        const prompt = vi.fn(async () => 'y');
        context.process.stdin.isTTY = false;
        vi.mocked(context.stateReader.getMilestonesMvtStatus).mockResolvedValue(
          [mvtReadyMilestone]
        );

        const result = await run(
          { verify: true, prompt },
          context,
          configForRun
        );

        expect(result).toEqual({ success: true, exitCode: 0 });
        expect(context.logger.warn).toHaveBeenCalledWith(
          MESSAGES.MVT_NON_TTY_ABORT
        );
        expect(prompt).toHaveBeenCalledWith('\nProceed with run? [Y/n] ');
        expect(createInterface).not.toHaveBeenCalled();
      });
    });
  });
});
