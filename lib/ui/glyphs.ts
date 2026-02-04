/**
 * Unicode glyphs for modern terminal display
 */
export const GLYPHS = {
  success: '✓',
  warning: '!',
  error: '✗',
  bullet: '•',
  nested: '↳',
  arrow: '→',
  pointer: '▸',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
} as const;

/**
 * ASCII fallback glyphs for legacy terminals
 */
export const ASCII_GLYPHS = {
  success: '[OK]',
  warning: '[!]',
  error: '[X]',
  bullet: '*',
  nested: '->',
  arrow: '>',
  pointer: '>',
  spinner: ['-', '\\', '|', '/'],
} as const;

export type GlyphName = keyof typeof GLYPHS;

/**
 * Check if terminal supports Unicode characters
 * Checks environment variables and terminal type
 */
export function supportsUnicode(): boolean {
  // Explicit ASCII mode override
  if (process.env.SPECI_ASCII !== undefined) {
    return false;
  }

  // Check LANG/LC_ALL for UTF-8 encoding
  const lang = process.env.LANG || process.env.LC_ALL || '';
  if (
    lang.toLowerCase().includes('utf-8') ||
    lang.toLowerCase().includes('utf8')
  ) {
    return true;
  }

  // Check TERM for known Unicode-capable terminals
  const term = process.env.TERM || '';
  const unicodeTerms = [
    'xterm-256color',
    'xterm-color',
    'screen-256color',
    'tmux-256color',
  ];
  if (unicodeTerms.some((t) => term.includes(t))) {
    return true;
  }

  // Windows Terminal and modern PowerShell support Unicode
  if (process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode') {
    return true;
  }

  // Default: assume no Unicode support for safety
  return false;
}

/**
 * Get glyph by name with automatic ASCII fallback
 * @param name - Glyph name (e.g., 'success', 'error')
 * @returns Unicode glyph or ASCII fallback
 */
export function getGlyph(name: GlyphName): string | readonly string[] {
  const glyphSet = supportsUnicode() ? GLYPHS : ASCII_GLYPHS;
  return glyphSet[name] ?? GLYPHS[name] ?? '?';
}

/**
 * Get a specific spinner frame by index
 * @param frameIndex - Index of the spinner frame
 * @returns Spinner character for current frame
 */
export function getSpinnerFrame(frameIndex: number): string {
  const frames = getGlyph('spinner') as readonly string[];
  const length = frames.length;
  const index = ((frameIndex % length) + length) % length;
  return frames[index];
}
