/**
 * Status Command Implementation
 *
 * Displays current loop state, task statistics, and execution information.
 * Read-only command for quick project progress snapshots.
 */

import { loadConfig } from '../config.js';
import { getState, getTaskStats } from '../state.js';
import { getLockInfo } from '../utils/lock.js';
import { renderBanner } from '../ui/banner.js';
import { colorize } from '../ui/colors.js';
import { getGlyph } from '../ui/glyphs.js';
import { drawBox } from '../ui/box.js';

/**
 * Status command options
 */
export interface StatusOptions {
  json?: boolean;
  verbose?: boolean;
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
  };
  lastActivity?: string;
  error?: string;
}

/**
 * Status command handler
 * @param options - Command options
 */
export async function status(options: StatusOptions = {}): Promise<void> {
  const startTime = Date.now();

  // 1. Load configuration
  const config = await loadConfig();

  // 2. Gather data concurrently
  const [state, rawStats, lockInfo] = await Promise.all([
    getState(config),
    getTaskStats(config),
    getLockInfo(config),
  ]);

  // 3. Build status data
  const statusData: StatusData = {
    state: state,
    stats: {
      total: rawStats.total,
      completed: rawStats.completed,
      pending: rawStats.remaining,
      inReview: rawStats.inReview,
      blocked: rawStats.blocked,
    },
    lock: {
      isLocked: lockInfo.locked,
      pid: lockInfo.pid,
      startTime: lockInfo.started ? formatTimestamp(lockInfo.started) : null,
      elapsed: lockInfo.elapsed,
    },
  };

  // 4. Output based on format
  if (options.json) {
    console.log(JSON.stringify(statusData, null, 2));
  } else {
    renderBanner({ showVersion: false });
    renderStatusDisplay(statusData);
  }

  // 5. Performance check
  const elapsed = Date.now() - startTime;
  if (options.verbose) {
    console.log(colorize(`Status command completed in ${elapsed}ms`, 'dim'));
  }
}

/**
 * Render styled status display
 * @param data - Status data to display
 */
function renderStatusDisplay(data: StatusData): void {
  // State header with semantic color
  const stateColor = getStateColor(data.state);
  const stateIcon = getStateIcon(data.state);

  console.log();
  console.log(
    colorize(`${stateIcon} Current State: ${data.state}`, stateColor)
  );
  console.log();

  // Task statistics box
  const statsContent = [
    `${getGlyph('success')} Completed:   ${data.stats.completed}/${data.stats.total}`,
    `${getGlyph('arrow')} Pending:     ${data.stats.pending}`,
    `${getGlyph('bullet')} In Review:   ${data.stats.inReview}`,
    `${getGlyph('error')} Blocked:     ${data.stats.blocked}`,
  ];

  console.log(drawBox(statsContent, { title: 'Task Progress' }));

  // Progress bar
  renderProgressBar(data.stats.completed, data.stats.total);

  // Lock status
  if (data.lock.isLocked && data.lock.pid && data.lock.startTime) {
    console.log();
    console.log(
      colorize(
        `${getGlyph('bullet')} Speci run is active (PID: ${data.lock.pid})`,
        'sky400'
      )
    );
    console.log(colorize(`  Started: ${data.lock.startTime}`, 'dim'));
    if (data.lock.elapsed) {
      console.log(colorize(`  Elapsed: ${data.lock.elapsed}`, 'dim'));
    }
  }

  console.log();
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
 * Render progress bar
 * @param completed - Number of completed tasks
 * @param total - Total number of tasks
 */
function renderProgressBar(completed: number, total: number): void {
  const width = 40;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filled = total > 0 ? Math.round((completed / total) * width) : 0;
  const empty = width - filled;

  const bar =
    colorize('█'.repeat(filled), 'success') +
    colorize('░'.repeat(empty), 'dim');

  console.log();
  console.log(`  [${bar}] ${percentage}%`);
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
