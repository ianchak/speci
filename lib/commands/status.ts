/**
 * Status Command Implementation
 *
 * Displays current loop state, task statistics, and execution information.
 * Fullscreen live dashboard that refreshes every second until user quits.
 */

import type { SpeciConfig, CurrentTask } from '@/types.js';
import { BANNER_ART, renderBanner } from '@/ui/banner.js';
import { colorize } from '@/ui/colors.js';
import { getGlyph } from '@/ui/glyphs.js';
import { terminalState } from '@/ui/terminal.js';
import type { CommandContext, CommandResult } from '@/interfaces/index.js';
import {
  failResult,
  toErrorMessage,
} from '@/utils/infrastructure/error-handler.js';

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
const STATS_BOX_INNER_WIDTH = 24;
const STATS_BOX_PADDING = 2;

/** Maximum content width derived from banner art, used to constrain task name display
 * @internal Exported for testing
 */
export const CONTENT_WIDTH = Math.max(...BANNER_ART.map((line) => line.length));

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
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult> {
  try {
    // JSON mode: single output and exit
    if (options.json) {
      const config = preloadedConfig ?? (await context.configLoader.load());
      const statusData = await gatherStatusData(config, context);
      context.logger.raw(JSON.stringify(statusData, null, 2));
      return { success: true, exitCode: 0 };
    }

    // Once mode or non-TTY: single render and exit
    if (options.once || !context.process.stdout.isTTY) {
      const config = preloadedConfig ?? (await context.configLoader.load());
      const statusData = await gatherStatusData(config, context);
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
function setupTerminal(
  context: CommandContext,
  useAltScreen: boolean
): () => void {
  if (useAltScreen) {
    terminalState.capture();
    terminalState.enterAltScreen();
  }
  terminalState.hideCursor();
  context.process.stdout.write('\x1b[2J');

  return () => {
    try {
      terminalState.showCursor();
      if (useAltScreen) {
        terminalState.exitAltScreen();
        terminalState.restore();
      } else {
        context.process.stdout.write('\x1b[2J\x1b[H');
      }
      context.process.stdout.write('\n');
    } catch {
      // Ignore cleanup errors to avoid crashing on exit
    }
  };
}

type ProcessWithRemoveListener = CommandContext['process'] & {
  removeListener: (
    event: string,
    listener: (...args: unknown[]) => void
  ) => void;
};

function hasProcessRemoveListener(
  processRef: CommandContext['process']
): processRef is ProcessWithRemoveListener {
  return (
    'removeListener' in processRef &&
    typeof (processRef as { removeListener?: unknown }).removeListener ===
      'function'
  );
}

function setupInputHandlers(
  context: CommandContext,
  onExit: () => void
): () => void {
  const handleKeypress = (key: Buffer) => {
    if (key.length === 0) {
      return;
    }
    const code = key[0];
    if (code === 0x71 || code === 0x51 || code === 0x1b) {
      onExit();
    }
  };

  context.process.on('SIGINT', onExit);
  context.process.on('SIGTERM', onExit);

  if (context.process.stdin.isTTY) {
    if (typeof context.process.stdin.setRawMode === 'function') {
      context.process.stdin.setRawMode(true);
    }
    if (typeof context.process.stdin.resume === 'function') {
      context.process.stdin.resume();
    }
    if (typeof context.process.stdin.on === 'function') {
      context.process.stdin.on('data', handleKeypress);
    }
  }

  return () => {
    if (hasProcessRemoveListener(context.process)) {
      context.process.removeListener('SIGINT', onExit);
      context.process.removeListener('SIGTERM', onExit);
    }
    if (context.process.stdin.isTTY) {
      if (typeof context.process.stdin.removeListener === 'function') {
        context.process.stdin.removeListener('data', handleKeypress);
      }
      if (typeof context.process.stdin.setRawMode === 'function') {
        context.process.stdin.setRawMode(false);
      }
      if (typeof context.process.stdin.pause === 'function') {
        context.process.stdin.pause();
      }
    }
  };
}

async function runRefreshLoop(
  config: SpeciConfig,
  context: CommandContext,
  verbose: boolean | undefined,
  teardownTerminal: () => void
): Promise<void> {
  let running = true;
  let refreshCount = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let resolveExit: (() => void) | null = null;
  let teardownInput: (() => void) | null = null;

  const handleExit = () => {
    if (!running) return;
    running = false;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (teardownInput) {
      teardownInput();
      teardownInput = null;
    }
    teardownTerminal();
    if (resolveExit) {
      setImmediate(() => resolveExit?.());
    }
  };

  teardownInput = setupInputHandlers(context, handleExit);

  try {
    const statusData = await gatherStatusData(config, context);
    renderFullscreen(statusData, refreshCount, verbose, context);
  } catch (error) {
    handleExit();
    throw error;
  }

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

async function runLiveDashboard(
  verbose: boolean | undefined,
  context: CommandContext
): Promise<void> {
  const config = await context.configLoader.load();
  const isVsCodeTerminal =
    context.process.env.TERM_PROGRAM === 'vscode' ||
    context.process.env.VSCODE_INJECTION === '1';
  const useAltScreen = !isVsCodeTerminal;
  const teardownTerminal = setupTerminal(context, useAltScreen);
  await runRefreshLoop(config, context, verbose, teardownTerminal);
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

  // Output all lines; \x1b[J clears any stale content below the footer
  // from previous renders where content occupied more rows
  context.process.stdout.write(lines.join('\n') + '\x1b[J');
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

  lines.push(...renderStatsBox(data.stats));

  // Progress bar
  const progressBarLines = renderProgressBarLines(
    data.stats.completed,
    data.stats.total
  );
  lines.push(...progressBarLines);
  lines.push('');

  // Lock status and current task
  if (data.lock.isLocked && data.lock.pid && data.lock.startTime) {
    lines.push(...renderLockSection(data));
  } else {
    lines.push(colorize(`${getGlyph('bullet')} No active run`, 'dim'));
  }

  return lines;
}

function renderStatsBox(stats: StatusData['stats']): string[] {
  const lines: string[] = [];
  const boxTitle = ' Task Progress ';
  const boxWidth = STATS_BOX_INNER_WIDTH + STATS_BOX_PADDING * 2 + 2;
  const titlePadLeft = Math.floor((boxWidth - 2 - boxTitle.length) / 2);
  const titlePadRight = boxWidth - 2 - boxTitle.length - titlePadLeft;
  const topBorder =
    '┌' + '─'.repeat(titlePadLeft) + boxTitle + '─'.repeat(titlePadRight) + '┐';
  const bottomBorder = '└' + '─'.repeat(boxWidth - 2) + '┘';
  const emptyLine = '│' + ' '.repeat(boxWidth - 2) + '│';

  const maxValLen = Math.max(
    `${stats.completed}/${stats.total}`.length,
    stats.pending.toString().length,
    stats.inReview.toString().length,
    stats.blocked.toString().length
  );
  const statsRows = [
    {
      icon: getGlyph('success'),
      label: 'Completed',
      value: `${stats.completed}/${stats.total}`,
    },
    {
      icon: getGlyph('arrow'),
      label: 'Pending',
      value: stats.pending.toString(),
    },
    {
      icon: getGlyph('bullet'),
      label: 'In Review',
      value: stats.inReview.toString(),
    },
    {
      icon: getGlyph('error'),
      label: 'Blocked',
      value: stats.blocked.toString(),
    },
  ];

  lines.push(colorize(topBorder, 'dim'));
  lines.push(colorize(emptyLine, 'dim'));
  for (const row of statsRows) {
    const labelPart = `${row.icon} ${row.label}:`;
    const valuePart = row.value.padStart(maxValLen);
    const gap = STATS_BOX_INNER_WIDTH - labelPart.length - valuePart.length;
    const content =
      ' '.repeat(STATS_BOX_PADDING) +
      labelPart +
      ' '.repeat(Math.max(1, gap)) +
      valuePart +
      ' '.repeat(STATS_BOX_PADDING);
    lines.push(colorize('│', 'dim') + content + colorize('│', 'dim'));
  }
  lines.push(colorize(emptyLine, 'dim'));
  lines.push(colorize(bottomBorder, 'dim'));
  lines.push('');

  return lines;
}

/**
 * Render active lock section for status output.
 * @param data - Status data
 * @returns Lock section lines
 */
function renderLockSection(data: StatusData): string[] {
  if (!data.lock.isLocked || !data.lock.pid || !data.lock.startTime) {
    return [];
  }

  const lines: string[] = [];
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

  if (data.currentTask) {
    lines.push('');
    lines.push(colorize(`${getGlyph('arrow')} Working on:`, 'sky400'));
    const taskText = `  ${data.currentTask.id}: ${data.currentTask.title}`;
    const wrappedTaskLines = wrapText(taskText, CONTENT_WIDTH, '  ');
    for (const taskLine of wrappedTaskLines) {
      lines.push(colorize(taskLine, 'white'));
    }
    lines.push(colorize(`  Status: ${data.currentTask.status}`, 'dim'));
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
    for (const line of renderLockSection(data)) {
      output(line);
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
    DONE: getGlyph('success'),
    WORK_LEFT: getGlyph('arrow'),
    IN_REVIEW: getGlyph('bullet'),
    BLOCKED: getGlyph('error'),
    NO_PROGRESS: getGlyph('warning'),
  };
  return icons[state] || getGlyph('bullet');
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
 * Word-wrap text to fit within a maximum width
 * @param text - Plain text to wrap
 * @param maxWidth - Maximum characters per line
 * @param indent - Indentation prefix for continuation lines
 * @returns Array of wrapped lines, each fitting within maxWidth
 * @internal Exported for testing
 */
export function wrapText(
  text: string,
  maxWidth: number,
  indent: string = ''
): string[] {
  if (text.length <= maxWidth) return [text];

  // Extract leading whitespace to preserve on first line
  const leadingMatch = text.match(/^(\s*)/);
  const leadingSpace = leadingMatch ? leadingMatch[1] : '';
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = leadingSpace;

  for (const word of words) {
    const isLineStart = currentLine === leadingSpace || currentLine === indent;
    if (isLineStart) {
      currentLine += word;
    } else {
      const testLine = currentLine + ' ' + word;
      if (testLine.length > maxWidth) {
        lines.push(currentLine);
        currentLine = indent + word;
      } else {
        currentLine = testLine;
      }
    }
  }

  if (currentLine && currentLine !== indent) lines.push(currentLine);
  return lines;
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
