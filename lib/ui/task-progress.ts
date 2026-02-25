/**
 * Task Progress Box Module
 *
 * Renders a bordered task progress summary box for terminal display.
 * Used by both the `run` and `status` commands.
 */

import type { TaskStats } from '@/types.js';
import { drawBox } from '@/ui/box.js';
import { getGlyph } from '@/ui/glyphs.js';

/**
 * Render a task progress box showing completion stats.
 *
 * @param stats - Task statistics from PROGRESS.md
 * @returns Formatted box string ready for terminal output
 *
 * @example
 * ```
 * ┌─ Task Progress ──────────┐
 * │                           │
 * │  ✓ Completed:       0/6   │
 * │  → Pending:           6   │
 * │  • In Review:         0   │
 * │  ✗ Blocked:           0   │
 * │                           │
 * └───────────────────────────┘
 * ```
 */
export function renderTaskProgressBox(stats: TaskStats): string {
  const maxValLen = Math.max(
    `${stats.completed}/${stats.total}`.length,
    stats.remaining.toString().length,
    stats.inReview.toString().length,
    stats.blocked.toString().length
  );

  const labelWidth = 'Completed:'.length; // longest label

  const rows = [
    {
      icon: getGlyph('success'),
      label: 'Completed:',
      value: `${stats.completed}/${stats.total}`,
    },
    {
      icon: getGlyph('arrow'),
      label: 'Pending:',
      value: stats.remaining.toString(),
    },
    {
      icon: getGlyph('bullet'),
      label: 'In Review:',
      value: stats.inReview.toString(),
    },
    {
      icon: getGlyph('error'),
      label: 'Blocked:',
      value: stats.blocked.toString(),
    },
  ];

  const lines = rows.map((row) => {
    const gap = labelWidth - row.label.length;
    return `${row.icon} ${row.label}${' '.repeat(gap)}  ${row.value.padStart(maxValLen)}`;
  });

  return drawBox(lines, {
    title: 'Task Progress',
    style: 'single',
    borderColor: 'dim',
  });
}
