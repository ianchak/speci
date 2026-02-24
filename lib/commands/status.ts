/**
 * Status Command Implementation
 *
 * Displays current loop state, task statistics, and execution information.
 * Fullscreen live dashboard that refreshes every second until user quits.
 */

import type { SpeciConfig, CurrentTask } from '@/types.js';
import { renderBanner } from '@/ui/banner.js';
import { colorize } from '@/ui/colors.js';
import { getGlyph } from '@/ui/glyphs.js';
import { terminalState } from '@/ui/terminal.js';
import { createProductionContext } from '@/adapters/context-factory.js';
import type { CommandContext, CommandResult } from '@/interfaces.js';
import { failResult, toErrorMessage } from '@/utils/error-handler.js';

/**
 * Status command options
 */
export interface StatusOptions {
  json?: boolean;
  verbose?: boolean;
  /** Run once and exit (non-interactive mode) */
  once?: boolean;
}

/**
 * Status data structure
 */
interface StatusData {
  state: string;
  stats: {
    total: number;
    completed: number;
    pending: number;
    inReview: number;
    blocked: number;
  };
  lock: {
    isLocked: boolean;
    pid: number | null;
    startTime: string | null;
    elapsed: string | null;
    command?: string;
  };
  currentTask: CurrentTask | null;
  lastActivity?: string;
  error?: string;
}

/** Refresh interval in milliseconds */
const REFRESH_INTERVAL = 1000;

/**
 * Status command handler
 * @param options - Command options with defaults
 * @param context - Dependency injection context (defaults to production)
 * @param config - Pre-loaded configuration (optional, will load if not provided)
 * @returns Promise resolving to command result
 * @sideEffects Reads PROGRESS.md, lock file; may enter fullscreen terminal mode; may spawn interactive dashboard
 */
export async function status(
  options: StatusOptions = {},
  context: CommandContext = createProductionContext(),
  config?: SpeciConfig
): Promise<CommandResult> {
  try {
    // JSON mode: single output and exit
    if (options.json) {
      const loadedConfig = config ?? (await context.configLoader.load());
      const statusData = await gatherStatusData(loadedConfig, context);
      context.logger.raw(JSON.stringify(statusData, null, 2));
      return { success: true, exitCode: 0 };
    }

    // Once mode or non-TTY: single render and exit
    if (options.once || !context.process.stdout.isTTY) {
      const loadedConfig = config ?? (await context.configLoader.load());
      const statusData = await gatherStatusData(loadedConfig, context);
      const output: OutputFn = (msg?: string) => context.logger.raw(msg ?? '');
      renderStaticStatus(statusData, options.verbose, output);
      return { success: true, exitCode: 0 };
    }

    // Live fullscreen mode
    await runLiveDashboard(options.verbose, context);
    return { success: true, exitCode: 0 };
  } catch (error) {
    const errorMsg = toErrorMessage(error);
    context.logger.error(`Status command failed: ${errorMsg}`);
    return failResult(errorMsg);
  }
}

/**
 * Gather status data from all sources
 * @param config - Loaded configuration
 * @param context - Command context for DI access
 * @returns Status data object
 */
async function gatherStatusData(
  config: SpeciConfig,
  context: CommandContext
): Promise<StatusData> {
  const [state, rawStats, lockInfo, currentTask] = await Promise.all([
    context.stateReader.getState(config),
    context.stateReader.getTaskStats(config),
    context.lockManager.getInfo(config),
    context.stateReader.getCurrentTask(config),
  ]);

  return {
    state: state,
    stats: {
      total: rawStats.total,
      completed: rawStats.completed,
      pending: rawStats.remaining,
      inReview: rawStats.inReview,
      blocked: rawStats.blocked,
    },
    lock: {
      isLocked: lockInfo.isLocked,
      pid: lockInfo.pid,
      startTime: lockInfo.started ? formatTimestamp(lockInfo.started) : null,
      elapsed: lockInfo.elapsed,
      command: lockInfo.command,
    },
    currentTask: currentTask ?? null,
  };
}

