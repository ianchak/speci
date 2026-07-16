import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProductionContext } from '@/adapters/context-factory.js';
import { init } from '@/commands/init.js';
import * as copilotModule from '@/copilot.js';

describe('init model selection', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `speci-init-models-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
    vi.spyOn(copilotModule, 'listCopilotModels').mockResolvedValue([
      'claude-opus-4.8',
      'claude-sonnet-5',
      'gpt-5.3-codex',
      'gpt-5.4-mini',
    ]);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('applies preset models during init', async () => {
    await init({ preset: 'budget' }, createProductionContext());
    const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));

    expect(config.copilot.models.tidy).toBe('gpt-5.4-mini');
  });

  it('reconfigures models on existing config file', async () => {
    writeFileSync(
      'speci.config.json',
      JSON.stringify(
        {
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
              plan: 'old-model',
              task: 'old-model',
              refactor: 'old-model',
              impl: 'old-model',
              review: 'old-model',
              fix: 'old-model',
              tidy: 'old-model',
            },
            extraFlags: [],
          },
          gate: { commands: ['npm test'], maxFixAttempts: 5 },
          loop: { maxIterations: 100 },
        },
        null,
        2
      )
    );

    await init(
      { preset: 'balanced', reconfigureModels: true },
      createProductionContext()
    );
    const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));

    expect(config.copilot.models.impl).toBe('gpt-5.3-codex');
    expect(config.copilot.models.plan).toBe('claude-opus-4.8');
  });
});
