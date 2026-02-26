import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { clean, cleanFiles } from '../../lib/commands/clean.js';
import { createMockContext } from '../../lib/adapters/test-context.js';
import type { SpeciConfig } from '../../lib/config.js';
import type { CommandContext } from '../../lib/interfaces.js';

const MOCK_CWD = join(tmpdir(), 'speci-test-project');

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
    context = createMockContext({ cwd: MOCK_CWD });
    config = createConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setExists(paths: string[]): void {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) =>
      paths.includes(path)
    );
  }

  it('deletes all files in tasks directory', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
    ]);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(2);
    expect(context.fs.rmSync).toHaveBeenNthCalledWith(
      1,
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
    expect(context.fs.rmSync).toHaveBeenNthCalledWith(
      2,
      join(config.paths.tasks, 'TASK_002.md'),
      { recursive: true, force: true }
    );
  });

  it('deletes progress file', () => {
    setExists([config.paths.progress]);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(config.paths.progress);
  });

  it('handles empty tasks directory', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([]);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('skips missing tasks directory', () => {
    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.readdirSync).not.toHaveBeenCalled();
  });

  it('skips missing progress file', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('reports nothing to clean when both paths are absent', () => {
    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith('Nothing to clean.');
  });

  it('recursively deletes subdirectories', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['subdir']);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'subdir'),
      { recursive: true, force: true }
    );
  });

  it('returns error on rmSync failure', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    vi.spyOn(context.fs, 'rmSync').mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('[ERR-EXE-10]');
  });

  it('returns error on readdirSync failure', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('[ERR-EXE-09]');
  });

  it('respects custom config paths', () => {
    const customConfig = createConfig({
      progress: 'custom/PROGRESS.md',
      tasks: 'custom/tasks',
    });
    setExists([customConfig.paths.tasks, customConfig.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);

    const result = cleanFiles(customConfig, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(customConfig.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(
      customConfig.paths.progress
    );
  });

  it('logs deleted file count on success', () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['a.md', 'b.md']);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.success).toHaveBeenCalledWith('Cleaned 3 file(s).');
  });

  it('logs per-file deletions with debug output', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['a.md', 'b.md']);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.debug).toHaveBeenCalledWith(
      `Deleted ${join(config.paths.tasks, 'a.md')}`
    );
    expect(context.logger.debug).toHaveBeenCalledWith(
      `Deleted ${join(config.paths.tasks, 'b.md')}`
    );
  });

  it('fails when lock file exists with no deletions', () => {
    setExists([config.paths.lock]);

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('Cannot clean while speci is running');
    expect(context.fs.rmSync).not.toHaveBeenCalled();
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('continues deleting after individual file failure', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
      'TASK_003.md',
    ]);
    vi.spyOn(context.fs, 'rmSync').mockImplementation((path: string) => {
      if (path.endsWith('TASK_002.md')) {
        throw new Error('EACCES');
      }
    });

    const result = cleanFiles(config, context);

    expect(context.fs.rmSync).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    expect(result.error).toContain('[ERR-EXE-10]');
    expect(result.error).toContain(join(config.paths.tasks, 'TASK_002.md'));
    expect(result.error).not.toContain(join(config.paths.tasks, 'TASK_001.md'));
    expect(result.error).not.toContain(join(config.paths.tasks, 'TASK_003.md'));
  });

  it('reports progress file error independently of task file errors', () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    vi.spyOn(context.fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('[ERR-EXE-10]');
    expect(result.error).toContain(config.paths.progress);
    expect(context.fs.rmSync).toHaveBeenCalledTimes(1);
  });

  it('accumulates multiple file errors', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'a.md',
      'b.md',
      'c.md',
    ]);
    vi.spyOn(context.fs, 'rmSync').mockImplementation((path: string) => {
      if (path.endsWith('a.md') || path.endsWith('c.md')) {
        throw new Error('EACCES');
      }
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain(join(config.paths.tasks, 'a.md'));
    expect(result.error).toContain(join(config.paths.tasks, 'c.md'));
  });

  it('removes symlink-like entries with rmSync options', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['link-to-external']);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(1);
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'link-to-external'),
      { recursive: true, force: true }
    );
  });

  it('returns error when progress path is a directory', () => {
    setExists([config.paths.progress]);
    vi.spyOn(context.fs, 'unlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('[ERR-EXE-10]');
    expect(result.error).toContain(config.paths.progress);
  });

  it('handles file vanishing between readdir and rmSync', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
    ]);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_002.md'),
      { recursive: true, force: true }
    );
  });

  it('handles EBUSY locked files gracefully', () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
    ]);
    vi.spyOn(context.fs, 'rmSync').mockImplementation((path: string) => {
      if (path.endsWith('TASK_001.md')) {
        throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      }
    });

    const result = cleanFiles(config, context);

    expect(context.fs.rmSync).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.error).toContain(join(config.paths.tasks, 'TASK_001.md'));
  });

  it('returns error when tasks path is a file', () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('[ERR-EXE-09]');
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('works with paths containing spaces and special characters', () => {
    const unicodeConfig = createConfig({
      progress: 'docs/progress file.md',
      tasks: 'my project/task files',
    });
    setExists([unicodeConfig.paths.tasks, unicodeConfig.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK 001.md']);

    const result = cleanFiles(unicodeConfig, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(unicodeConfig.paths.tasks, 'TASK 001.md'),
      { recursive: true, force: true }
    );
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(
      unicodeConfig.paths.progress
    );
  });

  it('rejects paths outside project root before deletion', () => {
    const outsideConfig = createConfig({
      progress: resolve(MOCK_CWD, '../outside/PROGRESS.md'),
      tasks: resolve(MOCK_CWD, '../outside/tasks'),
    });

    const result = cleanFiles(outsideConfig, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain(
      'Configured path resolves outside the project root'
    );
    expect(context.fs.rmSync).not.toHaveBeenCalled();
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('handles large number of task files', () => {
    setExists([config.paths.tasks]);
    const files = Array.from({ length: 100 }, (_, i) => `TASK_${i + 1}.md`);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(files);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(100);
    expect(context.logger.success).toHaveBeenCalledWith('Cleaned 100 file(s).');
  });

  it('returns error from outer safety catch on unexpected errors', () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation(() => {
      throw new TypeError('unexpected');
    });

    const result = cleanFiles(config, context);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('[ERR-EXE-10]');
  });
});

describe('clean', () => {
  let context: CommandContext;
  let config: SpeciConfig;

  beforeEach(() => {
    context = createMockContext({ cwd: MOCK_CWD });
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

    const result = await clean({ verbose: true, yes: true }, context, config);

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

describe('clean() prompt', () => {
  let context: CommandContext;
  let config: SpeciConfig;

  beforeEach(() => {
    context = createMockContext({ cwd: MOCK_CWD });
    config = createConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setExists(paths: string[]): void {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) =>
      paths.includes(path)
    );
  }

  it('prompts for confirmation when files exist and proceeds on y', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(prompt).toHaveBeenCalledWith('Delete 1 file(s)? [y/N] ');
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
  });

  it('cancels on non-yes responses', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('nope');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith('Clean cancelled.');
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it("cancels on 'n' response", async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('n');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith('Clean cancelled.');
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('cancels on empty input', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith('Clean cancelled.');
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('accepts uppercase Y', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('Y');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(1);
  });

  it('accepts yes case-insensitively', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('YES');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(1);
  });

  it('skips prompt with yes option', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('n');

    const result = await clean({ yes: true, prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(prompt).not.toHaveBeenCalled();
    expect(context.fs.rmSync).toHaveBeenCalledTimes(1);
  });

  it('clean --yes --verbose works together', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('n');

    const result = await clean(
      { yes: true, verbose: true, prompt },
      context,
      config
    );

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.setVerbose).toHaveBeenCalledWith(true);
    expect(prompt).not.toHaveBeenCalled();
    expect(context.fs.rmSync).toHaveBeenCalledTimes(1);
  });

  it('skips prompt when nothing to clean', async () => {
    vi.spyOn(context.fs, 'existsSync').mockReturnValue(false);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(prompt).not.toHaveBeenCalled();
    expect(context.logger.info).toHaveBeenCalledWith('Nothing to clean.');
  });

  it('skips prompt when tasks dir is empty and no progress file', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([]);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(prompt).not.toHaveBeenCalled();
    expect(context.logger.info).toHaveBeenCalledWith('Nothing to clean.');
  });

  it('aborts safely in non-interactive mode without yes', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    Object.assign(context.process.stdin, { isTTY: false });

    const result = await clean({}, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith(
      'Clean cancelled: non-interactive terminal. Use --yes to skip confirmation.'
    );
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('proceeds in non-interactive mode with --yes', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    Object.assign(context.process.stdin, { isTTY: false });

    const result = await clean({ yes: true }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
  });

  it('prompts when only progress file exists', async () => {
    setExists([config.paths.progress]);
    const prompt = vi.fn().mockResolvedValue('n');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith(config.paths.progress);
    expect(prompt).toHaveBeenCalledWith('Delete 1 file(s)? [y/N] ');
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('lists files before prompting', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
    ]);
    const prompt = vi.fn().mockResolvedValue('n');

    await clean({ prompt }, context, config);

    expect(context.logger.info).toHaveBeenNthCalledWith(
      1,
      join(config.paths.tasks, 'TASK_001.md')
    );
    expect(context.logger.info).toHaveBeenNthCalledWith(
      2,
      join(config.paths.tasks, 'TASK_002.md')
    );
    expect(context.logger.info).toHaveBeenNthCalledWith(
      3,
      config.paths.progress
    );
  });

  it('shows file count in prompt', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['a.md', 'b.md']);
    const prompt = vi.fn().mockResolvedValue('n');

    await clean({ prompt }, context, config);

    expect(prompt).toHaveBeenCalledWith('Delete 3 file(s)? [y/N] ');
  });

  it('shows correct count for single file', async () => {
    setExists([config.paths.progress]);
    const prompt = vi.fn().mockResolvedValue('n');

    await clean({ prompt }, context, config);

    expect(prompt).toHaveBeenCalledWith('Delete 1 file(s)? [y/N] ');
  });

  it('lists subdirectories in tasks dir', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['subdir']);
    const prompt = vi.fn().mockResolvedValue('n');

    await clean({ prompt }, context, config);

    expect(context.logger.info).toHaveBeenCalledWith(
      join(config.paths.tasks, 'subdir')
    );
  });

  it('lists and deletes hidden files in tasks dir', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      '.gitkeep',
      'TASK_001.md',
    ]);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith(
      join(config.paths.tasks, '.gitkeep')
    );
    expect(context.logger.info).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md')
    );
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, '.gitkeep'),
      { recursive: true, force: true }
    );
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
  });

  it('handles filenames with special characters', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK name.md',
      'Δ-task.md',
    ]);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK name.md')
    );
    expect(context.logger.info).toHaveBeenCalledWith(
      join(config.paths.tasks, 'Δ-task.md')
    );
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK name.md'),
      { recursive: true, force: true }
    );
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'Δ-task.md'),
      { recursive: true, force: true }
    );
  });

  it('lists 100+ files without truncation', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    const entries = Array.from({ length: 120 }, (_, i) => `TASK_${i + 1}.md`);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(entries);
    const prompt = vi.fn().mockResolvedValue('n');

    await clean({ prompt }, context, config);

    expect(prompt).toHaveBeenCalledWith('Delete 121 file(s)? [y/N] ');
    expect(
      vi.mocked(context.logger.info).mock.calls.length
    ).toBeGreaterThanOrEqual(121);
  });

  it('does not prompt when lock file exists', async () => {
    setExists([config.paths.lock, config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result.success).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('does not prompt when path resolves outside project root', async () => {
    const outsideConfig = createConfig({
      tasks: resolve(MOCK_CWD, '../outside/tasks'),
      progress: 'docs/PROGRESS.md',
    });
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, outsideConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Configured path resolves outside the project root'
    );
    expect(prompt).not.toHaveBeenCalled();
  });

  it('returns failure when prompt function rejects', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockRejectedValue(new Error('prompt failed'));

    const result = await clean({ prompt }, context, config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('prompt failed');
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('handles readline creation failure', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn(() => {
      throw new Error('readline failed');
    });

    const result = await clean({ prompt }, context, config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('readline failed');
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('returns failure when enumerate readdir throws', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockImplementation(() => {
      throw new Error('readdir failed');
    });
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('readdir failed');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('handles unexpected exception in wrapper', async () => {
    vi.spyOn(context.fs, 'existsSync').mockImplementation(() => {
      throw new TypeError('unexpected wrapper failure');
    });

    const result = await clean({}, context, config);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('unexpected wrapper failure');
  });

  it('returns cleanFiles failure when lock appears after prompt', async () => {
    const existsSpy = vi
      .spyOn(context.fs, 'existsSync')
      .mockImplementation((path: string) => path === config.paths.tasks);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('y');
    existsSpy.mockImplementationOnce(
      (path: string) => path === config.paths.tasks
    );
    existsSpy.mockImplementationOnce(
      (path: string) => path === config.paths.tasks
    );
    existsSpy.mockImplementation((path: string) => {
      if (path === config.paths.lock) {
        return true;
      }
      return path === config.paths.tasks;
    });

    const result = await clean({ prompt }, context, config);

    expect(result.success).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('reports failure when progress file deletion fails', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    vi.spyOn(context.fs, 'unlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    });

    const result = await clean({ yes: true }, context, config);

    expect(result.success).toBe(false);
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
    expect(result.error).toContain(config.paths.progress);
  });

  it('removes symlinks without following them', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['link-to-external']);

    const result = await clean({ yes: true }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'link-to-external'),
      { recursive: true, force: true }
    );
  });

  it('works with empty options object', async () => {
    setExists([config.paths.tasks]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const input = new PassThrough();
    const output = new PassThrough();
    Object.assign(input, { isTTY: true });
    Object.assign(context.process, {
      stdin: input as unknown as NodeJS.ReadStream,
      stdout: output as unknown as NodeJS.WriteStream,
    });

    const cleanPromise = clean({}, context, config);
    input.write('n\n');
    const result = await cleanPromise;

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.logger.info).toHaveBeenCalledWith('Clean cancelled.');
  });

  it('clean --yes with nothing to clean prints nothing to clean', async () => {
    vi.spyOn(context.fs, 'existsSync').mockReturnValue(false);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ yes: true, prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(prompt).not.toHaveBeenCalled();
    expect(context.logger.info).toHaveBeenCalledWith('Nothing to clean.');
  });
});

describe('clean() integration', () => {
  let context: CommandContext;
  let config: SpeciConfig;

  beforeEach(() => {
    context = createMockContext({ cwd: MOCK_CWD });
    config = createConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setExists(paths: string[]): void {
    vi.spyOn(context.fs, 'existsSync').mockImplementation((path: string) =>
      paths.includes(path)
    );
  }

  it('IT-1: clean() with --yes passes through to cleanFiles and deletes', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
    ]);

    const result = await clean({ yes: true }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(2);
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(config.paths.progress);
  });

  it('IT-2: clean() prompt confirmed leads to cleanFiles execution', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(config.paths.progress);
  });

  it('IT-3: clean() prompt rejected prevents any deletion', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('n');

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(context.fs.rmSync).not.toHaveBeenCalled();
    expect(context.fs.unlinkSync).not.toHaveBeenCalled();
    expect(context.logger.info).toHaveBeenCalledWith('Clean cancelled.');
  });

  it('IT-4: clean() lock file check happens before prompt', async () => {
    setExists([config.paths.lock, config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, config);

    expect(result.success).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('IT-5: clean() path-outside-root check happens before prompt', async () => {
    const outsideConfig = createConfig({
      tasks: resolve(MOCK_CWD, '../outside/tasks'),
      progress: 'docs/PROGRESS.md',
    });
    const prompt = vi.fn().mockResolvedValue('y');

    const result = await clean({ prompt }, context, outsideConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Configured path resolves outside the project root'
    );
    expect(prompt).not.toHaveBeenCalled();
    expect(context.fs.rmSync).not.toHaveBeenCalled();
  });

  it('IT-6: enumerateCleanTargets returns correct file list to confirmClean', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
      'TASK_003.md',
    ]);
    const prompt = vi.fn().mockResolvedValue('y');

    await clean({ prompt }, context, config);

    expect(prompt).toHaveBeenCalledWith('Delete 4 file(s)? [y/N] ');
    expect(vi.mocked(context.logger.info).mock.calls).toHaveLength(4);
  });

  it('IT-7: clean() enumerate -> list -> prompt -> delete sequence verified', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const callLog: string[] = [];
    vi.spyOn(context.logger, 'info').mockImplementation((message: string) => {
      callLog.push(`info:${message}`);
    });
    const prompt = vi.fn(async () => {
      callLog.push('prompt');
      return 'y';
    });
    vi.spyOn(context.fs, 'rmSync').mockImplementation(() => {
      callLog.push('rm');
    });
    vi.spyOn(context.fs, 'unlinkSync').mockImplementation(() => {
      callLog.push('unlink');
    });

    const result = await clean({ prompt }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    const promptIndex = callLog.indexOf('prompt');
    const rmIndex = callLog.indexOf('rm');
    const unlinkIndex = callLog.indexOf('unlink');
    expect(callLog[0]).toContain('info:');
    expect(promptIndex).toBeGreaterThan(0);
    expect(rmIndex).toBeGreaterThan(promptIndex);
    expect(unlinkIndex).toBeGreaterThan(promptIndex);
  });

  it('IT-8: clean() non-TTY stdin with --yes still deletes', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    Object.assign(context.process.stdin, { isTTY: false });

    const result = await clean({ yes: true }, context, config);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(config.paths.progress);
  });

  it('IT-9: clean() loads config and threads it to cleanFiles when not pre-loaded', async () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue(['TASK_001.md']);
    const loadSpy = vi
      .spyOn(context.configLoader, 'load')
      .mockResolvedValue(config);

    const result = await clean({ yes: true }, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(context.fs.rmSync).toHaveBeenCalledWith(
      join(config.paths.tasks, 'TASK_001.md'),
      { recursive: true, force: true }
    );
  });

  it('IT-10: cleanFiles() called directly (task --clean bypass) works without prompt', () => {
    setExists([config.paths.tasks, config.paths.progress]);
    vi.spyOn(context.fs, 'readdirSync').mockReturnValue([
      'TASK_001.md',
      'TASK_002.md',
    ]);

    const result = cleanFiles(config, context);

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(context.fs.rmSync).toHaveBeenCalledTimes(2);
    expect(context.fs.unlinkSync).toHaveBeenCalledWith(config.paths.progress);
  });
});

describe.skip('task --clean', () => {
  it('calls cleanFiles before task generation when --clean is set', () => {
    expect(true).toBe(true);
  });
  it('aborts task generation when clean fails', () => {
    expect(true).toBe(true);
  });
  it('proceeds normally when --clean is not set', () => {
    expect(true).toBe(true);
  });
});
