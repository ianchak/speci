/**
 * Tests for Exit Utility
 *
 * Verifies exit helper functions ensure cleanup runs before termination,
 * with timeout protection and double-cleanup guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Exit Utility', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Reset all modules to clear state
    vi.resetModules();

    // Mock process.exit to prevent test termination
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Mock console.error to suppress error output
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exitWithCleanup', () => {
    it('should call runCleanup before process.exit', async () => {
      // Mock runCleanup in signals module
      const signalsModule =
        await import('../../../lib/utils/infrastructure/signals.js');
      const mockRunCleanup = vi
        .spyOn(signalsModule, 'runCleanup')
        .mockResolvedValue(undefined);

      // Import exit module after mocking signals
      const { exitWithCleanup } =
        await import('../../../lib/utils/infrastructure/exit.js');

      await expect(exitWithCleanup(0)).rejects.toThrow('process.exit called');

      expect(mockRunCleanup).toHaveBeenCalledOnce();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should pass correct exit code to process.exit', async () => {
      const signalsModule =
        await import('../../../lib/utils/infrastructure/signals.js');
      vi.spyOn(signalsModule, 'runCleanup').mockResolvedValue(undefined);

      const { exitWithCleanup } =
        await import('../../../lib/utils/infrastructure/exit.js');

      await expect(exitWithCleanup(42)).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(42);
    });

    it('should handle cleanup errors gracefully', async () => {
      const cleanupError = new Error('Cleanup failed');
      const signalsModule =
        await import('../../../lib/utils/infrastructure/signals.js');
      vi.spyOn(signalsModule, 'runCleanup').mockRejectedValue(cleanupError);

      const { exitWithCleanup } =
        await import('../../../lib/utils/infrastructure/exit.js');

      await expect(exitWithCleanup(1)).rejects.toThrow('process.exit called');

      // log.error adds a glyph, so we just check that error was called
      expect(mockConsoleError).toHaveBeenCalled();
      const errorCall = mockConsoleError.mock.calls[0][0];
      expect(errorCall).toContain('Cleanup failed');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should force exit if cleanup is already in progress', async () => {
      const signalsModule =
        await import('../../../lib/utils/infrastructure/signals.js');
      const mockRunCleanup = vi
        .spyOn(signalsModule, 'runCleanup')
        .mockResolvedValue(undefined);
      vi.spyOn(signalsModule, 'isRunningCleanup').mockReturnValue(true);

      const { exitWithCleanup } =
        await import('../../../lib/utils/infrastructure/exit.js');

      // Second cleanup should force exit immediately
      await expect(exitWithCleanup(2)).rejects.toThrow('process.exit called');

      // log.error adds a glyph, so we just check that error was called
      expect(mockConsoleError).toHaveBeenCalled();
      const errorCall = mockConsoleError.mock.calls[0][0];
      expect(errorCall).toContain('Cleanup already in progress');
      expect(mockExit).toHaveBeenCalledWith(2);
      expect(mockRunCleanup).not.toHaveBeenCalled();
    });
  });

  describe('exitSync', () => {
    it('should call process.exit without cleanup', async () => {
      const signalsModule =
        await import('../../../lib/utils/infrastructure/signals.js');
      const mockRunCleanup = vi
        .spyOn(signalsModule, 'runCleanup')
        .mockResolvedValue(undefined);

      const { exitSync } =
        await import('../../../lib/utils/infrastructure/exit.js');

      expect(() => exitSync(0)).toThrow('process.exit called');

      expect(mockRunCleanup).not.toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should pass correct exit code to process.exit', async () => {
      const signalsModule =
        await import('../../../lib/utils/infrastructure/signals.js');
      vi.spyOn(signalsModule, 'runCleanup').mockResolvedValue(undefined);

      const { exitSync } =
        await import('../../../lib/utils/infrastructure/exit.js');

      expect(() => exitSync(127)).toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(127);
    });
  });
});