/**
 * Output function type for rendering
 */
type OutputFn = (message?: string) => void;

/**
 * Render static status display (for once mode)
 * @param data - Status data to display
 * @param verbose - Show timing info
 * @param output - Output function (defaults to console.log)
 */
function renderStaticStatus(
  data: StatusData,
  verbose?: boolean,
  output: OutputFn = console.log
): void {
  const startTime = Date.now();

  // Banner with gradient effect
  output(renderBanner());
  output();

  renderStatusContent(data, output);

  if (verbose) {
    const elapsed = Date.now() - startTime;
    output(colorize(`Status command completed in ${elapsed}ms`, 'dim'));
  }
}

/**
 * Run the live fullscreen dashboard
 * @param verbose - Show timing info in footer
 * @param context - Dependency injection context
 */
async function runLiveDashboard(
  verbose: boolean | undefined,
  context: CommandContext
): Promise<void> {
  const config = await context.configLoader.load();
  let running = true;
  let refreshCount = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const isVsCodeTerminal =
    context.process.env.TERM_PROGRAM === 'vscode' ||
    context.process.env.VSCODE_INJECTION === '1';
  const useAltScreen = !isVsCodeTerminal;

  // Setup terminal for fullscreen
  if (useAltScreen) {
    terminalState.capture();
    terminalState.enterAltScreen();
  }
  terminalState.hideCursor();
  // Clear screen once at start (subsequent renders will overwrite in place)
  context.process.stdout.write('\x1b[2J');

  // Promise resolver for when exit is triggered
  let resolveExit: (() => void) | null = null;

  // Handle exit signals - cleanup and prevent default exit behavior
  const handleExit = () => {
    if (!running) return; // Prevent double cleanup
    running = false;
    try {
      // Clear the refresh interval
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }

      // Restore stdin state - must be done carefully
      if (context.process.stdin.isTTY) {
        const stdin = context.process.stdin;
        if (typeof stdin.removeListener === 'function') {
          stdin.removeListener('data', handleKeypress);
        }
        if (typeof stdin.setRawMode === 'function') {
          stdin.setRawMode(false);
        }
        if (typeof stdin.pause === 'function') {
          stdin.pause();
        }
      }

      terminalState.showCursor();
      if (useAltScreen) {
        // Restore terminal state (cursor, alt screen, etc.)
        terminalState.exitAltScreen();
        terminalState.restore();
      } else {
        // Clear the screen and return cursor to home in regular terminals
        context.process.stdout.write('\x1b[2J\x1b[H');
      }

      // Write a newline to ensure clean prompt
      context.process.stdout.write('\n');
    } catch {
      // Ignore cleanup errors to avoid crashing on exit
    } finally {
      // Signal completion on next tick to ensure all cleanup is processed
      if (resolveExit) {
        setImmediate(() => resolveExit!());
      }
    }
  };

  // Handle keypress for 'q' to quit
  // Note: Ctrl+C (0x03) is handled via SIGINT signal, not here
  const handleKeypress = (key: Buffer) => {
    if (key.length === 0) {
      return;
    }
    const code = key[0];
    // q, Q, or ESC to quit (Ctrl+C triggers SIGINT which calls handleExit)
    if (code === 0x71 || code === 0x51 || code === 0x1b) {
      handleExit();
    }
  };

  // Register signal handlers
  // These intercept signals and do cleanup instead of default termination
  context.process.on('SIGINT', handleExit);
  context.process.on('SIGTERM', handleExit);

  // Handle keypress for 'q' to quit
  if (context.process.stdin.isTTY) {
    context.process.stdin.setRawMode(true);
    context.process.stdin.resume();
    context.process.stdin.on('data', handleKeypress);
  }

  // Initial render
  try {
    const statusData = await gatherStatusData(config, context);
    renderFullscreen(statusData, refreshCount, verbose, context);
  } catch (error) {
    handleExit();
    throw error;
  }

  // Refresh loop - wrapped in a promise to wait for exit
  return new Promise<void>((resolve) => {
    resolveExit = resolve;

    if (!running) {
      resolve();
      return;
    }

    intervalId = setInterval(async () => {
      if (!running) {
        return;
      }

      try {
        refreshCount++;
        const statusData = await gatherStatusData(config, context);
        renderFullscreen(statusData, refreshCount, verbose, context);
      } catch {
        // Silently continue on errors during refresh
      }
    }, REFRESH_INTERVAL);
  });
}

