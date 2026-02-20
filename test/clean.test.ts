import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { clean, cleanFiles } from '../lib/commands/clean.js';
import { createMockContext } from '../lib/adapters/test-context.js';
import type { SpeciConfig } from '../lib/config.js';
import type { CommandContext } from '../lib/interfaces.js';

function createConfig(overrides?: Partial<SpeciConfig['paths']>): SpeciConfig {
  return {
    version: '1.0.0',
    paths: {
      progress: 'docs/PROGRESS.md',
      tasks: 'docs/tasks',
      logs: '.speci-logs',
      lock: '.speci-lock',
      ...overrides,
    },
    copilot: {
      permissions: 'allow-all',
      models: {
        plan: 'claude-opus-4.6',
        task: 'claude-sonnet-4.5',
        refactor: 'claude-sonnet-4.5',
        impl: 'gpt-5.3-codex',
        review: 'claude-sonnet-4.5',
        fix: 'claude-sonnet-4.5',
        tidy: 'gpt-5.2',
      },
      extraFlags: [],
    },
    gate: {
      commands: ['npm test'],
      maxFixAttempts: 3,
    },
    loop: {
      maxIterations: 10,
    },
  };
}

describe('cleanFiles', () => {
  let context: CommandContext;
  let config: SpeciConfig;

  beforeEach(() => {
    context = createMockContext({ cwd: 'C:\\project' });
    config = createConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns failure and warns when lock file exists', () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) => {
      return path === config.paths.lock;
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('Cannot clean while speci is running');
    expect(context.fs.readdirSync).not.toHaveBeenCalled();
    expect(context.fs.rmSync).not.toHaveBeenCalled();
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Cannot clean while speci is running')
    );
  });

  it('rejects path traversal outside project root before deletion', () => {
    const traversalConfig = createConfig({
      tasks: '../../outside',
    });

    const result = cleanFiles(traversalConfig, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain(
      'Configured path resolves outside the project root'
    );
    expect(context.fs.rmSync).not.toHaveBeenCalled();
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('deletes task entries recursively and removes progress file', () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) => {
      return path === config.paths.tasks || path === config.paths.progress;
    });
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['a.md', 'nested']);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(2);
    expect(context.fs.rmSync).toHaveBeenNthCalledWith(
      1,
      join(config.paths.tasks, 'a.md'),
      {
        recursive: true,
        force: true,
      }
    );
    expect(context.fs.rmSync).toHaveBeenNthCalledWith(
      2,
      join(config.paths.tasks, 'nested'),
      {
        recursive: true,
        force: true,
      }
    );
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(config.paths.progress);
    expect(context.logger.warn).toHaveBeenCalledWith(
      `Will delete contents of: ${config.paths.tasks}`
    );
    expect(context.logger.warn).toHaveBeenCalledWith(
      `Will delete: ${config.paths.progress}`
    );
  });

  it('returns success and logs nothing-to-clean when both paths are absent', () => {
    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith('Nothing to clean.');
    expect(context.fs.readdirSync).not.toHaveBeenCalled();
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('returns ERR-EXE-09 when tasks directory cannot be read', () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) => {
      return path === config.paths.tasks;
    });
    vi.spyOn(context.fs, 'readdirSync').mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('[ERR-EXE-09]');
  });

  it('continues deleting other task entries after per-file rmSync failure', () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) => {
      return path === config.paths.tasks;
    });
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['ok.md', 'fail.md']);
    vi.spyOn(context.fs, 'rmSync').mockImplementation((path: string) => {
      if (path.endsWith('fail.md')) {
        throw new Error('EBUSY');
      }
    });

    const result = cleanFiles(config, context);

    const failedPath = join(config.paths.tasks, 'fail.md');
    expect(context.fs.rmSync).toHaveBeenCalledTimes(2);
    expect(context.logger.warn).toHaveBeenCalledWith(
      `Failed to delete: ${failedPath}`
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('[ERR-EXE-10]');
    expect(result.error).toContain(failedPath);
  });

  it('aggregates progress deletion error independently', () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) => {
      return path === config.paths.progress;
    });
    vi.spyOn(context.fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EISDIR');
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('[ERR-EXE-10]');
    expect(result.error).toContain(config.paths.progress);
  });

  it('never throws and uses outer catch for unexpected exceptions', () => {
    const badContext = {
      ...context,
      process: {
        ...context.process,
        cwd: () => {
          throw new Error('unexpected');
        },
      },
    } as CommandContext;

    const result = cleanFiles(config, badContext);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('[ERR-EXE-10]');
  });
});

describe('clean', () => {
  let context: CommandContext;
  let config: SpeciConfig;

  beforeEach(() => {
    context = createMockContext({ cwd: 'C:\\project' });
    config = createConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads config when not provided and delegates to cleanFiles', async () => {
    vi.spyOn(context.fs, 'existsSync').mockReturnValue(false);

    const result = await clean({}, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.configLoader.load).toHaveBeenCalledTimes(1);
  });

  it('uses provided config without calling config loader', async () => {
    vi.spyOn(context.fs, 'existsSync').mockReturnValue(false);

    const result = await clean({}, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.configLoader.load).not.toHaveBeenCalled();
  });

  it('enables verbose mode before delegating when verbose option is set', async () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) => {
      return path === config.paths.tasks;
    });
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['a.md']);

    const result = await clean({ verbose: true }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.setVerbose).toHaveBeenCalledWith(true);
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'a.md'),
      {
        recursive: true,
        force: true,
      }
    );
  });

  it('returns handleCommandError result when config loading throws', async () => {
    vi.spyOn(context.configLoader, 'load').mockRejectedValue(
      new Error('config load failed')
    );

    const result = await clean({}, context);

    expect(result).toEqual({
      success: false,
      exitCode: 1,
      error: 'config load failed',
    });
    expect(context.logger.error).toHaveBeenCalledWith(
      'Clean command failed: config load failed'
    );
  });
});
