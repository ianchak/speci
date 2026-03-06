import { createInterface } from 'node:readline';

/**
 * Prompt the user for input with optional test injection.
 *
 * @param question - Prompt question text
 * @param promptFn - Optional injected prompt function
 * @param proc - Optional process streams for readline
 * @returns User response text
 */
export async function promptUser(
  question: string,
  promptFn?: (q: string) => Promise<string>,
  proc?: Pick<NodeJS.Process, 'stdin' | 'stdout'>
): Promise<string>;
export async function promptUser(
  question: string,
  promptFn?: (q: string) => Promise<string>,
  proc?: {
    stdin: NodeJS.ReadableStream;
    stdout: NodeJS.WritableStream;
  }
): Promise<string>;
export async function promptUser(
  question: string,
  promptFn?: (q: string) => Promise<string>,
  proc?: {
    stdin: NodeJS.ReadableStream;
    stdout: NodeJS.WritableStream;
  }
): Promise<string> {
  if (promptFn) {
    return promptFn(question);
  }

  const rl = createInterface({
    input: (proc ?? process).stdin,
    output: (proc ?? process).stdout,
  });

  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Check whether an answer is an affirmative yes.
 *
 * @param input - Raw user input
 * @returns True for y/yes (case-insensitive, trimmed)
 */
export function isYesAnswer(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}
