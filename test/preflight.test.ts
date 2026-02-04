import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  preflight,
  checkCopilotInstalled,
  checkConfigExists,
  checkProgressExists,
  checkGitRepository,
  PreflightError,
  type PreflightOptions,
} from '../lib/utils/preflight.js';
import type { SpeciConfig } from '../lib/config.js';

// Mock execSync for copilot checks
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('preflight', () => {
  let testDir: string;
  let originalCwd: string;
  const mockExecSync = vi.mocked(execSync);

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('PreflightError', () => {
    it('should create error with check name and remediation steps', () => {
      const error = new PreflightError('Test Check', 'Test message', [
        'Step 1',
        'Step 2',
      ]);

      expect(error.name).toBe('PreflightError');
      expect(error.message).toBe('Test message');
      expect(error.check).toBe('Test Check');
      expect(error.exitCode).toBe(2);
      expect(error.remediation).toEqual(['Step 1', 'Step 2']);
    });
  });

  describe('checkCopilotInstalled', () => {
    it('should succeed when copilot is in PATH', async () => {
      mockExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/copilot'));

      await expect(checkCopilotInstalled()).resolves.toBeUndefined();

      // Verify correct command was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringMatching(/which copilot|where copilot/),
        expect.objectContaining({
          stdio: 'pipe',
          encoding: 'utf8',
        })
      );
    });

    it('should throw PreflightError when copilot not found', async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Command failed');
      });

      await expect(checkCopilotInstalled()).rejects.toThrow(PreflightError);

      try {
        await checkCopilotInstalled();
      } catch (err) {
        expect(err).toBeInstanceOf(PreflightError);
        const error = err as PreflightError;
        expect(error.check).toBe('Copilot CLI not found');
        expect(error.remediation.length).toBeGreaterThan(0);
        expect(error.remediation.some((step) => step.includes('Install'))).toBe(
          true
        );
      }
    });
  });

  describe('checkConfigExists', () => {
    it('should succeed when config exists in cwd', async () => {
      writeFileSync(join(testDir, 'speci.config.json'), '{}');

      await expect(checkConfigExists()).resolves.toBeUndefined();
    });

    it('should succeed when config exists in parent directory', async () => {
      const subDir = join(testDir, 'sub');
      mkdirSync(subDir);
      writeFileSync(join(testDir, 'speci.config.json'), '{}');
      process.chdir(subDir);

      await expect(checkConfigExists()).resolves.toBeUndefined();
    });

    it('should throw PreflightError when config not found', async () => {
      await expect(checkConfigExists()).rejects.toThrow(PreflightError);

      try {
        await checkConfigExists();
      } catch (err) {
        expect(err).toBeInstanceOf(PreflightError);
        const error = err as PreflightError;
        expect(error.check).toBe('Configuration not found');
        expect(
          error.remediation.some((step) => step.includes('speci init'))
        ).toBe(true);
      }
    });
  });

  describe('checkProgressExists', () => {
    it('should succeed when progress file exists', async () => {
      const progressPath = join(testDir, 'docs', 'PROGRESS.md');
      mkdirSync(join(testDir, 'docs'), { recursive: true });
      writeFileSync(progressPath, '# Progress');

      const mockConfig: SpeciConfig = {
        version: '1.0.0',
        paths: {
          progress: progressPath,
          tasks: '',
          logs: '',
          lock: '',
        },
        agents: {
          plan: null,
          task: null,
          refactor: null,
          impl: null,
          review: null,
          fix: null,
          tidy: null,
        },
        copilot: {
          permissions: 'allow-all',
          model: null,
          extraFlags: [],
        },
        gate: {
          commands: [],
          maxFixAttempts: 5,
        },
        loop: {
          maxIterations: 100,
        },
      };

      await expect(checkProgressExists(mockConfig)).resolves.toBeUndefined();
    });

    it('should throw PreflightError when progress file missing', async () => {
      const progressPath = join(testDir, 'docs', 'PROGRESS.md');

      const mockConfig: SpeciConfig = {
        version: '1.0.0',
        paths: {
          progress: progressPath,
          tasks: '',
          logs: '',
          lock: '',
        },
        agents: {
          plan: null,
          task: null,
          refactor: null,
          impl: null,
          review: null,
          fix: null,
          tidy: null,
        },
        copilot: {
          permissions: 'allow-all',
          model: null,
          extraFlags: [],
        },
        gate: {
          commands: [],
          maxFixAttempts: 5,
        },
        loop: {
          maxIterations: 100,
        },
      };

      await expect(checkProgressExists(mockConfig)).rejects.toThrow(
        PreflightError
      );

      try {
        await checkProgressExists(mockConfig);
      } catch (err) {
        expect(err).toBeInstanceOf(PreflightError);
        const error = err as PreflightError;
        expect(error.check).toBe('Progress file not found');
        expect(error.message).toContain(progressPath);
      }
    });
  });

  describe('checkGitRepository', () => {
    it('should succeed when in git repository', async () => {
      mkdirSync(join(testDir, '.git'));

      await expect(checkGitRepository()).resolves.toBeUndefined();
    });

    it('should succeed when git exists in parent directory', async () => {
      const subDir = join(testDir, 'sub');
      mkdirSync(subDir);
      mkdirSync(join(testDir, '.git'));
      process.chdir(subDir);

      await expect(checkGitRepository()).resolves.toBeUndefined();
    });

    it('should throw PreflightError when not in git repository', async () => {
      await expect(checkGitRepository()).rejects.toThrow(PreflightError);

      try {
        await checkGitRepository();
      } catch (err) {
        expect(err).toBeInstanceOf(PreflightError);
        const error = err as PreflightError;
        expect(error.check).toBe('Git repository not found');
        expect(
          error.remediation.some((step) => step.includes('git init'))
        ).toBe(true);
      }
    });
  });

  describe('preflight', () => {
    let mockConfig: SpeciConfig;

    beforeEach(() => {
      mockConfig = {
        version: '1.0.0',
        paths: {
          progress: join(testDir, 'docs', 'PROGRESS.md'),
          tasks: '',
          logs: '',
          lock: '',
        },
        agents: {
          plan: null,
          task: null,
          refactor: null,
          impl: null,
          review: null,
          fix: null,
          tidy: null,
        },
        copilot: {
          permissions: 'allow-all',
          model: null,
          extraFlags: [],
        },
        gate: {
          commands: [],
          maxFixAttempts: 5,
        },
        loop: {
          maxIterations: 100,
        },
      };
    });

    it('should run all checks when no options provided', async () => {
      // Setup environment for all checks to pass
      mockExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/copilot'));
      writeFileSync(join(testDir, 'speci.config.json'), '{}');
      mkdirSync(join(testDir, '.git'));

      await expect(preflight(mockConfig)).resolves.toBeUndefined();
    });

    it('should respect disabled checks', async () => {
      // Don't setup git or copilot, but disable those checks
      writeFileSync(join(testDir, 'speci.config.json'), '{}');

      const options: PreflightOptions = {
        requireCopilot: false,
        requireGit: false,
        requireConfig: true,
        requireProgress: false,
      };

      await expect(preflight(mockConfig, options)).resolves.toBeUndefined();

      // Verify copilot check was not called
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should run progress check when required', async () => {
      mockExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/copilot'));
      writeFileSync(join(testDir, 'speci.config.json'), '{}');
      mkdirSync(join(testDir, '.git'));
      mkdirSync(join(testDir, 'docs'), { recursive: true });
      writeFileSync(join(testDir, 'docs', 'PROGRESS.md'), '# Progress');

      const options: PreflightOptions = {
        requireProgress: true,
      };

      await expect(preflight(mockConfig, options)).resolves.toBeUndefined();
    });

    it('should throw on first failure', async () => {
      // Setup copilot to fail
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Command failed');
      });

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);

      await expect(preflight(mockConfig)).rejects.toThrow();

      exitSpy.mockRestore();
    });
  });

  describe('performance', () => {
    it('should complete all checks in under 100ms', async () => {
      // Setup environment for all checks to pass quickly
      mockExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/copilot'));
      writeFileSync(join(testDir, 'speci.config.json'), '{}');
      mkdirSync(join(testDir, '.git'));
      mkdirSync(join(testDir, 'docs'), { recursive: true });
      writeFileSync(join(testDir, 'docs', 'PROGRESS.md'), '# Progress');

      const mockConfig: SpeciConfig = {
        version: '1.0.0',
        paths: {
          progress: join(testDir, 'docs', 'PROGRESS.md'),
          tasks: '',
          logs: '',
          lock: '',
        },
        agents: {
          plan: null,
          task: null,
          refactor: null,
          impl: null,
          review: null,
          fix: null,
          tidy: null,
        },
        copilot: {
          permissions: 'allow-all',
          model: null,
          extraFlags: [],
        },
        gate: {
          commands: [],
          maxFixAttempts: 5,
        },
        loop: {
          maxIterations: 100,
        },
      };

      const options: PreflightOptions = {
        requireProgress: true,
      };

      const startTime = Date.now();
      await preflight(mockConfig, options);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });
  });
});
