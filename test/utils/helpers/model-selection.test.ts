import { describe, expect, it, vi } from 'vitest';
import type { IFileSystem, ILogger, IProcess } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';
import {
  applyPresetModels,
  remediateInvalidModels,
  selectModelsForInit,
} from '@/utils/helpers/model-selection.js';

const fallbackModels: SpeciConfig['copilot']['models'] = {
  plan: 'claude-opus-4.8',
  task: 'claude-sonnet-4.6',
  refactor: 'claude-sonnet-4.6',
  impl: 'gpt-5.3-codex',
  review: 'claude-sonnet-4.6',
  fix: 'claude-sonnet-4.6',
  tidy: 'gpt-5.4-mini',
};

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    infoPlain: vi.fn(),
    warnPlain: vi.fn(),
    errorPlain: vi.fn(),
    successPlain: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    muted: vi.fn(),
    raw: vi.fn(),
    setVerbose: vi.fn(),
  };
}

function createMockProcess(isTTY: boolean): IProcess {
  return {
    env: {},
    cwd: vi.fn(() => '/tmp'),
    exit: vi.fn() as never,
    pid: 123,
    platform: 'linux',
    version: process.version,
    argv: ['node', 'speci'],
    stdout: { isTTY } as NodeJS.WriteStream,
    stdin: { isTTY } as NodeJS.ReadStream,
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe('model-selection helper', () => {
  it('applies balanced preset from live model list', () => {
    const models = [
      'claude-opus-4.8',
      'claude-sonnet-5',
      'gpt-5.3-codex',
      'gpt-5.4-mini',
    ];
    const resolved = applyPresetModels('balanced', models, fallbackModels);

    expect(resolved.plan).toBe('claude-opus-4.8');
    expect(resolved.impl).toBe('gpt-5.3-codex');
    expect(resolved.tidy).toBe('gpt-5.4-mini');
  });

  it('uses balanced preset automatically in non-interactive init', async () => {
    const logger = createMockLogger();
    const proc = createMockProcess(false);
    const liveModels = ['claude-sonnet-5', 'gpt-5.3-codex', 'gpt-5.4-mini'];

    const selected = await selectModelsForInit({
      logger,
      proc,
      liveModels,
      fallbackModels,
    });

    expect(selected.impl).toBe('gpt-5.3-codex');
    expect(selected.tidy).toBe('gpt-5.4-mini');
  });

  it('retains fallback models when live discovery is unavailable', async () => {
    const logger = createMockLogger();

    const selected = await selectModelsForInit({
      logger,
      proc: createMockProcess(false),
      liveModels: null,
      fallbackModels,
    });

    expect(selected).toBe(fallbackModels);
    expect(logger.warn).toHaveBeenCalledWith(
      'Could not fetch live Copilot models. Continuing with default model settings.'
    );
  });

  it('uses an explicit preset in non-interactive mode', async () => {
    const selected = await selectModelsForInit({
      preset: 'budget',
      logger: createMockLogger(),
      proc: createMockProcess(false),
      liveModels: ['gpt-5.4-mini', 'gpt-5.3-codex'],
      fallbackModels,
    });

    expect(selected.plan).toBe('gpt-5.4-mini');
    expect(selected.impl).toBe('gpt-5.4-mini');
  });

  it('shows menu on first init even when --preset flag is given and terminal is interactive', async () => {
    const logger = createMockLogger();
    const proc = createMockProcess(true);
    const liveModels = [
      'claude-opus-4.8',
      'claude-sonnet-5',
      'gpt-5.3-codex',
      'gpt-5.4-mini',
    ];

    // Simulate user pressing Enter to accept the default (preset flag = 'best' → default '1')
    const prompt = vi.fn().mockResolvedValue('');

    const selected = await selectModelsForInit({
      preset: 'best',
      isFirstInit: true,
      logger,
      proc,
      liveModels,
      fallbackModels,
      prompt,
    });

    // The prompt must have been called (menu was shown)
    expect(prompt).toHaveBeenCalled();
    // Accepting the default for 'best' preset should apply 'best'
    expect(selected.plan).toBe('claude-opus-4.8');
  });

  it('skips menu and applies preset directly on --reconfigure-models (not first init)', async () => {
    const logger = createMockLogger();
    const proc = createMockProcess(true);
    const liveModels = [
      'claude-opus-4.8',
      'claude-sonnet-5',
      'gpt-5.3-codex',
      'gpt-5.4-mini',
    ];

    const prompt = vi.fn().mockResolvedValue('');

    const selected = await selectModelsForInit({
      preset: 'budget',
      isFirstInit: false,
      logger,
      proc,
      liveModels,
      fallbackModels,
      prompt,
    });

    // Menu must NOT have been shown when isFirstInit is false and preset is given
    expect(prompt).not.toHaveBeenCalled();
    expect(selected.tidy).toBe('gpt-5.4-mini');
  });

  it('supports selecting models role-by-role and retains fallbacks for invalid answers', async () => {
    const logger = createMockLogger();
    const prompt = vi
      .fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('invalid')
      .mockResolvedValueOnce('gpt-5.3-codex')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('2')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('2');

    const selected = await selectModelsForInit({
      custom: true,
      logger,
      proc: createMockProcess(true),
      liveModels: ['claude-opus-4.8', 'gpt-5.3-codex'],
      fallbackModels,
      prompt,
    });

    expect(selected.plan).toBe('claude-opus-4.8');
    expect(selected.task).toBe(fallbackModels.task);
    expect(selected.refactor).toBe('gpt-5.3-codex');
    expect(selected.impl).toBe(fallbackModels.impl);
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid selection "invalid". Keeping "claude-sonnet-4.6".'
    );
  });

  it('remediates invalid configured models with balanced preset', async () => {
    let configContent = JSON.stringify(
      {
        version: '1.0.0',
        copilot: {
          models: {
            ...fallbackModels,
            plan: 'deprecated-model',
          },
        },
      },
      null,
      2
    );

    const fs: IFileSystem = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => configContent),
      writeFileSync: vi.fn((_path, data) => {
        configContent = String(data);
      }),
      mkdirSync: vi.fn(),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false, isFile: () => true })),
      copyFileSync: vi.fn(),
      readFile: vi.fn(async () => ''),
      writeFile: vi.fn(async () => {}),
    };

    const logger = createMockLogger();
    const proc = createMockProcess(true);
    const updated = await remediateInvalidModels({
      configPath: '/tmp/speci.config.json',
      config: {
        version: '1.0.0',
        paths: {
          progress: 'docs/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: '.speci-logs',
          lock: '.speci-lock',
        },
        copilot: {
          permissions: 'allow-all',
          models: { ...fallbackModels, plan: 'deprecated-model' },
          extraFlags: [],
        },
        gate: { commands: [], maxFixAttempts: 5 },
        loop: { maxIterations: 10 },
      },
      fs,
      proc,
      logger,
      liveModels: ['claude-opus-4.8', 'claude-sonnet-5', 'gpt-5.3-codex'],
      prompt: vi.fn().mockResolvedValue('2'),
    });

    expect(updated?.plan).toBe('claude-opus-4.8');
    expect(configContent).toContain('"plan": "claude-opus-4.8"');
  });

  it('skips remediation when no models can be discovered', async () => {
    const logger = createMockLogger();
    const result = await remediateInvalidModels({
      configPath: '/tmp/speci.config.json',
      config: {
        version: '1.0.0',
        paths: {
          progress: 'progress',
          tasks: 'tasks',
          logs: 'logs',
          lock: 'lock',
        },
        copilot: {
          permissions: 'allow-all',
          models: fallbackModels,
          extraFlags: [],
        },
        gate: { commands: [], maxFixAttempts: 1 },
        loop: { maxIterations: 1 },
      },
      fs: {} as IFileSystem,
      proc: createMockProcess(true),
      logger,
      liveModels: [],
    });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Could not validate configured Copilot models against live availability.'
    );
  });

  it('allows interactive remediation to be skipped', async () => {
    const logger = createMockLogger();
    const config = {
      version: '1.0.0',
      paths: {
        progress: 'progress',
        tasks: 'tasks',
        logs: 'logs',
        lock: 'lock',
      },
      copilot: {
        permissions: 'allow-all' as const,
        models: { ...fallbackModels, plan: 'deprecated-model' },
        extraFlags: [],
      },
      gate: { commands: [], maxFixAttempts: 1 },
      loop: { maxIterations: 1 },
    };

    const result = await remediateInvalidModels({
      configPath: '/tmp/speci.config.json',
      config,
      fs: {} as IFileSystem,
      proc: createMockProcess(true),
      logger,
      liveModels: ['claude-opus-4.8'],
      prompt: vi.fn().mockResolvedValue('3'),
    });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Continuing with invalid model configuration.'
    );
  });
});
