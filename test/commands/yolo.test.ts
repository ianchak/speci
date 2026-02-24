import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createMockContext } from '../../lib/adapters/test-context.js';
import { yolo } from '../../lib/commands/yolo.js';
import type { SpeciConfig } from '../../lib/config.js';
import { createError } from '../../lib/errors.js';
import * as planModule from '../../lib/commands/plan.js';
import * as runModule from '../../lib/commands/run.js';
import * as taskModule from '../../lib/commands/task.js';
import * as errorHandlerModule from '../../lib/utils/error-handler.js';

const PROJECT_CWD = join(tmpdir(), 'speci-test-project');

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
    expect(context.preflight.run).toHaveBeenCalledWith(
      expect.any(Object),
      {
        requireCopilot: true,
        requireConfig: true,
        requireProgress: false,
      },
      context.process
    );
    expect(result).toEqual({ success: true, exitCode: 0 });
  });

  it('uses pre-loaded config without calling config loader', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(context.configLoader.load).not.toHaveBeenCalled();
    expect(context.preflight.run).toHaveBeenCalledWith(
      mockConfig,
      {
        requireCopilot: true,
        requireConfig: true,
        requireProgress: false,
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
    expect(context.lockManager.acquire).not.toHaveBeenCalled();
    expect(planModule.plan).not.toHaveBeenCalled();
    expect(taskModule.task).not.toHaveBeenCalled();
    expect(runModule.run).not.toHaveBeenCalled();
  });

  it('rejects path traversal in input paths before loading config', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });

    await expect(
      yolo({ input: ['../outside.md'] }, context, mockConfig)
    ).rejects.toThrow('ERR-INP-07');
    expect(context.preflight.run).not.toHaveBeenCalled();
    expect(context.configLoader.load).not.toHaveBeenCalled();
  });

  it('normalizes valid input and output paths', async () => {
    const context = createMockContext({ mockConfig, cwd: PROJECT_CWD });
    const options = {
      input: ['./docs/spec.md'],
      output: './docs/plan.md',
    };

    await yolo(options, context, mockConfig);

    expect(options.input).toEqual([join(PROJECT_CWD, 'docs', 'spec.md')]);
    expect(options.output).toBe(join(PROJECT_CWD, 'docs', 'plan.md'));
  });

  it('propagates preflight errors', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.preflight.run).mockRejectedValueOnce(
      new Error('preflight failed')
    );

    await expect(yolo({ prompt: 'test' }, context, mockConfig)).rejects.toThrow(
      'preflight failed'
    );
  });

  it('registers cleanup and signal handlers before lock acquisition', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    const registerOrder = vi.mocked(context.signalManager.registerCleanup).mock
      .invocationCallOrder[0];
    const signalOrder = vi.mocked(context.signalManager.install).mock
      .invocationCallOrder[0];
    const lockOrder = vi.mocked(context.lockManager.acquire).mock
      .invocationCallOrder[0];

    expect(registerOrder).toBeLessThan(lockOrder);
    expect(signalOrder).toBeLessThan(lockOrder);
  });

  it('acquires lock with yolo command metadata', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(context.lockManager.acquire).toHaveBeenCalledWith(
      mockConfig,
      context.process,
      'yolo',
      { state: 'yolo:pipeline', iteration: 0 }
    );
  });

  it('returns lock conflict error with sanitized pid when force is disabled', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.lockManager.acquire).mockRejectedValueOnce(
      createError('ERR-STA-01')
    );
    vi.mocked(context.lockManager.getInfo).mockResolvedValue({
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
    expect(result.error).toContain(
      'Another yolo command is already running (PID: unknown).'
    );
    expect(result.error).toContain('Use --force to override.');
  });

  it('force-acquires lock after conflict when --force is enabled', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.lockManager.acquire)
      .mockRejectedValueOnce(createError('ERR-STA-01'))
      .mockResolvedValueOnce(undefined);

    const result = await yolo(
      { prompt: 'test', force: true },
      context,
      mockConfig
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.lockManager.acquire).toHaveBeenCalledTimes(2);
    expect(context.lockManager.release).toHaveBeenCalled();
  });

  it('releases lock and removes signal handlers on completion', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(context.lockManager.release).toHaveBeenCalledWith(mockConfig);
    expect(context.signalManager.unregisterCleanup).toHaveBeenCalledTimes(1);
    expect(context.signalManager.remove).toHaveBeenCalledTimes(1);
    const releaseOrder = vi.mocked(context.lockManager.release).mock
      .invocationCallOrder[0];
    const removeHandlersOrder = vi.mocked(context.signalManager.remove).mock
      .invocationCallOrder[0];
    expect(releaseOrder).toBeLessThan(removeHandlersOrder);
  });

  it('executes plan phase with mapped options and default output path', async () => {
    const context = createMockContext({ mockConfig, cwd: PROJECT_CWD });
    await yolo(
      {
        prompt: '  build feature  ',
        input: ['./docs/spec.md'],
        verbose: true,
      },
      context,
      mockConfig
    );

    expect(planModule.plan).toHaveBeenCalledWith(
      {
        prompt: 'build feature',
        input: [join(PROJECT_CWD, 'docs', 'spec.md')],
        output: expect.stringMatching(
          /^docs\/plan-\d{8}-\d{6}_implementation_plan\.md$/
        ),
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
      error: 'Yolo failed during plan phase: plan failed exactly',
    });
    expect(taskModule.task).not.toHaveBeenCalled();
    expect(runModule.run).not.toHaveBeenCalled();
    expect(context.lockManager.release).toHaveBeenCalled();
  });

  it('executes task phase with mapped options and logs phase messages', async () => {
    const context = createMockContext({ mockConfig, cwd: PROJECT_CWD });
    await yolo(
      {
        prompt: 'build feature',
        output: './docs/custom-plan.md',
        verbose: true,
      },
      context,
      mockConfig
    );

    expect(taskModule.task).toHaveBeenCalledWith(
      {
        plan: join(PROJECT_CWD, 'docs', 'custom-plan.md'),
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
      error: 'Yolo failed during task phase: task failed exactly',
    });
    expect(runModule.run).not.toHaveBeenCalled();
    expect(context.lockManager.release).toHaveBeenCalled();
  });

  it('calls run with yes true and forwards verbose flag', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test', verbose: true }, context, mockConfig);

    expect(runModule.run).toHaveBeenCalledWith(
      {
        yes: true,
        force: true,
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
      error: 'Yolo failed during run phase: run failed exactly',
    });
    expect(context.lockManager.release).toHaveBeenCalled();
  });

  it('releases lock on uncaught exception and calls handleCommandError', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    const uncaughtError = new Error('runtime boom');
    vi.spyOn(planModule, 'plan').mockRejectedValueOnce(uncaughtError);
    const handleCommandErrorSpy = vi
      .spyOn(errorHandlerModule, 'handleCommandError')
      .mockReturnValue({
        success: false,
        exitCode: 1,
        error: 'runtime boom',
      });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(handleCommandErrorSpy).toHaveBeenCalledWith(
      uncaughtError,
      'Yolo',
      context.logger
    );
    expect(context.lockManager.release).toHaveBeenCalledWith(mockConfig);
    expect(result).toEqual({
      success: false,
      exitCode: 1,
      error: 'runtime boom',
    });
  });

  it('logs warning and continues cleanup when lock release fails', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.lockManager.release).mockRejectedValueOnce(
      new Error('release failed')
    );

    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.warn).toHaveBeenCalledWith(
      'Failed to release lock file: release failed'
    );
    expect(context.signalManager.remove).toHaveBeenCalledTimes(1);
  });

  it('does not inspect lock state separately before atomic acquisition', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(context.lockManager.getInfo).not.toHaveBeenCalled();
    expect(context.lockManager.acquire).toHaveBeenCalledTimes(1);
  });

  it('does not release lock when preflight fails before lock lifecycle setup', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.preflight.run).mockRejectedValueOnce(
      createError('ERR-PRE-01')
    );

    await expect(
      yolo({ prompt: 'test' }, context, mockConfig)
    ).rejects.toThrowError('ERR-PRE-01');
    expect(context.lockManager.release).not.toHaveBeenCalled();
    expect(context.signalManager.registerCleanup).not.toHaveBeenCalled();
  });

  it('calls plan with undefined prompt when input-only mode is used', async () => {
    const context = createMockContext({ mockConfig, cwd: PROJECT_CWD });
    await yolo({ input: ['./docs/spec.md'] }, context, mockConfig);

    expect(planModule.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: undefined,
        input: [join(PROJECT_CWD, 'docs', 'spec.md')],
      }),
      context,
      mockConfig
    );
  });

  it('passes default plan path to task phase when output is omitted', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(taskModule.task).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.stringMatching(
          /^docs\/plan-\d{8}-\d{6}_implementation_plan\.md$/
        ),
      }),
      context,
      mockConfig
    );
  });

  it('passes force:true to run so it can take over the yolo-held lock', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.lockManager.acquire)
      .mockRejectedValueOnce(createError('ERR-STA-01'))
      .mockResolvedValueOnce(undefined);

    await yolo({ prompt: 'test', force: true }, context, mockConfig);

    expect(runModule.run).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
      context,
      mockConfig
    );
  });

  it('propagates ERR-PRE-04 config preflight failures', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.preflight.run).mockRejectedValueOnce(
      createError('ERR-PRE-04')
    );

    await expect(
      yolo({ prompt: 'test' }, context, mockConfig)
    ).rejects.toThrowError('ERR-PRE-04');
  });

  it('propagates ERR-PRE-05 progress preflight failures', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.preflight.run).mockRejectedValueOnce(
      createError('ERR-PRE-05')
    );

    await expect(
      yolo({ prompt: 'test' }, context, mockConfig)
    ).rejects.toThrowError('ERR-PRE-05');
  });

  it('returns error result when lock acquisition throws filesystem error', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.lockManager.acquire).mockRejectedValueOnce(
      createError('ERR-EXE-05')
    );

    const result = await yolo({ prompt: 'test' }, context, mockConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ERR-EXE-05');
    expect(planModule.plan).not.toHaveBeenCalled();
  });

  it('returns original ENOSPC plan output error', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(planModule, 'plan').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'ENOSPC: no space left on device',
    });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);
    expect(result.error).toBe(
      'Yolo failed during plan phase: ENOSPC: no space left on device'
    );
  });

  it('returns original EACCES plan output error', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(planModule, 'plan').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'EACCES: permission denied',
    });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);
    expect(result.error).toBe(
      'Yolo failed during plan phase: EACCES: permission denied'
    );
  });

  it('returns plan-phase error for invalid custom agent path usage', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.spyOn(planModule, 'plan').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'invalid agent file',
    });

    const result = await yolo({ prompt: 'test' }, context, mockConfig);
    expect(result.error).toBe(
      'Yolo failed during plan phase: invalid agent file'
    );
  });

  it('rejects whitespace-only prompt strings', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    const result = await yolo({ prompt: '  \n\t  ' }, context, mockConfig);

    expect(result).toEqual({
      success: false,
      exitCode: 1,
      error: 'Missing required input',
    });
    expect(planModule.plan).not.toHaveBeenCalled();
  });

  it('forwards verbose flag consistently across all phases', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test', verbose: true }, context, mockConfig);

    expect(planModule.plan).toHaveBeenCalledWith(
      expect.objectContaining({ verbose: true }),
      context,
      mockConfig
    );
    expect(taskModule.task).toHaveBeenCalledWith(
      expect.objectContaining({ verbose: true }),
      context,
      mockConfig
    );
    expect(runModule.run).toHaveBeenCalledWith(
      expect.objectContaining({ verbose: true }),
      context,
      mockConfig
    );
  });

  it('logs separators and elapsed time for each pipeline phase', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    const separator = '━'.repeat(60);
    const separatorCalls = vi
      .mocked(context.logger.info)
      .mock.calls.filter(([message]) => message === separator);
    expect(separatorCalls).toHaveLength(3);

    const debugCalls = vi
      .mocked(context.logger.debug)
      .mock.calls.map(([message]) => message);
    expect(debugCalls).toHaveLength(3);
    for (const message of debugCalls) {
      expect(message).toMatch(/^Phase completed in \d+ms$/);
    }
  });

  it('halts pipeline when plan fails due to missing input file', async () => {
    const context = createMockContext({ mockConfig, cwd: PROJECT_CWD });
    vi.spyOn(planModule, 'plan').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'input file not found',
    });

    const result = await yolo(
      { input: ['./docs/missing.md'] },
      context,
      mockConfig
    );
    expect(result.error).toBe(
      'Yolo failed during plan phase: input file not found'
    );
    expect(taskModule.task).not.toHaveBeenCalled();
    expect(runModule.run).not.toHaveBeenCalled();
  });

  it('installs and removes signal handlers exactly once per execution', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(context.signalManager.install).toHaveBeenCalledTimes(1);
    expect(context.signalManager.remove).toHaveBeenCalledTimes(1);
    expect(context.signalManager.unregisterCleanup).toHaveBeenCalledTimes(1);
  });

  it('loads config once and reuses the same object across all phase calls', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });

    await yolo({ prompt: 'test' }, context);

    expect(context.configLoader.load).toHaveBeenCalledTimes(1);
    expect(planModule.plan).toHaveBeenCalledWith(
      expect.any(Object),
      context,
      mockConfig
    );
    expect(taskModule.task).toHaveBeenCalledWith(
      expect.any(Object),
      context,
      mockConfig
    );
    expect(runModule.run).toHaveBeenCalledWith(
      expect.any(Object),
      context,
      mockConfig
    );
  });

  it('always passes yes true to run phase even with force enabled', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    vi.mocked(context.lockManager.acquire)
      .mockRejectedValueOnce(createError('ERR-STA-01'))
      .mockResolvedValueOnce(undefined);

    await yolo({ prompt: 'test', force: true }, context, mockConfig);

    expect(runModule.run).toHaveBeenCalledWith(
      expect.objectContaining({ yes: true }),
      context,
      mockConfig
    );
  });

  it('acquires lock only once on successful non-force path', async () => {
    const context = createMockContext({ mockConfig, cwd: 'C:\\project' });
    await yolo({ prompt: 'test' }, context, mockConfig);

    expect(context.lockManager.acquire).toHaveBeenCalledTimes(1);
  });
});
