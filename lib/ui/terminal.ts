/**
 * Terminal State Management Module
 *
 * Provides utilities for capturing and restoring terminal state,
 * particularly for TUI applications that enter raw mode and alternate
 * screen buffer.
 */

/**
 * Terminal state snapshot
 */
export interface TerminalSnapshot {
  isRaw: boolean;
  isTTY: boolean;
}

/**
 * Terminal state manager
 *
 * Provides methods to capture, restore, and manage terminal state
 * for clean entry/exit from TUI mode.
 */
class TerminalState {
  private savedState: TerminalSnapshot | null = null;

  /**
   * Capture current terminal state
   *
   * @returns Snapshot of current terminal state
   */
  capture(): TerminalSnapshot {
    this.savedState = {
      isRaw: process.stdin.isRaw ?? false,
      isTTY: process.stdout.isTTY ?? false,
    };
    return this.savedState;
  }

  /**
   * Restore terminal state
   *
   * Restores terminal to previous state, exiting alternate screen,
   * showing cursor, and re-enabling line wrapping.
   *
   * @param state - State to restore (uses last captured if not provided)
   */
  restore(state?: TerminalSnapshot): void {
    const toRestore = state ?? this.savedState;
    if (!toRestore) return;

    try {
      // Exit alternate screen
      process.stdout.write('\x1b[?1049l');
      // Show cursor
      process.stdout.write('\x1b[?25h');
      // Enable line wrap
      process.stdout.write('\x1b[?7h');

      // Restore raw mode
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(toRestore.isRaw);
      }
    } catch {
      // Ignore errors during restoration - terminal may already be in correct state
    }
  }

  /**
   * Enter alternate screen buffer
   *
   * Saves current screen content and provides a clean buffer for TUI.
   */
  enterAltScreen(): void {
    process.stdout.write('\x1b[?1049h');
  }

  /**
   * Exit alternate screen buffer
   *
   * Restores previous screen content.
   */
  exitAltScreen(): void {
    process.stdout.write('\x1b[?1049l');
  }

  /**
   * Hide cursor
   */
  hideCursor(): void {
    process.stdout.write('\x1b[?25l');
  }

  /**
   * Show cursor
   */
  showCursor(): void {
    process.stdout.write('\x1b[?25h');
  }

  /**
   * Disable line wrapping
   */
  disableLineWrap(): void {
    process.stdout.write('\x1b[?7l');
  }

  /**
   * Enable line wrapping
   */
  enableLineWrap(): void {
    process.stdout.write('\x1b[?7h');
  }
}

/**
 * Singleton terminal state manager
 */
export const terminalState = new TerminalState();
