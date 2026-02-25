import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeStateReader } from '@/adapters/node-state-reader.js';
import type {
  CurrentTask,
  GateFailureInfo,
  MilestoneInfo,
  SpeciConfig,
  StateOptions,
  TaskStats,
} from '@/types.js';
import { STATE } from '@/types.js';
import * as stateModule from '@/state.js';

vi.mock('@/state.js', () => ({
  getState: vi.fn(),
  getTaskStats: vi.fn(),
  getCurrentTask: vi.fn(),
  getMilestonesMvtStatus: vi.fn(),
  writeFailureNotes: vi.fn(),
}));

describe('NodeStateReader', () => {
  const config = {
    paths: { progress: 'docs/PROGRESS.md' },
  } as unknown as SpeciConfig;
  const options: StateOptions = { forceRefresh: true };
  const adapter = new NodeStateReader();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates getState and forwards options', async () => {
    vi.mocked(stateModule.getState).mockResolvedValue(STATE.WORK_LEFT);

    const result = await adapter.getState(config, options);

    expect(stateModule.getState).toHaveBeenCalledWith(config, options);
    expect(result).toBe(STATE.WORK_LEFT);
  });

  it('delegates getState when options are omitted', async () => {
    vi.mocked(stateModule.getState).mockResolvedValue(STATE.WORK_LEFT);

    await adapter.getState(config);

    expect(stateModule.getState).toHaveBeenCalledWith(config, undefined);
  });

  it('delegates getTaskStats and forwards options', async () => {
    const stats: TaskStats = {
      total: 10,
      completed: 2,
      remaining: 8,
      inReview: 1,
      blocked: 0,
    };
    vi.mocked(stateModule.getTaskStats).mockResolvedValue(stats);

    const result = await adapter.getTaskStats(config, options);

    expect(stateModule.getTaskStats).toHaveBeenCalledWith(config, options);
    expect(result).toBe(stats);
  });

  it('delegates getCurrentTask and forwards options', async () => {
    const task: CurrentTask = {
      id: 'TASK_035',
      title: 'Add adapter tests',
      status: 'IN PROGRESS',
    };
    vi.mocked(stateModule.getCurrentTask).mockResolvedValue(task);

    const result = await adapter.getCurrentTask(config, options);

    expect(stateModule.getCurrentTask).toHaveBeenCalledWith(config, options);
    expect(result).toBe(task);
  });

  it('delegates writeFailureNotes', async () => {
    const gateFailure: GateFailureInfo = {
      results: [
        {
          command: 'npm test',
          isSuccess: false,
          exitCode: 1,
          error: 'test failed',
        },
      ],
      error: 'gate failed',
    };
    vi.mocked(stateModule.writeFailureNotes).mockResolvedValue();

    await adapter.writeFailureNotes(config, gateFailure);

    expect(stateModule.writeFailureNotes).toHaveBeenCalledWith(
      config,
      gateFailure
    );
  });

  it('UT-A01: delegates getMilestonesMvtStatus and forwards options', async () => {
    const milestones: MilestoneInfo[] = [
      {
        milestoneId: 'M1',
        milestoneName: 'Foundation',
        totalTasks: 2,
        completedTasks: 2,
        mvtId: 'MVT_M1',
        mvtStatus: 'NOT STARTED',
        mvtReady: true,
      },
    ];
    vi.mocked(stateModule.getMilestonesMvtStatus).mockResolvedValue(milestones);

    const result = await adapter.getMilestonesMvtStatus(config, options);

    expect(stateModule.getMilestonesMvtStatus).toHaveBeenCalledWith(
      config,
      options
    );
    expect(result).toBe(milestones);
  });

  it('UT-A02: delegates getMilestonesMvtStatus when options are omitted', async () => {
    vi.mocked(stateModule.getMilestonesMvtStatus).mockResolvedValue([]);

    await adapter.getMilestonesMvtStatus(config);

    expect(stateModule.getMilestonesMvtStatus).toHaveBeenCalledWith(
      config,
      undefined
    );
  });
});
