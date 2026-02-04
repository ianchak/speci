/**
 * Internationalization utilities
 * Provides date formatting and UTF-8 encoding helpers
 */

export interface FormatDateOptions {
  /** Include time component (default: true) */
  includeTime?: boolean;
  /** Locale override (default: system locale) */
  locale?: string;
  /** Timezone override (default: local) */
  timeZone?: string;
}

/**
 * Format date in locale-aware manner
 * @param date - Date to format
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDate(
  date: Date,
  options: FormatDateOptions = {}
): string {
  const { includeTime = true, locale, timeZone } = options;

  // Handle invalid dates
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  try {
    const formatOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(includeTime && {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      ...(timeZone && { timeZone }),
    };

    return new Intl.DateTimeFormat(locale, formatOptions).format(date);
  } catch {
    // Fallback to ISO format if Intl fails
    return includeTime ? date.toISOString() : date.toISOString().split('T')[0];
  }
}

/**
 * Ensure input is valid UTF-8 string
 * @param input - String or Buffer to validate
 * @returns Valid UTF-8 string (invalid sequences replaced)
 */
export function ensureUtf8(input: string | Buffer): string {
  if (typeof input === 'string') {
    // For strings, replace invalid surrogate pairs
    return input.replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      '\uFFFD'
    );
  }

  if (Buffer.isBuffer(input)) {
    // Decode Buffer as UTF-8, replacing invalid sequences
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(input);
  }

  // Fallback for unexpected input types
  return String(input);
}

/**
 * Format elapsed time as HH:MM:SS
 * @param startTime - Start timestamp
 * @returns Formatted elapsed time string
 */
export function formatElapsed(startTime: Date): string {
  const elapsed = Date.now() - startTime.getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  return [
    hours.toString().padStart(2, '0'),
    (minutes % 60).toString().padStart(2, '0'),
    (seconds % 60).toString().padStart(2, '0'),
  ].join(':');
}
