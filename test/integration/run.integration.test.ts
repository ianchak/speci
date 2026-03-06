import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '@/commands/run.js';
import { createMockContext } from '@/adapters/test-context.js';
import { STATE, type GateResult, type SpeciConfig } from '@/types.js';
import { createError } from '@/errors.js';
import type { CommandContext } from '@/interfaces/index.js';
import type { IntegrationProject } from '../helpers/integration-helpers.js';
import {
  createYoloIntegrationProject,
  pathExists,
  writeProgressFile,
} from '../helpers/integration-helpers.js';

const WORK_LEFT_PROGRESS = `# Integration Progress

## Overview

| Property         | Value                    |
| ---------------- | ------------------------ |
| **Project Name** | Run Integration Project  |
| **Plan File**    | docs/REFACTORING_PLAN.md |

---

## Milestone: M1

| Task ID  | Title     | File                  | Status      | Review Status | Priority | Complexity | Dependencies | Assigned To | Attempts |
| -------- | --------- | --------------------- | ----------- | ------------- | -------- | ---------- | ------------ | ----------- | -------- |
| TASK_001 | Seed Task | TASK_001_seed_task.md | NOT STARTED | —             | HIGH     | S (≤2h)    | None         |             |          |
`;

const IN_REVIEW_PROGRESS = WORK_LEFT_PROGRESS.replace(
  'NOT STARTED',
  'IN REVIEW'
);
const BLOCKED_PROGRESS = WORK_LEFT_PROGRESS.replace('NOT STARTED', 'BLOCKED');
const DONE_PROGRESS = WORK_LEFT_PROGRESS.replace('NOT STARTED', 'COMPLETE');

function gateResult(isSuccess: boolean): GateResult {
  if (isSuccess) {
    return {
      isSuccess: true,
      totalDuration: 1,
      results: [
        {
          command: 'node -e "process.exit(0)"',
          isSuccess: true,
          exitCode: 0,
          output: '',
          error: '',
          duration: 1,
        },
      ],
    };
  }

  return {
    isSuccess: false,
    totalDuration: 1,
    error: 'gate failed',
    results: [
      {
        command: 'node -e "process.exit(1)"',
        isSuccess: false,
        exitCode: 1,
        output: '',
        error: 'gate failed',
        duration: 1,
      },
    ],
  };
}

describe('Run Integration', () => {
  let project: IntegrationProject;

  function createContext(cwd: string = project.root): CommandContext {
    const context = createMockContext({ mockConfig: project.config, cwd });
    context.process.pid = process.pid;
    context.process.platform = process.platform;
    return context;
  }

  beforeEach(async () => {
    project = await createYoloIntegrationProject();
  });

  afterEach(async () => {
    await project.cleanup();
    vi.restoreAllMocks();
  });

  it('Test 1: WORK_LEFT runs impl agent and succeeds when gates pass', async () => {
    await writeProgressFile(project, WORK_LEFT_PROGRESS);
    const context = createContext();
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.WORK_LEFT);
    vi.mocked(context.gateRunner.run).mockResolvedValue(gateResult(true));
    vi.mocked(context.copilotRunner.run).mockResolvedValue({
      isSuccess: true,
      exitCode: 0,
    });

    const result = await run(
      { yes: true, maxIterations: 1 },
      context,
      project.config
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.copilotRunner.run).toHaveBeenCalledWith(
      project.config,
      'impl',
      'Implementation Agent'
    );
  });

  it('Test 2: WORK_LEFT retries fix once and succeeds when second gate passes', async () => {
    await writeProgressFile(project, WORK_LEFT_PROGRESS);
    const context = createContext();
    const config: SpeciConfig = {
      ...project.config,
      gate: { ...project.config.gate, maxFixAttempts: 2 },
    };
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.WORK_LEFT);
    vi.mocked(context.gateRunner.run)
      .mockResolvedValueOnce(gateResult(false))
      .mockResolvedValueOnce(gateResult(true));
    vi.mocked(context.copilotRunner.run).mockResolvedValue({
      isSuccess: true,
      exitCode: 0,
    });

    const result = await run({ yes: true, maxIterations: 1 }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.copilotRunner.run).toHaveBeenCalledTimes(2);
    expect(context.copilotRunner.run).toHaveBeenNthCalledWith(
      2,
      config,
      'fix',
      'Fix Agent'
    );
  });

  it('Test 3: WORK_LEFT fails after max fix attempts are exhausted', async () => {
    await writeProgressFile(project, WORK_LEFT_PROGRESS);
    const context = createContext();
    const config: SpeciConfig = {
      ...project.config,
      gate: { ...project.config.gate, maxFixAttempts: 2 },
    };
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.WORK_LEFT);
    vi.mocked(context.gateRunner.run).mockResolvedValue(gateResult(false));
    vi.mocked(context.copilotRunner.run).mockResolvedValue({
      isSuccess: true,
      exitCode: 0,
    });

    const result = await run({ yes: true, maxIterations: 1 }, context, config);

    expect(result.success).toBe(false);
    expect(vi.mocked(context.logger.error)).toHaveBeenCalledWith(
      'Gates still failing after 2 fix attempts.'
    );
  });

  it('Test 4: BLOCKED dispatches tidy agent for one iteration', async () => {
    await writeProgressFile(project, BLOCKED_PROGRESS);
    const context = createContext();
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.BLOCKED);
    vi.mocked(context.copilotRunner.run).mockResolvedValue({
      isSuccess: true,
      exitCode: 0,
    });

    const result = await run(
      { yes: true, maxIterations: 1 },
      context,
      project.config
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.copilotRunner.run).toHaveBeenCalledWith(
      project.config,
      'tidy',
      'Tidy Agent'
    );
  });

  it('Test 5: IN_REVIEW dispatches review agent and succeeds', async () => {
    await writeProgressFile(project, IN_REVIEW_PROGRESS);
    const context = createContext();
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.IN_REVIEW);
    vi.mocked(context.copilotRunner.run).mockResolvedValue({
      isSuccess: true,
      exitCode: 0,
    });

    const result = await run(
      { yes: true, maxIterations: 1 },
      context,
      project.config
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.copilotRunner.run).toHaveBeenCalledWith(
      project.config,
      'review',
      'Review Agent'
    );
  });

  it('Test 6: DONE exits immediately without dispatching agents', async () => {
    await writeProgressFile(project, DONE_PROGRESS);
    const context = createContext();
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);

    const result = await run(
      { yes: true, maxIterations: 1 },
      context,
      project.config
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.copilotRunner.run).not.toHaveBeenCalled();
  });

  it('Test 7: lock file is cleaned up on normal exit', async () => {
    await writeProgressFile(project, DONE_PROGRESS);
    const context = createContext();
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.DONE);

    const result = await run(
      { yes: true, maxIterations: 1 },
      context,
      project.config
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(await pathExists(project.lockFile)).toBe(false);
    expect(context.lockManager.release).toHaveBeenCalled();
  });

  it('Test 8: lock conflict from acquire rejects with ERR-STA-01', async () => {
    await writeProgressFile(project, WORK_LEFT_PROGRESS);
    const context = createContext();
    const lockError = createError('ERR-STA-01', '{"pid":99999,"elapsed":"1m"}');
    vi.mocked(context.lockManager.acquire).mockRejectedValue(lockError);
    vi.mocked(context.stateReader.getState).mockResolvedValue(STATE.WORK_LEFT);

    await expect(
      run({ yes: true, maxIterations: 1 }, context, project.config)
    ).rejects.toThrow('ERR-STA-01');
  });
});
