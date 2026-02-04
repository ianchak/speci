/**
 * Monitor Command (TUI) Implementation
 *
 * Provides a real-time Terminal User Interface for viewing Speci log output.
 * Runs in alternate screen buffer with keyboard navigation and auto-scrolling.
 */

import { createReadStream, statSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { loadConfig } from '../config.js';
import { getLockInfo } from '../utils/lock.js';
import { colorize, visibleLength } from '../ui/colors.js';
import { terminalState } from '../ui/terminal.js';
import {
  installSignalHandlers,
  registerCleanup,
  removeSignalHandlers,
} from '../utils/signals.js';

/**
 * Monitor command options
 */
export interface MonitorOptions {
  logFile?: string;
  pollInterval?: number;
  maxLines?: number;
  verbose?: boolean;
}

/**
 * MonitorUI class - handles TUI rendering and interaction
 */
class MonitorUI {
  private lines: string[] = [];
  private scrollOffset = 0;
  private autoScroll = true;
  private lastSize = 0;
  private lastMtime = 0;
  private logPath: string;
  private maxLines: number;
  private pollInterval: number;
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private partialLine = '';
  private verbose: boolean;

  constructor(
    logPath: string,
    maxLines: number,
    pollInterval: number,
    verbose: boolean
  ) {
    this.logPath = logPath;
    this.maxLines = maxLines;
    this.pollInterval = pollInterval;
    this.verbose = verbose;
  }

  /**
   * Start the monitor UI
   */
  async start(): Promise<void> {
    this.running = true;

    // Enter TUI mode
    this.enterTUIMode();

    // Setup keyboard handler
    this.setupKeyboardHandler();

    // Initial file load
    await this.loadInitialContent();

    // Start polling loop
    this.startPolling();

    // Initial render
    this.render();
  }

  /**
   * Enter TUI mode - alternate screen, hidden cursor, raw input
   */
  private enterTUIMode(): void {
    // Enter alternate screen buffer
    terminalState.enterAltScreen();
    // Hide cursor
    terminalState.hideCursor();
    // Disable line wrap
    terminalState.disableLineWrap();
    // Enable raw mode
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
  }

  /**
   * Exit TUI mode - restore terminal state
   */
  private exitTUIMode(): void {
    // Terminal state restoration is handled by signal cleanup
    // Just restore the captured state
    terminalState.restore();
  }

  /**
   * Setup keyboard event handler
   */
  private setupKeyboardHandler(): void {
    process.stdin.on('data', (data) => {
      const key = data.toString();

      switch (key) {
        case 'q':
        case '\x03': // Ctrl+C
          this.exit();
          break;
        case 'k':
        case '\x1b[A': // Up arrow
          this.scrollUp(1);
          break;
        case 'j':
        case '\x1b[B': // Down arrow
          this.scrollDown(1);
          break;
        case 'u':
        case '\x1b[5~': // Page Up
          this.scrollUp(this.getPageSize());
          break;
        case 'd':
        case '\x1b[6~': // Page Down
          this.scrollDown(this.getPageSize());
          break;
        case 'g':
          this.scrollToTop();
          break;
        case 'G':
          this.scrollToBottom();
          break;
      }
    });
  }

  /**
   * Load initial log file content
   */
  private async loadInitialContent(): Promise<void> {
    if (!existsSync(this.logPath)) {
      this.lines.push('Waiting for log file...');
      return;
    }

    try {
      const stats = statSync(this.logPath);
      this.lastSize = stats.size;
      this.lastMtime = stats.mtimeMs;

      // Read entire file initially
      const content = await this.readFile(0, stats.size);
      const lines = content.split('\n');

      // Add all complete lines
      for (const line of lines) {
        if (line.length > 0) {
          this.lines.push(line);
        }
      }

      // Trim to max lines
      this.trimToMaxLines();

      // Start at bottom
      this.scrollToBottom();
    } catch (err) {
      this.lines.push(`Error loading log file: ${(err as Error).message}`);
    }
  }

  /**
   * Read file content from start to end position
   */
  private async readFile(start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(this.logPath, {
        start,
        end: end - 1,
        encoding: 'utf8',
      });

      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk;
      });
      stream.on('end', () => resolve(buffer));
      stream.on('error', reject);
    });
  }

  /**
   * Start polling for file changes
   */
  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      if (!this.running) return;

      try {
        const stats = statSync(this.logPath);
        const currentSize = stats.size;
        const currentMtime = stats.mtimeMs;

        if (currentSize !== this.lastSize || currentMtime !== this.lastMtime) {
          await this.readNewContent(currentSize);
          this.lastSize = currentSize;
          this.lastMtime = currentMtime;
          this.render();
        }
      } catch (err) {
        // File might not exist yet or be temporarily unavailable
        if (this.verbose) {
          this.logDebug(`Poll error: ${(err as Error).message}`);
        }
      }
    }, this.pollInterval);
  }

  /**
   * Read new content from log file
   */
  private async readNewContent(currentSize: number): Promise<void> {
    if (currentSize < this.lastSize) {
      // File was truncated/rotated - read from beginning
      this.lines = [];
      this.lastSize = 0;
      this.partialLine = '';
    }

    if (currentSize === this.lastSize) {
      return;
    }

    try {
      // Read new bytes
      const newContent = await this.readFile(this.lastSize, currentSize);

      // Prepend any partial line from last read
      const fullContent = this.partialLine + newContent;

      // Split into lines
      const lines = fullContent.split('\n');

      // Handle last line (might be partial)
      if (!fullContent.endsWith('\n') && lines.length > 0) {
        // Last line is partial, keep it for next read
        this.partialLine = lines.pop() || '';
      } else {
        this.partialLine = '';
      }

      // Add complete lines to buffer
      for (const line of lines) {
        if (line.length > 0) {
          this.lines.push(line);
        }
      }

      // Trim to max lines
      this.trimToMaxLines();

      // Auto-scroll if at bottom
      if (this.autoScroll) {
        this.scrollToBottom();
      }
    } catch (err) {
      if (this.verbose) {
        this.logDebug(`Read error: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Trim line buffer to max lines
   */
  private trimToMaxLines(): void {
    while (this.lines.length > this.maxLines) {
      this.lines.shift();
      // Adjust scroll offset
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
      }
    }
  }

  /**
   * Get page size (terminal height - status bar)
   */
  private getPageSize(): number {
    return Math.max(1, (process.stdout.rows || 24) - 2);
  }

  /**
   * Scroll up by N lines
   */
  private scrollUp(count: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - count);
    this.autoScroll = false;
    this.render();
  }

  /**
   * Scroll down by N lines
   */
  private scrollDown(count: number): void {
    const maxOffset = Math.max(0, this.lines.length - this.getPageSize());
    this.scrollOffset = Math.min(maxOffset, this.scrollOffset + count);

    // Re-enable auto-scroll if at bottom
    if (this.scrollOffset >= maxOffset) {
      this.autoScroll = true;
    }

    this.render();
  }

  /**
   * Scroll to top
   */
  private scrollToTop(): void {
    this.scrollOffset = 0;
    this.autoScroll = false;
    this.render();
  }

  /**
   * Scroll to bottom
   */
  private scrollToBottom(): void {
    const maxOffset = Math.max(0, this.lines.length - this.getPageSize());
    this.scrollOffset = maxOffset;
    this.autoScroll = true;
    this.render();
  }

  /**
   * Render the TUI
   */
  private render(): void {
    const rows = process.stdout.rows || 24;
    const columns = process.stdout.columns || 80;
    const contentRows = rows - 2; // Reserve 2 lines for status bar

    // Clear screen and move cursor home
    process.stdout.write('\x1b[2J\x1b[H');

    // Render visible lines
    const startLine = this.scrollOffset;
    const endLine = Math.min(startLine + contentRows, this.lines.length);

    for (let i = startLine; i < endLine; i++) {
      const line = this.lines[i];
      // Truncate to terminal width
      const truncated = this.truncateToWidth(line, columns);
      process.stdout.write(truncated + '\n');
    }

    // Pad remaining lines
    for (let i = endLine - startLine; i < contentRows; i++) {
      process.stdout.write('\n');
    }

    // Render status bar
    this.renderStatusBar(rows, columns);
  }

  /**
   * Truncate line to visible width (respecting ANSI codes)
   */
  private truncateToWidth(line: string, width: number): string {
    if (visibleLength(line) <= width) {
      return line;
    }

    // Need to truncate while preserving ANSI codes
    let result = '';
    let visibleCount = 0;
    let inEscape = false;
    let escapeBuffer = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '\x1b') {
        inEscape = true;
        escapeBuffer = char;
        continue;
      }

      if (inEscape) {
        escapeBuffer += char;
        if (char === 'm') {
          // End of escape sequence
          result += escapeBuffer;
          inEscape = false;
          escapeBuffer = '';
        }
        continue;
      }

      // Regular character
      if (visibleCount < width) {
        result += char;
        visibleCount++;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Render status bar at bottom
   */
  private async renderStatusBar(rows: number, columns: number): Promise<void> {
    try {
      const config = await loadConfig();
      const lockInfo = await getLockInfo(config);

      const fileName = basename(this.logPath);
      const updateTime = new Date().toLocaleTimeString();
      const status = lockInfo.locked
        ? `Running (${lockInfo.elapsed || '00:00:00'})`
        : 'Stopped';
      const scrollPos = `${this.scrollOffset + 1}/${this.lines.length}`;

      // Build status line parts
      const leftPart = ` ${fileName} `;
      const middlePart = ` ${status} `;
      const rightPart = ` ${scrollPos} | ${updateTime} `;

      // Position cursor at bottom (last row)
      process.stdout.write(`\x1b[${rows};1H`);

      // Build and render status line
      const statusLine = this.buildStatusLine(
        leftPart,
        middlePart,
        rightPart,
        columns
      );
      process.stdout.write(colorize(statusLine, 'white'));

      // Second status line (help text)
      const helpText = ' q:quit  ↑↓/jk:scroll  g/G:top/bottom  u/d:page ';
      process.stdout.write(`\x1b[${rows - 1};1H`);
      const paddedHelp = helpText.padEnd(columns, ' ');
      process.stdout.write(colorize(paddedHelp, 'sky200'));
    } catch {
      // Fallback if config/lock fails
      const helpText = ' q:quit  ↑↓/jk:scroll  g/G:top/bottom  u/d:page ';
      process.stdout.write(`\x1b[${rows};1H`);
      const paddedHelp = helpText.padEnd(columns, ' ');
      process.stdout.write(colorize(paddedHelp, 'white'));
    }
  }

  /**
   * Build status line with proper spacing
   */
  private buildStatusLine(
    left: string,
    middle: string,
    right: string,
    width: number
  ): string {
    const leftLen = left.length;
    const middleLen = middle.length;
    const rightLen = right.length;

    // Calculate spacing
    const totalContent = leftLen + middleLen + rightLen;
    const totalPadding = width - totalContent;

    if (totalPadding < 0) {
      // Not enough space, truncate
      return (left + middle + right).substring(0, width);
    }

    // Distribute padding
    const leftPad = Math.floor(totalPadding / 2);
    const rightPad = totalPadding - leftPad;

    return left + ' '.repeat(leftPad) + middle + ' '.repeat(rightPad) + right;
  }

  /**
   * Log debug message (when verbose)
   */
  private logDebug(message: string): void {
    if (this.verbose) {
      this.lines.push(`[DEBUG] ${message}`);
      this.trimToMaxLines();
    }
  }

  /**
   * Exit the monitor
   */
  private exit(): void {
    this.running = false;

    // Stop polling
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Exit TUI mode
    this.exitTUIMode();

    // Exit process
    process.exit(0);
  }
}

/**
 * Monitor command handler
 *
 * @param options - Command options
 */
export default async function monitor(
  options: MonitorOptions = {}
): Promise<void> {
  try {
    const config = await loadConfig();

    // Determine log file path
    const logPath = options.logFile || config.paths.logs;

    // Validate log file exists
    if (!existsSync(logPath)) {
      console.error(colorize(`✗ Log file not found: ${logPath}`, 'error'));
      console.error('  Start a speci run first with: speci run');
      process.exit(1);
    }

    // Install signal handlers
    installSignalHandlers();

    // Capture and register terminal restore
    const savedState = terminalState.capture();
    registerCleanup(() => {
      terminalState.restore(savedState);
    });

    // Create and start monitor UI
    const ui = new MonitorUI(
      logPath,
      options.maxLines ?? 10000,
      options.pollInterval ?? 500,
      options.verbose ?? false
    );

    await ui.start();

    // Keep process alive
    await new Promise(() => {
      /* never resolves */
    });
  } catch (err) {
    console.error(
      colorize(`✗ Monitor error: ${(err as Error).message}`, 'error')
    );
    process.exit(1);
  } finally {
    // Cleanup handlers on exit
    removeSignalHandlers();
  }
}
