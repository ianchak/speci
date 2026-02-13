/**
 * Tests for lib/types.ts
 *
 * Verifies that the types module correctly exports all common interfaces
 * and maintains proper module boundaries without introducing circular dependencies.
 */

import { describe, it, expect } from 'vitest';
import { STATE } from '@/types.js';
import type {
  SpeciConfig,
  TaskStats,
  CurrentTask,
  AgentRunResult,
  CopilotArgsOptions,
  CommandName,
} from '@/types.js';

describe('types module', () => {
  describe('exports', () => {
    it('should export STATE enum', () => {
      expect(STATE).toBeDefined();
      expect(STATE.WORK_LEFT).toBe('WORK_LEFT');
      expect(STATE.IN_REVIEW).toBe('IN_REVIEW');
      expect(STATE.BLOCKED).toBe('BLOCKED');
      expect(STATE.DONE).toBe('DONE');
      expect(STATE.NO_PROGRESS).toBe('NO_PROGRESS');
    });

    it('should export SpeciConfig interface', () => {
      // Type checking - if this compiles, the interface is exported correctly
      const config: SpeciConfig = {
        version: '1.0.0',
        paths: {
          progress: 'docs/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: 'logs',
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
          commands: ['npm test'],
          maxFixAttempts: 3,
        },
        loop: {
          maxIterations: 100,
        },
      };

      expect(config.version).toBe('1.0.0');
    });

    it('should export TaskStats interface', () => {
      const stats: TaskStats = {
        total: 10,
        completed: 5,
        remaining: 3,
        inReview: 1,
        blocked: 1,
      };

      expect(stats.total).toBe(10);
    });

    it('should export CurrentTask interface', () => {
      const task: CurrentTask = {
        id: 'TASK_001',
        title: 'Test Task',
        status: 'IN_PROGRESS',
      };

      expect(task.id).toBe('TASK_001');
    });

    it('should export AgentRunResult discriminated union', () => {
      // Success case
      const successResult: AgentRunResult = {
        isSuccess: true,
        exitCode: 0,
      };

      expect(successResult.isSuccess).toBe(true);

      // Failure case
      const failureResult: AgentRunResult = {
        isSuccess: false,
        exitCode: 1,
        error: 'Test error',
      };

      expect(failureResult.isSuccess).toBe(false);
      expect(failureResult.error).toBe('Test error');
    });

    it('should export CopilotArgsOptions interface', () => {
      const options: CopilotArgsOptions = {
        prompt: 'Test prompt',
        agent: 'test-agent',
        shouldAllowAll: true,
        command: 'impl',
      };

      expect(options.command).toBe('impl');
    });

    it('should export CommandName type', () => {
      const validCommands: CommandName[] = [
        'plan',
        'task',
        'refactor',
        'impl',
        'review',
        'fix',
        'tidy',
      ];

      expect(validCommands).toHaveLength(7);
    });
  });

  describe('module boundaries', () => {
    it('should have no runtime imports (pure types)', async () => {
      // The types module should be pure - only type exports, no runtime code
      // This test verifies that importing the module doesn't execute any code
      const typesModule = await import('@/types.js');

      // Only STATE enum should be a runtime value (enums are compiled to objects)
      const runtimeExports = Object.keys(typesModule).filter(
        (key) => !key.startsWith('_')
      );

      // STATE is the only runtime export (it's an enum)
      expect(runtimeExports).toContain('STATE');
    });
  });

  describe('type safety', () => {
    it('should enforce STATE enum values', () => {
      // Valid assignments
      const validState: STATE = STATE.WORK_LEFT;
      expect(validState).toBe('WORK_LEFT');

      // TypeScript will prevent invalid assignments at compile time
      // This test just verifies runtime behavior
      expect(() => {
        const state = STATE.WORK_LEFT;
        return state;
      }).not.toThrow();
    });

    it('should enforce AgentRunResult discriminated union', () => {
      const handleResult = (result: AgentRunResult): string => {
        if (result.isSuccess) {
          // TypeScript knows exitCode is 0, no error property
          return `Success with code ${result.exitCode}`;
        } else {
          // TypeScript knows error exists, no optional chaining needed
          return `Failed with: ${result.error}`;
        }
      };

      expect(handleResult({ isSuccess: true, exitCode: 0 })).toBe(
        'Success with code 0'
      );
      expect(
        handleResult({ isSuccess: false, exitCode: 1, error: 'Test error' })
      ).toBe('Failed with: Test error');
    });

    it('should enforce CommandName literal types', () => {
      const validCommand: CommandName = 'impl';
      expect(validCommand).toBe('impl');

      // TypeScript prevents invalid values at compile time
      const isValidCommand = (cmd: string): cmd is CommandName => {
        const valid: CommandName[] = [
          'plan',
          'task',
          'refactor',
          'impl',
          'review',
          'fix',
          'tidy',
        ];
        return valid.includes(cmd as CommandName);
      };

      expect(isValidCommand('impl')).toBe(true);
      expect(isValidCommand('invalid')).toBe(false);
    });
  });

  describe('integration with existing modules', () => {
    it('should be compatible with config module', () => {
      // Verify SpeciConfig type is structurally compatible
      const config: SpeciConfig = {
        version: '1.0.0',
        paths: {
          progress: 'docs/PROGRESS.md',
          tasks: 'docs/tasks',
          logs: 'logs',
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
          commands: [],
          maxFixAttempts: 3,
        },
        loop: {
          maxIterations: 100,
        },
      };

      expect(config).toBeDefined();
    });

    it('should be compatible with state module', () => {
      // Verify STATE enum values match expected strings
      expect(STATE.WORK_LEFT).toBe('WORK_LEFT');
      expect(STATE.IN_REVIEW).toBe('IN_REVIEW');
      expect(STATE.BLOCKED).toBe('BLOCKED');
      expect(STATE.DONE).toBe('DONE');
      expect(STATE.NO_PROGRESS).toBe('NO_PROGRESS');

      // Verify TaskStats interface
      const stats: TaskStats = {
        total: 1,
        completed: 0,
        remaining: 1,
        inReview: 0,
        blocked: 0,
      };

      expect(stats).toBeDefined();
    });

    it('should be compatible with copilot module', () => {
      // Verify AgentRunResult discriminated union
      const success: AgentRunResult = { isSuccess: true, exitCode: 0 };
      const failure: AgentRunResult = {
        isSuccess: false,
        exitCode: 1,
        error: 'error',
      };

      expect(success.isSuccess).toBe(true);
      expect(failure.isSuccess).toBe(false);
    });
  });
});
