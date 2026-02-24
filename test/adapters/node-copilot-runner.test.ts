import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeCopilotRunner } from '@/adapters/node-copilot-runner.js';
import type {
  AgentRunResult,
  CopilotArgsOptions,
  SpeciConfig,
} from '@/types.js';
import * as copilotModule from '@/copilot.js';

vi.mock('@/copilot.js', async () => {
  const actual =
    await vi.importActual<typeof import('@/copilot.js')>('@/copilot.js');
  return {
    ...actual,
    buildCopilotArgs: vi.fn(),
    spawnCopilot: vi.fn(),
    runAgent: vi.fn(),
  };
});

describe('NodeCopilotRunner', () => {
  const config = {
    version: '1.0.0',
  } as unknown as SpeciConfig;
  const options: CopilotArgsOptions = {
    agent: 'speci-impl',
    command: 'impl',
  };
  const adapter = new NodeCopilotRunner();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates buildArgs to buildCopilotArgs', () => {
    const expectedArgs = ['-p', 'prompt'];
    vi.mocked(copilotModule.buildCopilotArgs).mockReturnValue(expectedArgs);

    const result = adapter.buildArgs(config, options);

    expect(copilotModule.buildCopilotArgs).toHaveBeenCalledWith(
      config,
      options
    );
    expect(result).toBe(expectedArgs);
  });

  it('delegates spawn to spawnCopilot', async () => {
    const args = ['--help'];
    const spawnOptions = { inherit: false, cwd: 'C:\\temp' };
    vi.mocked(copilotModule.spawnCopilot).mockResolvedValue(0);

    const result = await adapter.spawn(args, spawnOptions);

    expect(copilotModule.spawnCopilot).toHaveBeenCalledWith(args, spawnOptions);
    expect(result).toBe(0);
  });

  it('delegates run to runAgent', async () => {
    const expected: AgentRunResult = { isSuccess: true, exitCode: 0 };
    vi.mocked(copilotModule.runAgent).mockResolvedValue(expected);

    const result = await adapter.run(config, 'speci-impl', 'Implementation');

    expect(copilotModule.runAgent).toHaveBeenCalledWith(
      config,
      'speci-impl',
      'Implementation'
    );
    expect(result).toBe(expected);
  });
});
