/**
 * Tests for command-helpers module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  normalizeAgentName,
  validateAgentFile,
  initializeCommand,
} from '../lib/utils/command-helpers.js';
import * as banner from '../lib/ui/banner.js';
import * as preflight from '../lib/utils/preflight.js';
import { createMockContext } from '../lib/adapters/test-context.js';
import type { SpeciConfig } from '../lib/config.js';

describe('command-helpers', () => {
  describe('normalizeAgentName', () => {
    it('should use default agent name when override is undefined', () => {
      const result = normalizeAgentName('plan');
      expect(result).toBe('speci-plan');
    });

    it('should use default agent name when override is null', () => {
      const result = normalizeAgentName('task', null);
      expect(result).toBe('speci-task');
    });

    it('should strip .agent.md suffix from override', () => {
      const result = normalizeAgentName('plan', 'custom-agent.agent.md');
      expect(result).toBe('custom-agent');
    });

    it('should handle override without .agent.md suffix', () => {
      const result = normalizeAgentName('refactor', 'my-custom');
      expect(result).toBe('my-custom');
    });

    it('should handle multiple .agent.md occurrences', () => {
      const result = normalizeAgentName(
        'plan',
        'test.agent.md.agent.md.agent.md'
      );
      expect(result).toBe('test.agent.md.agent.md');
    });

    it('should handle empty string override', () => {
      const result = normalizeAgentName('plan', '');
      expect(result).toBe('speci-plan');
    });

    it('should work with all command names', () => {
      expect(normalizeAgentName('plan')).toBe('speci-plan');
      expect(normalizeAgentName('task')).toBe('speci-task');
      expect(normalizeAgentName('refactor')).toBe('speci-refactor');
      expect(normalizeAgentName('impl')).toBe('speci-impl');
      expect(normalizeAgentName('review')).toBe('speci-review');
      expect(normalizeAgentName('fix')).toBe('speci-fix');
    });
  });

  describe('validateAgentFile', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
      mockContext = createMockContext();
    });

    it('should not throw when agent file exists', () => {
      const agentPath = join(mockContext.process.cwd(), 'agent.md');
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(true);

      expect(() => validateAgentFile(agentPath, mockContext)).not.toThrow();
    });

    it('should throw when agent file does not exist', () => {
      const agentPath = join(mockContext.process.cwd(), 'missing.md');
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(false);

      expect(() => validateAgentFile(agentPath, mockContext)).toThrow(
        `Agent file not found: ${agentPath}`
      );
    });

    it('should throw error with correct message format', () => {
      const agentPath = '/path/to/agent.md';
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(false);

      expect(() => validateAgentFile(agentPath, mockContext)).toThrow(
        'Agent file not found: /path/to/agent.md'
      );
    });

    it('should handle absolute paths', () => {
      const agentPath = '/absolute/path/to/agent.md';
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(true);

      expect(() => validateAgentFile(agentPath, mockContext)).not.toThrow();
    });

    it('should handle Windows paths', () => {
      const agentPath = 'C:\\path\\to\\agent.md';
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(true);

      expect(() => validateAgentFile(agentPath, mockContext)).not.toThrow();
    });

    it('should handle relative paths', () => {
      const agentPath = './relative/path/agent.md';
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(true);

      expect(() => validateAgentFile(agentPath, mockContext)).not.toThrow();
    });
  });

  describe('initializeCommand', () => {
    let mockContext: ReturnType<typeof createMockContext>;
    let mockConfig: SpeciConfig;
    let renderBannerSpy: ReturnType<typeof vi.fn>;
    let loadConfigSpy: ReturnType<typeof vi.fn>;
    let preflightSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockContext = createMockContext();
      mockConfig = {
        version: '1.0.0',
        paths: {
          progress: 'docs/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: '.speci/logs',
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
          model: null,
          models: {
            plan: null,
            task: null,
            refactor: null,
            impl: null,
            review: null,
            fix: null,
            tidy: null,
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

      renderBannerSpy = vi.spyOn(banner, 'renderBanner').mockReturnValue('');
      loadConfigSpy = vi
        .spyOn(mockContext.configLoader, 'load')
        .mockResolvedValue(mockConfig);
      preflightSpy = vi
        .spyOn(preflight, 'preflight')
        .mockResolvedValue(undefined);

      // Mock agent file exists
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should orchestrate full initialization sequence', async () => {
      const result = await initializeCommand({
        commandName: 'plan',
        context: mockContext,
      });

      expect(renderBannerSpy).toHaveBeenCalledOnce();
      expect(loadConfigSpy).toHaveBeenCalledOnce();
      expect(preflightSpy).toHaveBeenCalledWith(
        mockConfig,
        {
          requireCopilot: true,
          requireConfig: true,
          requireProgress: false,
          requireGit: false,
        },
        mockContext.process
      );
      expect(result.config).toBe(mockConfig);
      expect(result.agentName).toBe('speci-plan');
      expect(result.agentPath).toContain('speci-plan.agent.md');
    });

    it('should skip banner when skipBanner is true', async () => {
      await initializeCommand({
        commandName: 'task',
        skipBanner: true,
        context: mockContext,
      });

      expect(renderBannerSpy).not.toHaveBeenCalled();
      expect(loadConfigSpy).toHaveBeenCalledOnce();
    });

    it('should skip preflight when skipPreflight is true', async () => {
      await initializeCommand({
        commandName: 'refactor',
        skipPreflight: true,
        context: mockContext,
      });

      expect(renderBannerSpy).toHaveBeenCalledOnce();
      expect(loadConfigSpy).toHaveBeenCalledOnce();
      expect(preflightSpy).not.toHaveBeenCalled();
    });

    it('should use custom agent name when agentOverride is provided', async () => {
      const result = await initializeCommand({
        commandName: 'plan',
        agentOverride: 'custom-agent.agent.md',
        context: mockContext,
      });

      expect(result.agentName).toBe('custom-agent');
      expect(result.agentPath).toContain('custom-agent.agent.md');
    });

    it('should throw when agent file does not exist', async () => {
      vi.spyOn(mockContext.fs, 'existsSync').mockReturnValue(false);

      await expect(
        initializeCommand({
          commandName: 'plan',
          context: mockContext,
        })
      ).rejects.toThrow('Agent file not found');
    });

    it('should pass through config loading errors', async () => {
      loadConfigSpy.mockRejectedValue(new Error('Config file not found'));

      await expect(
        initializeCommand({
          commandName: 'plan',
          context: mockContext,
        })
      ).rejects.toThrow('Config file not found');
    });

    it('should pass through preflight errors', async () => {
      preflightSpy.mockRejectedValue(new Error('Copilot CLI not found'));

      await expect(
        initializeCommand({
          commandName: 'task',
          context: mockContext,
        })
      ).rejects.toThrow('Copilot CLI not found');
    });

    it('should handle all command names correctly', async () => {
      const commands = ['plan', 'task', 'refactor', 'impl', 'review', 'fix'];

      for (const cmd of commands) {
        const result = await initializeCommand({
          commandName: cmd as
            | 'plan'
            | 'task'
            | 'refactor'
            | 'impl'
            | 'review'
            | 'fix',
          context: mockContext,
        });

        expect(result.agentName).toBe(`speci-${cmd}`);
        expect(result.agentPath).toContain(`speci-${cmd}.agent.md`);
      }
    });

    it('should work with skipBanner and skipPreflight combined', async () => {
      const result = await initializeCommand({
        commandName: 'plan',
        skipBanner: true,
        skipPreflight: true,
        context: mockContext,
      });

      expect(renderBannerSpy).not.toHaveBeenCalled();
      expect(preflightSpy).not.toHaveBeenCalled();
      expect(loadConfigSpy).toHaveBeenCalledOnce();
      expect(result.config).toBe(mockConfig);
    });

    it('should return correct agent path format', async () => {
      const result = await initializeCommand({
        commandName: 'plan',
        context: mockContext,
      });

      expect(result.agentPath).toMatch(
        /\.github[/\\]agents[/\\]speci-plan\.agent\.md$/
      );
    });

    it('should handle agent path resolution with custom agent', async () => {
      const result = await initializeCommand({
        commandName: 'refactor',
        agentOverride: 'my-refactor.agent.md',
        context: mockContext,
      });

      expect(result.agentName).toBe('my-refactor');
      expect(result.agentPath).toContain('my-refactor.agent.md');
    });
  });
});
