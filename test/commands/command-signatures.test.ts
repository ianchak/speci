import { describe, expect, it } from 'vitest';
import { clean } from '@/commands/clean.js';
import { init } from '@/commands/init.js';
import { plan } from '@/commands/plan.js';
import { refactor } from '@/commands/refactor.js';
import { run } from '@/commands/run.js';
import { status } from '@/commands/status.js';
import { task } from '@/commands/task.js';
import { yolo } from '@/commands/yolo.js';

describe('command signatures', () => {
  it('require CommandContext argument for command handlers', () => {
    const impossibleRuntimePath = Date.now() < 0;
    if (impossibleRuntimePath) {
      // @ts-expect-error context is required
      void run({});
      // @ts-expect-error context is required
      void plan({});
      // @ts-expect-error context is required
      void init({});
      // @ts-expect-error context is required
      void clean({});
      // @ts-expect-error context is required
      void refactor({});
      // @ts-expect-error context is required
      void status({});
      // @ts-expect-error context is required
      void task({});
      // @ts-expect-error context is required
      void yolo({});
    }

    expect(true).toBe(true);
  });
});
