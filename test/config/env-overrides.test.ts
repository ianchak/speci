import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, resetConfigCache } from '../../lib/config/index.js';
import type { IProcess } from '../../lib/interfaces/index.js';
import {
  applyEnvOverrides,
  ENV_MAPPINGS,
} from '../../lib/config/env-overrides.js';
import type { SpeciConfig } from '../../lib/types.js';

describe('config with IProcess parameter', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `speci-test-config-process-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    resetConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should use mock process.cwd() when provided', async () => {
    // Create config file in test directory
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(configPath, JSON.stringify({ version: '1.0.0' }));

    // Create mock process that returns testDir as cwd
    const mockProcess: IProcess = {
      env: {},
      cwd: () => testDir,
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      version: 'v22.0.0',
      argv: ['node', 'speci'],
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
      off: vi.fn(),
    };

    // Load config with mock process
    const config = await loadConfig({ proc: mockProcess });

    expect(config).toBeDefined();
    expect(config.version).toBe('1.0.0');
  });

  it('should use mock process.env for environment overrides', async () => {
    // Create config file
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0.0',
        gate: { commands: ['npm test'], maxFixAttempts: 3 },
      })
    );

    // Create mock process with env override
    const mockProcess: IProcess = {
      env: {
        SPECI_MAX_FIX_ATTEMPTS: '7',
      },
      cwd: () => testDir,
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      version: 'v22.0.0',
      argv: ['node', 'speci'],
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
      off: vi.fn(),
    };

    // Load config with mock process
    const config = await loadConfig({ proc: mockProcess });

    // Verify env override was applied
    expect(config.gate.maxFixAttempts).toBe(7);
  });

  it('should use real process when parameter not provided (backward compat)', async () => {
    // Change to test directory
    process.chdir(testDir);

    // Create config file
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(configPath, JSON.stringify({ version: '1.0.0' }));

    // Load config without process parameter
    const config = await loadConfig();

    expect(config).toBeDefined();
    expect(config.version).toBe('1.0.0');
  });

  it('should allow SPECI_MAX_FIX_ATTEMPTS=0 to disable fix attempts', async () => {
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0.0',
        gate: { commands: ['npm test'], maxFixAttempts: 3 },
      })
    );

    const mockProcess: IProcess = {
      env: {
        SPECI_MAX_FIX_ATTEMPTS: '0',
      },
      cwd: () => testDir,
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      version: 'v22.0.0',
      argv: ['node', 'speci'],
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
      off: vi.fn(),
    };

    const config = await loadConfig({ proc: mockProcess });

    expect(config.gate.maxFixAttempts).toBe(0);
  });

  it('should handle empty env gracefully', async () => {
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(configPath, JSON.stringify({ version: '1.0.0' }));

    const mockProcess: IProcess = {
      env: {}, // Empty environment
      cwd: () => testDir,
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      version: 'v22.0.0',
      argv: ['node', 'speci'],
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
      off: vi.fn(),
    };

    const config = await loadConfig({ proc: mockProcess });

    expect(config).toBeDefined();
    // Should use defaults when no env overrides present
    expect(config.gate.maxFixAttempts).toBe(5);
  });
});

describe('typed env override mapping', () => {
  function createProcess(env: NodeJS.ProcessEnv): IProcess {
    return {
      env,
      cwd: () => process.cwd(),
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      version: 'v22.0.0',
      argv: ['node', 'speci'],
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
      off: vi.fn(),
    };
  }

  function createConfig(): SpeciConfig {
    return {
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
          task: 'claude-sonnet-4.6',
          refactor: 'claude-sonnet-4.6',
          impl: 'gpt-5.3-codex',
          review: 'claude-sonnet-4.6',
          fix: 'claude-sonnet-4.6',
          tidy: 'gpt-5.2',
        },
        extraFlags: [],
      },
      gate: {
        commands: ['npm run lint', 'npm run typecheck', 'npm test'],
        maxFixAttempts: 5,
      },
      loop: {
        maxIterations: 100,
      },
    };
  }

  it('should apply each current env mapping path', () => {
    const cases: Array<{
      envVar: (typeof ENV_MAPPINGS)[number]['envVar'];
      value: string;
      assert: (config: SpeciConfig) => void;
    }> = [
      {
        envVar: 'SPECI_LOG_PATH',
        value: 'logs/one',
        assert: (config) => expect(config.paths.logs).toBe('logs/one'),
      },
      {
        envVar: 'SPECI_LOGS_PATH',
        value: 'logs/two',
        assert: (config) => expect(config.paths.logs).toBe('logs/two'),
      },
      {
        envVar: 'SPECI_PROGRESS_PATH',
        value: 'docs/ALT_PROGRESS.md',
        assert: (config) =>
          expect(config.paths.progress).toBe('docs/ALT_PROGRESS.md'),
      },
      {
        envVar: 'SPECI_LOCK_PATH',
        value: '.custom-lock',
        assert: (config) => expect(config.paths.lock).toBe('.custom-lock'),
      },
      {
        envVar: 'SPECI_TASKS_PATH',
        value: 'custom/tasks',
        assert: (config) => expect(config.paths.tasks).toBe('custom/tasks'),
      },
      {
        envVar: 'SPECI_MAX_ITERATIONS',
        value: '42',
        assert: (config) => expect(config.loop.maxIterations).toBe(42),
      },
      {
        envVar: 'SPECI_MAX_FIX_ATTEMPTS',
        value: '9',
        assert: (config) => expect(config.gate.maxFixAttempts).toBe(9),
      },
      {
        envVar: 'SPECI_COPILOT_PERMISSIONS',
        value: 'strict',
        assert: (config) => expect(config.copilot.permissions).toBe('strict'),
      },
    ];

    for (const testCase of cases) {
      const config = createConfig();
      applyEnvOverrides(
        config,
        createProcess({ [testCase.envVar]: testCase.value })
      );
      testCase.assert(config);
    }
  });

  it('should apply overrides through applyEnvOverrides integration path', () => {
    const config = createConfig();

    applyEnvOverrides(config, createProcess({ SPECI_MAX_ITERATIONS: '7' }));

    expect(config.loop.maxIterations).toBe(7);
  });

  it('uses injected logger for unknown variable warnings', () => {
    const config = createConfig();
    const injectedLogger = {
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

    applyEnvOverrides(
      config,
      createProcess({ SPECI_PROGRES_PATH: 'bad' }),
      injectedLogger
    );

    expect(injectedLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Unknown environment variable "SPECI_PROGRES_PATH"'
      )
    );
  });
});
