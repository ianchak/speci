/**
 * Tests for copilot-helper module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCopilotCommand } from '../lib/utils/copilot-helper.js';
import { createMockContext } from '../lib/adapters/test-context.js';

describe('copilot-helper', () => {
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('executeCopilotCommand', () => {
    it('should log debug message, spawn copilot, and return success result', async () => {
      const args = [
        '-p',
        'Test prompt',
        '--agent=speci-plan',
        '--allow-all',
        '--no-ask-user',
      ];

      // Mock spawn to return success
      vi.spyOn(context.copilotRunner, 'spawn').mockResolvedValue(0);

      const result = await executeCopilotCommand(context, args);

      // Verify debug log was called with correct message
      expect(context.logger.debug).toHaveBeenCalledWith(
        'Spawning: copilot -p Test prompt --agent=speci-plan --allow-all --no-ask-user'
      );

      // Verify spawn was called with correct arguments
      expect(context.copilotRunner.spawn).toHaveBeenCalledWith(args, {
        inherit: true,
      });

      // Verify result
      expect(result).toEqual({ success: true, exitCode: 0 });
    });

    it('should return failure result when copilot exits with non-zero code', async () => {
      const args = [
        '-p',
        'Execute agent instructions',
        '--agent=speci-task',
        '--allow-all',
        '--no-ask-user',
      ];

      // Mock spawn to return failure
      vi.spyOn(context.copilotRunner, 'spawn').mockResolvedValue(1);

      const result = await executeCopilotCommand(context, args);

      expect(result).toEqual({ success: false, exitCode: 1 });
    });

    it('should handle exit code 2 (user interruption)', async () => {
      const args = [
        '-p',
        'Execute agent instructions',
        '--agent=speci-refactor',
        '--allow-all',
        '--no-ask-user',
      ];

      vi.spyOn(context.copilotRunner, 'spawn').mockResolvedValue(2);

      const result = await executeCopilotCommand(context, args);

      expect(result).toEqual({ success: false, exitCode: 2 });
    });

    it('should pass inherit: true to spawn options', async () => {
      const args = ['-p', '', '--agent=speci-plan'];

      vi.spyOn(context.copilotRunner, 'spawn').mockResolvedValue(0);

      await executeCopilotCommand(context, args);

      expect(context.copilotRunner.spawn).toHaveBeenCalledWith(args, {
        inherit: true,
      });
    });

    it('should handle empty args array', async () => {
      const args: string[] = [];

      vi.spyOn(context.copilotRunner, 'spawn').mockResolvedValue(0);

      const result = await executeCopilotCommand(context, args);

      expect(result.success).toBe(true);
      expect(context.logger.debug).toHaveBeenCalledWith('Spawning: copilot ');
    });

    it('should preserve exit code in failure result', async () => {
      const args = ['-p', '', '--agent=speci-plan'];

      vi.spyOn(context.copilotRunner, 'spawn').mockResolvedValue(127);

      const result = await executeCopilotCommand(context, args);

      expect(result).toEqual({ success: false, exitCode: 127 });
    });
  });
});
