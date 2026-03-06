import type { Interface } from 'node:readline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInterface } from 'node:readline';
import { isYesAnswer, promptUser } from '../../lib/utils/helpers/prompt.js';

vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
}));

function makeMockInterface(answer: string): Interface {
  return {
    close: vi.fn(),
    question: vi.fn(
      (_query: string, callback: (response: string) => void): void => {
        callback(answer);
      }
    ),
  } as unknown as Interface;
}

describe('prompt helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('isYesAnswer returns true for y/yes variants', () => {
    expect(isYesAnswer('y')).toBe(true);
    expect(isYesAnswer('yes')).toBe(true);
    expect(isYesAnswer('Y')).toBe(true);
    expect(isYesAnswer('YES')).toBe(true);
    expect(isYesAnswer(' yes ')).toBe(true);
  });

  it('isYesAnswer returns false for non-affirmative input', () => {
    expect(isYesAnswer('')).toBe(false);
    expect(isYesAnswer('no')).toBe(false);
    expect(isYesAnswer('n')).toBe(false);
    expect(isYesAnswer('nope')).toBe(false);
  });

  it('promptUser uses injected prompt function when provided', async () => {
    const promptFn = vi.fn(async (question: string) => `answer:${question}`);

    await expect(promptUser('Q?', promptFn)).resolves.toBe('answer:Q?');
    expect(promptFn).toHaveBeenCalledWith('Q?');
    expect(createInterface).not.toHaveBeenCalled();
  });

  it('promptUser uses provided process streams when promptFn is absent', async () => {
    const mockInterface = makeMockInterface('typed');
    vi.mocked(createInterface).mockReturnValue(mockInterface);
    const proc = { stdin: process.stdin, stdout: process.stdout };

    await expect(promptUser('Prompt?', undefined, proc)).resolves.toBe('typed');
    expect(createInterface).toHaveBeenCalledWith({
      input: proc.stdin,
      output: proc.stdout,
    });
    expect(mockInterface.close).toHaveBeenCalledTimes(1);
  });

  it('promptUser falls back to global process streams', async () => {
    const mockInterface = makeMockInterface('fallback');
    vi.mocked(createInterface).mockReturnValue(mockInterface);

    await expect(promptUser('Fallback?')).resolves.toBe('fallback');
    expect(createInterface).toHaveBeenCalledWith({
      input: process.stdin,
      output: process.stdout,
    });
    expect(mockInterface.close).toHaveBeenCalledTimes(1);
  });
});