/**
 * Render fullscreen status display
 * @param data - Status data
 * @param refreshCount - Number of refreshes
 * @param verbose - Show verbose info
 * @param context - Dependency injection context
 */
function renderFullscreen(
  data: StatusData,
  refreshCount: number,
  verbose: boolean | undefined,
  context: CommandContext
): void {
  const { rows, cols } = getTerminalSize(context);
  const lines: string[] = [];

  // Build content lines
  const contentLines = buildContentLines(data);

  // Calculate vertical centering
  const contentHeight = contentLines.length;
  const topPadding = Math.max(0, Math.floor((rows - contentHeight - 2) / 2));

  // Move cursor to top-left (don't clear screen to prevent flicker)
  context.process.stdout.write('\x1b[H');

  // Top padding
  for (let i = 0; i < topPadding; i++) {
    lines.push('\x1b[2K'); // Clear line and leave it empty
  }

  // Centered content
  for (const line of contentLines) {
    lines.push('\x1b[2K' + centerLine(stripAnsi(line), cols, line));
  }

  // Footer
  const footerPadding = Math.max(0, rows - topPadding - contentHeight - 3);
  for (let i = 0; i < footerPadding; i++) {
    lines.push('\x1b[2K'); // Clear line
  }

  // Footer line
  const timestamp = new Date().toLocaleTimeString();
  const footerLeft = colorize(` Press 'q' or ESC to quit`, 'dim');
  const footerRight = colorize(
    `Refreshed: ${timestamp}${verbose ? ` (#${refreshCount})` : ''} `,
    'dim'
  );
  const footerGap = Math.max(
    0,
    cols - stripAnsi(footerLeft).length - stripAnsi(footerRight).length
  );
  lines.push('\x1b[2K' + footerLeft + ' '.repeat(footerGap) + footerRight);

  // Output all lines
  context.process.stdout.write(lines.join('\n'));
}

/**
 * Build content lines for the dashboard
 * @param data - Status data
 * @returns Array of content lines
 */
function buildContentLines(data: StatusData): string[] {
  const lines: string[] = [];

  // Banner with gradient effect
  lines.push(...renderBanner().split('\n'));
  lines.push('');

  // State header
  const stateColor = getStateColor(data.state);
  const stateIcon = getStateIcon(data.state);
  lines.push(colorize(`${stateIcon} Current State: ${data.state}`, stateColor));
  lines.push('');

  // Stats box with padding
  const boxTitle = ' Task Progress ';
  const padding = 2; // Internal horizontal padding
  const innerWidth = 24; // Content area width
  const boxWidth = innerWidth + padding * 2 + 2; // +2 for left/right borders
  const titlePadLeft = Math.floor((boxWidth - 2 - boxTitle.length) / 2);
  const titlePadRight = boxWidth - 2 - boxTitle.length - titlePadLeft;
  const topBorder =
    '┌' + '─'.repeat(titlePadLeft) + boxTitle + '─'.repeat(titlePadRight) + '┐';
  const bottomBorder = '└' + '─'.repeat(boxWidth - 2) + '┘';
  const emptyLine = '│' + ' '.repeat(boxWidth - 2) + '│';

  // Format stats with compact alignment
  const maxValLen = Math.max(
    `${data.stats.completed}/${data.stats.total}`.length,
    data.stats.pending.toString().length,
    data.stats.inReview.toString().length,
    data.stats.blocked.toString().length
  );
  const statsRows = [
    {
      icon: getGlyph('success'),
      label: 'Completed',
      value: `${data.stats.completed}/${data.stats.total}`,
    },
    {
      icon: getGlyph('arrow'),
      label: 'Pending',
      value: data.stats.pending.toString(),
    },
    {
      icon: getGlyph('bullet'),
      label: 'In Review',
      value: data.stats.inReview.toString(),
    },
    {
      icon: getGlyph('error'),
      label: 'Blocked',
      value: data.stats.blocked.toString(),
    },
  ];

  lines.push(colorize(topBorder, 'dim'));
  lines.push(colorize(emptyLine, 'dim')); // Top padding
  for (const row of statsRows) {
    const labelPart = `${row.icon} ${row.label}:`;
    const valuePart = row.value.padStart(maxValLen);
    const gap = innerWidth - labelPart.length - valuePart.length;
    const content =
      ' '.repeat(padding) +
      labelPart +
      ' '.repeat(Math.max(1, gap)) +
      valuePart +
      ' '.repeat(padding);
    lines.push(colorize('│', 'dim') + content + colorize('│', 'dim'));
  }
  lines.push(colorize(emptyLine, 'dim')); // Bottom padding
  lines.push(colorize(bottomBorder, 'dim'));
  lines.push('');

  // Progress bar
  const progressBarLines = renderProgressBarLines(
    data.stats.completed,
    data.stats.total
  );
  lines.push(...progressBarLines);
  lines.push('');

  // Lock status and current task
  if (data.lock.isLocked && data.lock.pid && data.lock.startTime) {
    const commandLabel =
      data.lock.command === 'yolo' ? 'Yolo pipeline' : 'Speci run';
    lines.push(
      colorize(
        `${getGlyph('bullet')} ${commandLabel} is active (PID: ${data.lock.pid})`,
        'sky400'
      )
    );
    lines.push(colorize(`  Started: ${data.lock.startTime}`, 'dim'));
    if (data.lock.elapsed) {
      lines.push(colorize(`  Elapsed: ${data.lock.elapsed}`, 'dim'));
    }
    // Show current task if active run and task in progress/review
    if (data.currentTask) {
      lines.push('');
      lines.push(colorize(`${getGlyph('arrow')} Working on:`, 'sky400'));
      lines.push(
        colorize(`  ${data.currentTask.id}: ${data.currentTask.title}`, 'white')
      );
      lines.push(colorize(`  Status: ${data.currentTask.status}`, 'dim'));
    }
  } else {
    lines.push(colorize(`${getGlyph('bullet')} No active run`, 'dim'));
  }

  return lines;
}

/**
 * Render status content (shared between static and fullscreen)
 * @param data - Status data
 * @param output - Output function (defaults to console.log)
 */
function renderStatusContent(
  data: StatusData,
  output: OutputFn = console.log
): void {
  const stateColor = getStateColor(data.state);
  const stateIcon = getStateIcon(data.state);

  output(colorize(`${stateIcon} Current State: ${data.state}`, stateColor));
  output();

  // Stats
  output(
    `${getGlyph('success')} Completed:   ${data.stats.completed}/${data.stats.total}`
  );
  output(`${getGlyph('arrow')} Pending:     ${data.stats.pending}`);
  output(`${getGlyph('bullet')} In Review:   ${data.stats.inReview}`);
  output(`${getGlyph('error')} Blocked:     ${data.stats.blocked}`);
  output();

  // Progress bar
  const progressLines = renderProgressBarLines(
    data.stats.completed,
    data.stats.total
  );
  for (const line of progressLines) {
    output(line);
  }
  output();

  // Lock status and current task
  if (data.lock.isLocked && data.lock.pid && data.lock.startTime) {
    const commandLabel =
      data.lock.command === 'yolo' ? 'Yolo pipeline' : 'Speci run';
    output(
      colorize(
        `${getGlyph('bullet')} ${commandLabel} is active (PID: ${data.lock.pid})`,
        'sky400'
      )
    );
    output(colorize(`  Started: ${data.lock.startTime}`, 'dim'));
    if (data.lock.elapsed) {
      output(colorize(`  Elapsed: ${data.lock.elapsed}`, 'dim'));
    }
    // Show current task if active run and task in progress/review
    if (data.currentTask) {
      output();
      output(colorize(`${getGlyph('arrow')} Working on:`, 'sky400'));
      output(
        colorize(`  ${data.currentTask.id}: ${data.currentTask.title}`, 'white')
      );
      output(colorize(`  Status: ${data.currentTask.status}`, 'dim'));
    }
  }
  output();
}

/**
 * Get semantic color for state
 * @param state - State string
 * @returns Color name
 */
function getStateColor(
  state: string
): 'success' | 'sky400' | 'warning' | 'error' | 'dim' {
  const colors: Record<
    string,
    'success' | 'sky400' | 'warning' | 'error' | 'dim'
  > = {
    DONE: 'success',
    WORK_LEFT: 'sky400',
    IN_REVIEW: 'warning',
    BLOCKED: 'error',
    NO_PROGRESS: 'dim',
  };
  return colors[state] || 'sky400';
}

/**
 * Get icon for state
 * @param state - State string
 * @returns Glyph string
 */
function getStateIcon(state: string): string {
  const icons: Record<string, string> = {
    DONE: getGlyph('success') as string,
    WORK_LEFT: getGlyph('arrow') as string,
    IN_REVIEW: getGlyph('bullet') as string,
    BLOCKED: getGlyph('error') as string,
    NO_PROGRESS: getGlyph('warning') as string,
  };
  return icons[state] || (getGlyph('bullet') as string);
}

/**
 * Render progress bar as array of strings (bar on one line, percentage below)
 * @param completed - Number of completed tasks
 * @param total - Total number of tasks
 * @returns Array of progress bar lines
 */
function renderProgressBarLines(completed: number, total: number): string[] {
  const width = 30; // Bar width (32 total = [ + 30 + ])
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filled = total > 0 ? Math.round((completed / total) * width) : 0;
  const empty = width - filled;

  const bar =
    colorize('█'.repeat(filled), 'success') +
    colorize('░'.repeat(empty), 'dim');

  // Bar line: [ + 30 chars + ] = 32 chars total
  const barLine = `[${bar}]`;
  const barWidth = 32; // Plain text width of bar line

  // Center percentage text within same width as bar
  const percentText = `${percentage}%`;
  const leftPad = Math.floor((barWidth - percentText.length) / 2);
  const rightPad = barWidth - percentText.length - leftPad;
  const percentLine = ' '.repeat(leftPad) + percentText + ' '.repeat(rightPad);

  return [barLine, percentLine];
}

/**
 * Format timestamp for display
 * @param date - Date to format
 * @returns Formatted timestamp string
 */
function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Get terminal size
 * @param context - Dependency injection context
 * @returns Object with rows and cols
 */
function getTerminalSize(context: CommandContext): {
  rows: number;
  cols: number;
} {
  return {
    rows: context.process.stdout.rows || 24,
    cols: context.process.stdout.columns || 80,
  };
}

/**
 * Strip ANSI escape codes from string
 * @param str - String with ANSI codes
 * @returns Plain string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Center a line horizontally
 * @param plainText - Plain text (no ANSI) for width calculation
 * @param width - Terminal width
 * @param coloredText - Colored text to actually output
 * @returns Centered line
 */
function centerLine(
  plainText: string,
  width: number,
  coloredText: string
): string {
  const padding = Math.max(0, Math.floor((width - plainText.length) / 2));
  return ' '.repeat(padding) + coloredText;
}
