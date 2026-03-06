import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductionContext } from '@/adapters/context-factory.js';
import { status } from '@/commands/status.js';
import { createMockProgress, createTestProject } from './setup.js';
import type { TestProject } from './setup.js';

describe('Status Integration', () => {
  let testProject: TestProject;

  beforeEach(async () => {
    testProject = await createTestProject();
    await createMockProgress(testProject.progressPath, [
      { id: 'TASK_001', title: 'Complete 1', status: 'COMPLETE' },
      { id: 'TASK_002', title: 'Complete 2', status: 'COMPLETE' },
      { id: 'TASK_003', title: 'In review', status: 'IN REVIEW' },
      { id: 'TASK_004', title: 'Todo', status: 'NOT STARTED' },
    ]);
  });

  afterEach(async () => {
    await testProject.cleanup();
    vi.restoreAllMocks();
  });

  it('outputs valid JSON with expected keys and stats in --json mode', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const context = createProductionContext();
      const rawSpy = vi.spyOn(context.logger, 'raw');

      const result = await status({ json: true }, context);

      expect(result).toEqual({ success: true, exitCode: 0 });
      expect(rawSpy).toHaveBeenCalledTimes(1);

      const payload = String(rawSpy.mock.calls[0]?.[0] ?? '');
      const parsed = JSON.parse(payload) as {
        state: string;
        stats: {
          total: number;
          completed: number;
          pending: number;
          inReview: number;
          blocked: number;
        };
        lock: { isLocked: boolean };
        currentTask: { id: string; title: string; status: string } | null;
      };

      expect(parsed).toMatchObject({
        state: expect.any(String),
        stats: expect.any(Object),
        lock: expect.any(Object),
      });
      expect('currentTask' in parsed).toBe(true);
      expect(parsed.stats.completed).toBe(2);
      expect(parsed.stats.pending).toBe(1);
      expect(parsed.lock.isLocked).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('renders once mode in non-TTY context without throwing', async () => {
    const originalCwd = process.cwd();
    process.chdir(testProject.root);

    try {
      const context = createProductionContext();
      const result = await status({ once: true }, context);

      expect(result).toEqual({ success: true, exitCode: 0 });
    } finally {
      process.chdir(originalCwd);
    }
  });
});
