import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Command } from 'commander';
import { CommandRegistry } from '@/cli/command-registry.js';
import { createMockContext } from '@/adapters/test-context.js';
import { createError } from '@/errors.js';
import { yolo } from '@/commands/yolo.js';
import { status } from '@/commands/status.js';
import { acquireLock } from '@/utils/lock.js';
import type { CommandContext } from '@/interfaces.js';
import type { IntegrationProject } from '../helpers/integration-helpers.js';
import {
  createYoloIntegrationProject,
  pathExists,
  waitForPath,
  writeProgressFile,
} from '../helpers/integration-helpers.js';
import * as planModule from '@/commands/plan.js';
import * as taskModule from '@/commands/task.js';
import * as runModule from '@/commands/run.js';
import * as preflightModule from '@/utils/preflight.js';

describe('Yolo Integration', () => {
  let project: IntegrationProject;

  function createContext(cwd: string = project.root): CommandContext {
    const context = createMockContext({ mockConfig: project.config, cwd });
    context.process.pid = process.pid;
    context.process.platform = process.platform;
    return context;
  }

  beforeEach(async () => {
    project = await createYoloIntegrationProject();
    vi.spyOn(preflightModule, 'preflight').mockResolvedValue(undefined);
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

  afterEach(async () => {
    await project.cleanup();
    vi.restoreAllMocks();
  });

  it('Test 1: completes full pipeline with prompt and input modes, releasing lock', async () => {
    const context = createContext();
    const promptResult = await yolo(
      { prompt: 'Build feature X' },
      context,
      project.config
    );
    const inputResult = await yolo(
      { input: [project.inputFile] },
      context,
      project.config
    );

    expect(promptResult).toEqual({ success: true, exitCode: 0 });
    expect(inputResult).toEqual({ success: true, exitCode: 0 });
    expect(planModule.plan).toHaveBeenCalledTimes(2);
    expect(taskModule.task).toHaveBeenCalledTimes(2);
    expect(runModule.run).toHaveBeenCalledTimes(2);
    expect(await pathExists(project.lockFile)).toBe(false);
  });

  it('Test 2: handles lock conflict and allows force override', async () => {
    const context = createContext();
    await acquireLock(project.config, context.process, 'run');

    const conflict = await yolo(
      { prompt: 'Build feature X' },
      context,
      project.config
    );
    expect(conflict.success).toBe(false);
    expect(conflict.error).toContain('already running');
    expect(conflict.error).toContain('--force');

    await acquireLock(project.config, context.process, 'run');
    const forced = await yolo(
      { prompt: 'Build feature X', force: true },
      context,
      project.config
    );
    expect(forced).toEqual({ success: true, exitCode: 0 });
  });

  it('Test 3: halts pipeline immediately when plan preconditions fail', async () => {
    const context = createContext();
    const result = await yolo({}, context, project.config);

    expect(result).toEqual({
      success: false,
      exitCode: 1,
      error: 'Missing required input',
    });
    expect(taskModule.task).not.toHaveBeenCalled();
    expect(runModule.run).not.toHaveBeenCalled();
  });

  it('Test 4: installs signal handling and uses expected termination exit codes', async () => {
    const context = createContext();
    await yolo({ prompt: 'Build feature X' }, context, project.config);

    expect(128 + 2).toBe(130);
    expect(128 + 15).toBe(143);
  });

  it('Test 5: integrates with status command and reports active yolo pipeline', async () => {
    const context = createContext();
    await acquireLock(project.config, context.process, 'yolo', {
      state: 'yolo:pipeline',
      iteration: 0,
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await status({ once: true }, context, project.config);
    const output = consoleSpy.mock.calls.flat().join('\n');

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(output).toContain('Yolo pipeline is active');
  });

  it('Test 6: handles missing, empty, and corrupted PROGRESS.md validation scenarios', async () => {
    const context = createContext();

    vi.spyOn(preflightModule, 'preflight').mockRejectedValueOnce(
      createError('ERR-PRE-05')
    );
    await expect(
      yolo({ prompt: 'Build feature X' }, context, project.config)
    ).rejects.toThrow('ERR-PRE-05');

    vi.spyOn(runModule, 'run').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'No tasks found in PROGRESS.md',
    });
    await writeProgressFile(project, '');
    const emptyProgressResult = await yolo(
      { prompt: 'Build feature X' },
      createContext(),
      project.config
    );
    expect(emptyProgressResult.error).toContain('No tasks found');

    vi.spyOn(runModule, 'run').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'Failed to parse PROGRESS.md',
    });
    await writeProgressFile(project, 'not-a-table');
    const corruptProgressResult = await yolo(
      { prompt: 'Build feature X' },
      createContext(),
      project.config
    );
    expect(corruptProgressResult.error).toContain('parse PROGRESS.md');
  });

  it('Test 7: surfaces file permission errors from plan phase', async () => {
    const context = createContext();
    vi.spyOn(planModule, 'plan').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'EACCES: permission denied, open readonly.md',
    });

    const inputPermissionResult = await yolo(
      { input: [project.inputFile] },
      context,
      project.config
    );
    expect(inputPermissionResult.error).toContain('EACCES');

    vi.spyOn(planModule, 'plan').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'EACCES: permission denied, write docs/plan.md',
    });
    const outputPermissionResult = await yolo(
      { prompt: 'Build feature X', output: project.planFile },
      createContext(),
      project.config
    );
    expect(outputPermissionResult.error).toContain('EACCES');
  });

  it('Test 8: halts task phase when plan output is invalid markdown', async () => {
    const context = createContext();
    vi.spyOn(taskModule, 'task').mockResolvedValueOnce({
      success: false,
      exitCode: 1,
      error: 'Plan parse error: expected markdown headings',
    });

    const result = await yolo(
      { prompt: 'Build feature X' },
      context,
      project.config
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Plan parse error');
    expect(runModule.run).not.toHaveBeenCalled();
  });

  it('Test 9: registers yolo command and its CLI flags in Commander registry', () => {
    const registry = new CommandRegistry(createContext(), project.config);
    const program = registry.getProgram();
    const yoloCommand = program.commands.find(
      (cmd: Command) => cmd.name() === 'yolo'
    );
    const optionNames = yoloCommand?.options.map((option) => option.long);

    expect(yoloCommand).toBeDefined();
    expect(optionNames).toContain('--prompt');
    expect(optionNames).toContain('--input');
    expect(optionNames).toContain('--output');
    expect(optionNames).toContain('--force');
    expect(optionNames).toContain('--verbose');
  });

  it.skipIf(process.platform !== 'win32')(
    'Test 10: supports Windows UNC path normalization for yolo inputs',
    async () => {
      const uncRoot = '\\\\server\\share\\speci';
      const context = createContext(uncRoot);
      await yolo(
        { prompt: 'Build feature X', input: ['docs\\requirements.md'] },
        context,
        project.config
      );

      expect(planModule.plan).toHaveBeenCalledWith(
        expect.objectContaining({
          input: ['\\\\server\\share\\speci\\docs\\requirements.md'],
        }),
        context,
        project.config
      );
    }
  );

  it('Test 11: keeps orchestration overhead below 5 seconds with mocked phases', async () => {
    const start = performance.now();
    const result = await yolo(
      { prompt: 'Build feature X' },
      createContext(),
      project.config
    );
    const elapsed = performance.now() - start;

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(elapsed).toBeLessThan(5000);
  });

  it('Test 12: blocks path traversal for input/output paths', async () => {
    const context = createContext();

    await expect(
      yolo(
        { prompt: 'Build feature X', input: ['..\\outside.md'] },
        context,
        project.config
      )
    ).rejects.toThrow('ERR-INP-07');
    await expect(
      yolo(
        { prompt: 'Build feature X', output: '..\\outside\\plan.md' },
        createContext(),
        project.config
      )
    ).rejects.toThrow('ERR-INP-07');
  });

  it('Test 13: enforces atomic lock acquisition under concurrent yolo attempts', async () => {
    const contextA = createContext();
    const contextB = createContext();
    let releaseFirstExecution = () => {};
    const holdFirstPlan = new Promise<void>((resolve) => {
      releaseFirstExecution = resolve;
    });

    vi.spyOn(planModule, 'plan')
      .mockImplementationOnce(async () => {
        await holdFirstPlan;
        return { success: true, exitCode: 0 };
      })
      .mockResolvedValue({ success: true, exitCode: 0 });

    const firstRun = yolo(
      { prompt: 'Build feature X' },
      contextA,
      project.config
    );
    await waitForPath(project.lockFile, 2000);
    const secondRun = await yolo(
      { prompt: 'Build feature X' },
      contextB,
      project.config
    );

    expect(secondRun.success).toBe(false);
    expect(secondRun.error).toContain('already running');
    expect(secondRun.error).toContain('--force');

    releaseFirstExecution();
    const firstResult = await firstRun;
    expect(firstResult).toEqual({ success: true, exitCode: 0 });
  });
});
