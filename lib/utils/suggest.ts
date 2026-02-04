/**
 * Command Suggestion Utility
 *
 * Provides Levenshtein distance calculation for suggesting similar commands
 * when users make typos.
 */

/**
 * Maximum edit distance for command suggestions
 */
const SUGGESTION_MAX_DISTANCE = 2;

/**
 * Calculate Levenshtein distance between two strings
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance (insertions, deletions, substitutions)
 */
export function levenshtein(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create distance matrix
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix using dynamic programming
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Find commands similar to user input using Levenshtein distance
 *
 * @param input - User's input command
 * @param commands - List of available commands
 * @returns Sorted array of similar commands (closest first)
 */
export function findSimilarCommands(
  input: string,
  commands: string[]
): string[] {
  return commands
    .map((cmd) => ({
      cmd,
      distance: levenshtein(input, cmd),
    }))
    .filter(({ distance }) => distance <= SUGGESTION_MAX_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .map(({ cmd }) => cmd);
}
