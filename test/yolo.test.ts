import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createMockContext } from '../lib/adapters/test-context.js';
import { yolo } from '../lib/commands/yolo.js';
import type { SpeciConfig } from '../lib/config.js';
import { createError } from '../lib/errors.js';
import * as planModule from '../lib/commands/plan.js';
import * as runModule from '../lib/commands/run.js';
import * as taskModule from '../lib/commands/task.js';
import * as lockModule from '../lib/utils/lock.js';
import * as preflightModule from '../lib/utils/preflight.js';
import * as signalsModule from '../lib/utils/signals.js';

describe('yolo command', () => {
  const mockConfig: SpeciConfig = {
    version: '1.0.0',
    paths: {
      progress: 'docs/PROGRESS.md',
      tasks: 'docs/tasks',
      logs: '.speci-logs',
      lock: '.speci-lock',
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
      commands: ['npm test'],
      maxFixAttempts: 3,
    },
    loop: {
      maxIterations: 10,
    },
  };

  beforeEach(() => {
    vi.spyOn(preflightModule, 'preflight').mockResolvedValue(undefined);
    vi.spyOn(lockModule, 'acquireLock').mockResolvedValue(undefined);
    vi.spyOn(lockModule, 'releaseLock').mockResolvedValue(undefined);
    vi.spyOn(lockModule, 'getLockInfo').mockResolvedValue({
      isLocked: true,
      started: null,
      pid: 12345,
      elapsed: '00:01:00',
      command: 'run',
      isStale: false,
      metadata: undefined,
    });
    vi.spyOn(signalsModule, 'registerCleanup').mockImplementation(() => {});
    vi.spyOn(signalsModule, 'unregisterCleanup').mockImplementation(() => {});
    vi.spyOn(signalsModule, 'installSignalHandlers').mockImplementation(
      () => {}
    );
    vi.spyOn(signalsModule, 'removeSignalHandlers').mockImplementation(
      () => {}
    );
    vi.spyOn(planModule, 'plan').mockResolvedValue({
      success: true,
      exitCode: 0,
    });
    vi.spyOn(taskModule, 'task').mockResolvedValue({
      success: true,
      exitCode: 0,
    });
    vi.spyOn(runModule, 'run').mockResolvedValue({
      success: true,
      exitCode: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads config when not provided and returns success', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    const result = await yolo({ prompt: 'test' }, context);

    expect(context.configLoader.load).toHaveBeenCalledTimes(1);
    expect(preflightModule.preflight).toHaveBeenCalledWith(
      expect.any(Object),
      {
        requireCopilot: true,
        requireConfig: true,
        requireProgress: true,
      },
      context.process
    );
    expect(result).toEqual({ success: true, exitCode: 0 });
  });

  it('uses pre-loaded config without calling config loader', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(context.configLoader.load).not.toHaveBeenCalled();
    expect(preflightModule.preflight).toHaveBeenCalledWith(
      mockConfig,
      {
        requireCopilot: true,
        requireConfig: true,
        requireProgress: true,
      },
      context.process
    );
    expect(result).toEqual({ success: true, exitCode: 0 });
  });

  it('fails validation when neither prompt nor input is provided', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    const result = await yolo({}, context, mockConfig);

    expect(result).toEqual({
      success: false,
      exitCode: 1,
      error: 'Missing required input',
    });
    expect(lockModule.acquireLock).not.toHaveBeenCalled();
    expect(planModule.plan).not.toHaveBeenCalled();
    expect(taskModule.task).not.toHaveBeenCalled();
    expect(runModule.run).not.toHaveBeenCalled();
  });

  it('rejects path traversal in input paths before loading config', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });

    await expect(
      yolo({ input: ['../outside.md'] }, context, mockConfig)
    ).rejects.toThrow('ERR-INP-07');
    expect(preflightModule.preflight).not.toHaveBeenCalled();
    expect(context.configLoader.load).not.toHaveBeenCalled();
  });

  it('normalizes valid input, output, and agent paths', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    const options = {
      input: ['./docs/spec.md'],
      output: './docs/plan.md',
      agent: './.github/agents/speci-plan.agent.md',
    };

    await yolo(options, context, mockConfig);

    expect(options.input).toEqual(['C:\\project\\docs\\spec.md']);
    expect(options.output).toBe('C:\\project\\docs\\plan.md');
    expect(options.agent).toBe(
      'C:\\project\\.github\\agents\\speci-plan.agent.md'
    );
  });

  it('propagates preflight errors', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(preflightModule, 'preflight').mockRejectedValueOnce(
      new Error('preflight failed')
    );

    await expect(yolo({ prompt: 'test' }, context, mockConfig)).rejects.toThrow(
      'preflight failed'
    );
  });

  it('registers cleanup and signal handlers before lock acquisition', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    const registerOrder = vi.mocked(signalsModule.registerCleanup).mock
      .invocationCallOrder[0];
    const signalOrder = vi.mocked(signalsModule.installSignalHandlers).mock
      .invocationCallOrder[0];
    const lockOrder = vi.mocked(lockModule.acquireLock).mock
      .invocationCallOrder[0];

    expect(registerOrder).toBeLessThan(lockOrder);
    expect(signalOrder).toBeLessThan(lockOrder);
  });

  it('acquires lock with yolo command metadata', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(lockModule.acquireLock).toHaveBeenCalledWith(
      mockConfig,
      context.process,
      'yolo',
      { state: 'yolo:pipeline', iteration: 0 }
    );
  });

  it('returns lock conflict error with sanitized pid when force is disabled', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(lockModule, 'acquireLock').mockRejectedValueOnce(
      createError('ERR-STA-01')
    );
    vi.spyOn(lockModule, 'getLockInfo').mockResolvedValue({
      isLocked: true,
      started: null,
      pid: '1234<script>' as unknown as number,
      elapsed: '00:00:10',
      command: 'run',
      isStale: false,
      metadata: undefined,
    });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('[ERR-STA-01]');
    expect(result.error).toContain('PID: unknown');
  });

  it('force-acquires lock after conflict when --force is enabled', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(lockModule, 'acquireLock')
      .mockRejectedValueOnce(createError('ERR-STA-01'))
      .mockResolvedValueOnce(undefined);

    const result = await yolo(
      { prompt: 'test', force: true },
      context,
      mockConfig
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(lockModule.acquireLock).toHaveBeenCalledTimes(2);
    expect(lockModule.releaseLock).toHaveBeenCalled();
  });

  it('releases lock and removes signal handlers on completion', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(lockModule.releaseLock).toHaveBeenCalledWith(mockConfig);
    expect(signalsModule.unregisterCleanup).toHaveBeenCalledTimes(1);
    expect(signalsModule.removeSignalHandlers).toHaveBeenCalledTimes(1);
  });

  it('executes plan phase with mapped options and default output path', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo(
      {
        prompt: '  build feature  ',
        input: ['.\\docs\\spec.md'],
        agent: '.\\.github\\agents\\custom.agent.md',
        verbose: true,
      },
      context,
      mockConfig
    );

    expect(planModule.plan).toHaveBeenCalledWith(
      {
        prompt: 'build feature',
        input: ['C:\\project\\docs\\spec.md'],
        output: 'docs/plan.md',
        agent: 'C:\\project\\.github\\agents\\custom.agent.md',
        verbose: true,
      },
      context,
      mockConfig
    );
  });

  it('returns original plan error and releases lock when plan phase fails', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(planModule, 'plan').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'plan failed exactly',
    });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(result).toEqual({
      success: false,
      exitCode: 1,
      error: 'plan failed exactly',
    });
    expect(taskModule.task).not.toHaveBeenCalled();
    expect(runModule.run).not.toHaveBeenCalled();
    expect(lockModule.releaseLock).toHaveBeenCalled();
  });

  it('executes task phase with mapped options and logs phase messages', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo(
      {
        prompt: 'build feature',
        output: '.\\docs\\custom-plan.md',
        agent: '.\\.github\\agents\\custom.agent.md',
        verbose: true,
      },
      context,
      mockConfig
    );

    expect(taskModule.task).toHaveBeenCalledWith(
      {
        plan: 'C:\\project\\docs\\custom-plan.md',
        agent: 'C:\\project\\.github\\agents\\custom.agent.md',
        verbose: true,
      },
      context,
      mockConfig
    );
    expect(context.logger.info).toHaveBeenCalledWith(
      'Phase 2/3: Generating task list...'
    );
    expect(context.logger.success).toHaveBeenCalledWith(
      'Task generation complete'
    );
  });

  it('returns original task error and releases lock when task phase fails', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(taskModule, 'task').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'task failed exactly',
    });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(result).toEqual({
      success: false,
      exitCode: 1,
      error: 'task failed exactly',
    });
    expect(runModule.run).not.toHaveBeenCalled();
    expect(lockModule.releaseLock).toHaveBeenCalled();
  });

  it('calls run with yes true and forwards verbose flag', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test', verbose: true }, context, mockConfig);

    expect(runModule.run).toHaveBeenCalledWith(
      {
        yes: true,
        force: false,
        verbose: true,
      },
      context,
      mockConfig
    );
    expect(context.logger.info).toHaveBeenCalledWith(
      'Phase 3/3: Running implementation loop...'
    );
    expect(context.logger.success).toHaveBeenCalledWith(
      'Implementation complete'
    );
  });

  it('returns original run error and releases lock when run phase fails', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(runModule, 'run').mockResolvedValueOnce({
      success: false,
      exitCode: 2,
      error: 'run failed exactly',
    });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(result).toEqual({
      success: false,
      exitCode: 2,
      error: 'run failed exactly',
    });
    expect(lockModule.releaseLock).toHaveBeenCalled();
  });
});
