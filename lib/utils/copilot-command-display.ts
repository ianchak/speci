import { drawBox } from '@/ui/box.js';

const COMMAND_BOX_WIDTH = 72;
const COMMAND_CONTENT_MAX_WIDTH = COMMAND_BOX_WIDTH - 4;

/**
 * Format full Copilot CLI command for display/logging.
 *
 * @param args - Copilot CLI arguments
 * @returns Full command string
 */
export function formatCopilotCommand(args: string[]): string {
  return `copilot ${args.join(' ')}`;
}

/**
 * Wrap a line to fixed width using whitespace boundaries.
 * Long tokens without whitespace are hard-wrapped.
 *
 * @param line - Input line
 * @param maxWidth - Maximum line width
 * @returns Wrapped lines
 */
function wrapLine(line: string, maxWidth: number): string[] {
  if (line.length <= maxWidth) {
    return [line];
  }

  const words = line.trim().split(/\s+/);
  const wrapped: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxWidth) {
      if (current.length > 0) {
        wrapped.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxWidth) {
        wrapped.push(word.slice(index, index + maxWidth));
      }
      continue;
    }

    const candidate = current.length > 0 ? `${current} ${word}` : word;
    if (candidate.length <= maxWidth) {
      current = candidate;
    } else {
      wrapped.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    wrapped.push(current);
  }

  return wrapped;
}

/**
 * Render a decorative command preview box.
 *
 * @param args - Copilot CLI arguments
 * @returns Styled multi-line string suitable for terminal output
 */
export function renderCopilotCommandBox(args: string[]): string {
  const wrappedCommandLines = wrapLine(
    formatCopilotCommand(args),
    COMMAND_CONTENT_MAX_WIDTH
  );

  return `\n${drawBox(wrappedCommandLines, {
    title: 'Copilot CLI',
    padding: 0,
    width: COMMAND_BOX_WIDTH,
    borderColor: 'sky400',
  })}\n`;
}
