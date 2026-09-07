import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
    testDir = join(
      tmpdir(),
      `speci-init-models-${Date.now()}-${Math.random()}`
    );
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

  it('applies selected budget preset during interactive init', async () => {
    const prompt = vi.fn().mockResolvedValue('3');
    await init(
      { prompt, openSpecConfigRunner: vi.fn(async () => 0) },
      createProductionContext()
    );
    const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));

    expect(prompt).toHaveBeenCalled();
    expect(config.copilot.models.tidy).toBe('gpt-5.4-mini');
  });

  it('applies balanced preset by default when pressing enter', async () => {
    const prompt = vi.fn().mockResolvedValue('');
    await init(
      { prompt, openSpecConfigRunner: vi.fn(async () => 0) },
      createProductionContext()
    );
    const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));

    expect(prompt).toHaveBeenCalled();
    expect(config.copilot.models.impl).toBe('gpt-5.3-codex');
    expect(config.copilot.models.plan).toBe('claude-opus-4.8');
  });

  it('reconfigures models on existing config file with interactive prompt', async () => {
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

    const prompt = vi.fn().mockResolvedValue('1'); // Select Best-in-Class
    await init(
      {
        reconfigureModels: true,
        prompt,
        openSpecConfigRunner: vi.fn(async () => 0),
      },
      createProductionContext()
    );
    const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));

    expect(prompt).toHaveBeenCalled();
    expect(config.copilot.models.impl).toBe('gpt-5.3-codex');
    expect(config.copilot.models.plan).toBe('claude-opus-4.8');
  });

  it('offers the local model as a custom pick when reconfiguring an existing localModel config', async () => {
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
            localModel: {
              baseUrl: 'http://127.0.0.1:8080/v1',
              model: 'local-test-model',
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

    const prompt = vi
      .fn()
      .mockResolvedValueOnce('4') // Choose Custom (one-by-one)
      .mockResolvedValueOnce('1') // plan -> local model (prepended as option 1)
      .mockResolvedValue(''); // keep fallback for remaining roles
    await init(
      {
        reconfigureModels: true,
        prompt,
        openSpecConfigRunner: vi.fn(async () => 0),
      },
      createProductionContext()
    );
    const config = JSON.parse(readFileSync('speci.config.json', 'utf8'));

    expect(config.copilot.models.plan).toBe('local-test-model');
    expect(config.copilot.localModel.model).toBe('local-test-model');
  });
});
