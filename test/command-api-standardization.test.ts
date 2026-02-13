/**
 * Tests for TASK_027: Standardize Command API
 *
 * Verifies that all command modules conform to standardized API contract:
 * - All commands return Promise<CommandResult>
 * - CommandResult has correct shape: { success, exitCode, error? }
 * - No commands call process.exit() directly (return exit codes instead)
 * - All commands accept options with defaults
 * - Side effects are documented
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../lib/commands/init.js';
import { plan } from '../lib/commands/plan.js';
import { task } from '../lib/commands/task.js';
import { refactor } from '../lib/commands/refactor.js';
import { status } from '../lib/commands/status.js';
import { createMockContext } from '../lib/adapters/test-context.js';
import type { CommandContext, CommandResult } from '../lib/interfaces.js';
import type { SpeciConfig } from '../lib/types.js';

describe('Command API Standardization (TASK_027)', () => {
  let testDir: string;
  let originalCwd: string;
  let mockContext: CommandContext;
  let mockConfig: SpeciConfig;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();

    // Create isolated test directory
    testDir = join(tmpdir(), `speci-api-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    // Create mock config
    mockConfig = {
      version: '1.0.0',
      paths: {
        progress: 'docs/PROGRESS.md',
        tasks: 'docs/tasks',
        logs: '.speci-logs',
        lock: '.speci-lock',
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
        commands: ['npm run lint'],
        maxFixAttempts: 5,
      },
      loop: {
        maxIterations: 100,
      },
    };

    // Create mock context
    mockContext = createMockContext({
      mockConfig,
      cwd: testDir,
    });

    // Mock copilot runner to avoid actual spawns
    vi.spyOn(mockContext.copilotRunner, 'spawn').mockResolvedValue(0);
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  describe('CommandResult return type', () => {
    it('init command returns CommandResult on success', async () => {
      const result = await init({}, mockContext, mockConfig);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.exitCode).toBe('number');
    });

    it('plan command returns CommandResult on success', async () => {
      // Setup prerequisites
      mkdirSync('.git', { recursive: true });
      mkdirSync('.github/agents', { recursive: true });
      writeFileSync('.github/agents/speci-plan.agent.md', '# Plan Agent');

      const result = await plan({ prompt: 'test' }, mockContext, mockConfig);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.exitCode).toBe('number');
    });

    it('task command returns CommandResult on success', async () => {
      // Setup prerequisites
      mkdirSync('.git', { recursive: true });
      mkdirSync('.github/agents', { recursive: true });
      writeFileSync('.github/agents/speci-task.agent.md', '# Task Agent');
      writeFileSync('plan.md', '# Plan');

      const result = await task({ plan: 'plan.md' }, mockContext, mockConfig);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.exitCode).toBe('number');
    });

    it('refactor command returns CommandResult on success', async () => {
      // Setup prerequisites
      mkdirSync('.git', { recursive: true });
      mkdirSync('.github/agents', { recursive: true });
      writeFileSync(
        '.github/agents/speci-refactor.agent.md',
        '# Refactor Agent'
      );

      const result = await refactor({}, mockContext, mockConfig);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.exitCode).toBe('number');
    });

    it('status command returns CommandResult on success', async () => {
      // Setup for JSON mode (simplest)
      mkdirSync('docs', { recursive: true });
      writeFileSync('docs/PROGRESS.md', '# Progress');
      writeFileSync('speci.config.json', JSON.stringify(mockConfig, null, 2));

      const result = await status({ json: true }, mockContext, mockConfig);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.exitCode).toBe('number');
    });
  });

  describe('Success path returns correct values', () => {
    it('status command returns exitCode 0 on success (JSON mode)', async () => {
      // Setup for JSON mode (simplest successful case)
      mkdirSync('docs', { recursive: true });
      writeFileSync('docs/PROGRESS.md', '# Progress');
      writeFileSync('speci.config.json', JSON.stringify(mockConfig, null, 2));

      const result = await status({ json: true }, mockContext, mockConfig);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('commands return success: true when operation succeeds', async () => {
      mkdirSync('docs', { recursive: true });
      writeFileSync('docs/PROGRESS.md', '# Progress');
      writeFileSync('speci.config.json', JSON.stringify(mockConfig, null, 2));

      const result = await status({ json: true }, mockContext, mockConfig);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error path returns correct values', () => {
    it('plan command returns error result when prompt missing', async () => {
      const result = await plan({}, mockContext, mockConfig);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    it('task command returns error result when plan missing', async () => {
      const result = await task({} as never, mockContext, mockConfig);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.error).toBeDefined();
    });

    it('error messages are captured in result.error field', async () => {
      const result = await plan({}, mockContext, mockConfig);

      expect(result.error).toContain('Missing required input');
    });
  });

  describe('Options with default values', () => {
    it('init accepts empty options object', async () => {
      const result = await init({}, mockContext, mockConfig);
      expect(result).toBeDefined();
    });

    it('plan accepts empty options object (validates and fails)', async () => {
      const result = await plan({}, mockContext, mockConfig);
      // Should fail validation, but not throw
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });

    it('refactor accepts empty options object', async () => {
      mkdirSync('.git', { recursive: true });
      mkdirSync('.github/agents', { recursive: true });
      writeFileSync(
        '.github/agents/speci-refactor.agent.md',
        '# Refactor Agent'
      );

      const result = await refactor({}, mockContext, mockConfig);
      expect(result).toBeDefined();
    });

    it('status accepts empty options object', async () => {
      mkdirSync('docs', { recursive: true });
      writeFileSync('docs/PROGRESS.md', '# Progress');
      writeFileSync('speci.config.json', JSON.stringify(mockConfig, null, 2));

      const result = await status({}, mockContext, mockConfig);
      expect(result).toBeDefined();
    });
  });

  describe('Exit code consistency', () => {
    it('success returns exitCode 0', async () => {
      // Setup for JSON mode (simplest successful case)
      mkdirSync('docs', { recursive: true });
      writeFileSync('docs/PROGRESS.md', '# Progress');
      writeFileSync('speci.config.json', JSON.stringify(mockConfig, null, 2));

      const result = await status({ json: true }, mockContext, mockConfig);
      expect(result.exitCode).toBe(0);
    });

    it('validation errors return exitCode 1 or 2', async () => {
      const result = await plan({}, mockContext, mockConfig);
      expect([1, 2]).toContain(result.exitCode);
    });
  });

  describe('No process.exit() calls', () => {
    it('commands do not call process.exit() on success', async () => {
      const exitSpy = vi.spyOn(mockContext.process, 'exit');

      // Setup for JSON mode (simplest successful case)
      mkdirSync('docs', { recursive: true });
      writeFileSync('docs/PROGRESS.md', '# Progress');
      writeFileSync('speci.config.json', JSON.stringify(mockConfig, null, 2));

      await status({ json: true }, mockContext, mockConfig);

      // Command should return result, not call process.exit()
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('commands do not call process.exit() on error', async () => {
      const exitSpy = vi.spyOn(mockContext.process, 'exit');

      await plan({}, mockContext, mockConfig);

      // Command should return error result, not call process.exit()
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  /**
   * Helper to validate CommandResult shape
   */
  function isValidCommandResult(result: unknown): result is CommandResult {
    if (typeof result !== 'object' || result === null) return false;
    const r = result as Record<string, unknown>;
    return (
      typeof r.success === 'boolean' &&
      typeof r.exitCode === 'number' &&
      (r.error === undefined || typeof r.error === 'string')
    );
  }

  describe('CommandResult shape validation', () => {
    it('all commands return valid CommandResult shape', async () => {
      // Setup for status command (simplest case)
      mkdirSync('docs', { recursive: true });
      writeFileSync('docs/PROGRESS.md', '# Progress');
      const statusResult = await status(
        { json: true },
        mockContext,
        mockConfig
      );
      expect(isValidCommandResult(statusResult)).toBe(true);

      // Test error case as well
      const planErrorResult = await plan({}, mockContext, mockConfig);
      expect(isValidCommandResult(planErrorResult)).toBe(true);
    });
  });
});
