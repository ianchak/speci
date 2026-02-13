import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatCopilotCommand,
  renderCopilotCommandBox,
} from '../lib/utils/copilot-command-display.js';

describe('copilot-command-display', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should format command from args', () => {
    const command = formatCopilotCommand(['-p', 'hello', '--agent=speci-impl']);

    expect(command).toBe('copilot -p hello --agent=speci-impl');
  });

  it('should prepend a blank line before box', () => {
    const rendered = renderCopilotCommandBox(['-p', 'hello']);

    expect(rendered.startsWith('\n')).toBe(true);
  });

  it('should wrap long command lines and keep box alignment', () => {
    const rendered = renderCopilotCommandBox([
      '-p',
      'Execute',
      'agent',
      'instructions',
      '--agent=speci-impl',
      '--allow-all',
      '--model',
      'gpt-5.3-codex',
      '--no-ask-user',
      '--extra-flag-with-a-very-long-value-to-force-wrapping',
    ]);

    const lines = rendered.trimStart().split('\n');

    const contentLines = lines.filter(
      (line) =>
        (line.startsWith('║') && line.endsWith('║')) ||
        (line.startsWith('|') && line.endsWith('|'))
    );

    expect(contentLines.length).toBeGreaterThan(1);

    for (const line of lines) {
      if (line.length > 0) {
        expect(line.length).toBe(lines[0].length);
      }
    }
  });
});
