/**
 * Terminal State Tests
 *
 * Tests for lib/ui/terminal.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { terminalState } from '../lib/ui/terminal.js';

describe('Terminal State Management', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let setRawModeSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    // Spy on stdout.write to capture escape sequences
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    // Mock setRawMode if available
    if (typeof process.stdin.setRawMode === 'function') {
      setRawModeSpy = vi
        .spyOn(process.stdin, 'setRawMode')
        .mockImplementation(() => process.stdin);
    }
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    if (setRawModeSpy) {
      setRawModeSpy.mockRestore();
    }
  });

  describe('State Capture', () => {
    it('should capture current terminal state', () => {
      const state = terminalState.capture();

      expect(state).toBeDefined();
      expect(typeof state.isRaw).toBe('boolean');
      expect(typeof state.isTTY).toBe('boolean');
    });

    it('should store captured state internally', () => {
      const state1 = terminalState.capture();
      const state2 = terminalState.capture();

      // Should be able to capture multiple times
      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
    });
  });

  describe('State Restoration', () => {
    it('should restore terminal state with escape sequences', () => {
      const state = terminalState.capture();
      terminalState.restore(state);

      // Verify escape sequences were written
      expect(stdoutWriteSpy).toHaveBeenCalled();

      const calls = stdoutWriteSpy.mock.calls as unknown[][];
      const written = calls
        .map((call: unknown[]) => call[0] as string)
        .join('');

      // Should exit alternate screen
      expect(written).toContain('\x1b[?1049l');
      // Should show cursor
      expect(written).toContain('\x1b[?25h');
      // Should enable line wrap
      expect(written).toContain('\x1b[?7h');
    });

    it('should restore from captured state when no argument provided', () => {
      terminalState.capture();
      terminalState.restore();

      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('should handle missing saved state gracefully', () => {
      // Clear any saved state by creating new instance
      terminalState.restore();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should restore raw mode state if setRawMode available', () => {
      if (!process.stdin.setRawMode || !setRawModeSpy) {
        // Skip test if setRawMode not available
        return;
      }

      const state = { isRaw: false, isTTY: true };
      terminalState.restore(state);

      expect(setRawModeSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('Alternate Screen Management', () => {
    it('should enter alternate screen buffer', () => {
      terminalState.enterAltScreen();

      expect(stdoutWriteSpy).toHaveBeenCalledWith('\x1b[?1049h');
    });

    it('should exit alternate screen buffer', () => {
      terminalState.exitAltScreen();

      expect(stdoutWriteSpy).toHaveBeenCalledWith('\x1b[?1049l');
    });

    it('should allow multiple enter/exit cycles', () => {
      terminalState.enterAltScreen();
      terminalState.exitAltScreen();
      terminalState.enterAltScreen();
      terminalState.exitAltScreen();

      expect(stdoutWriteSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('Cursor Management', () => {
    it('should hide cursor on entering raw mode', () => {
      terminalState.hideCursor();

      expect(stdoutWriteSpy).toHaveBeenCalledWith('\x1b[?25l');
    });

    it('should show cursor on restore', () => {
      const state = terminalState.capture();
      terminalState.restore(state);

      const calls = stdoutWriteSpy.mock.calls as unknown[][];
      const written = calls
        .map((call: unknown[]) => call[0] as string)
        .join('');
      expect(written).toContain('\x1b[?25h');
    });
  });

  describe('Line Wrap Management', () => {
    it('should disable line wrap', () => {
      terminalState.disableLineWrap();

      expect(stdoutWriteSpy).toHaveBeenCalledWith('\x1b[?7l');
    });

    it('should enable line wrap on restore', () => {
      const state = terminalState.capture();
      terminalState.restore(state);

      const calls = stdoutWriteSpy.mock.calls as unknown[][];
      const written = calls
        .map((call: unknown[]) => call[0] as string)
        .join('');
      expect(written).toContain('\x1b[?7h');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null state argument', () => {
      expect(() => terminalState.restore(undefined)).not.toThrow();
    });

    it('should handle restoration without prior capture', () => {
      expect(() => terminalState.restore()).not.toThrow();
    });

    it('should handle write failures gracefully', () => {
      stdoutWriteSpy.mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Should not throw even if write fails
      expect(() =>
        terminalState.restore({ isRaw: false, isTTY: true })
      ).not.toThrow();
    });
  });
});
