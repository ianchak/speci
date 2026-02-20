import { describe, expect, it } from 'vitest';
import type { YoloOptions } from '../lib/commands/yolo.js';

describe('YoloOptions interface', () => {
  it('supports initialization with all fields', () => {
    const options: YoloOptions = {
      prompt: 'Build a feature',
      input: ['docs/spec.md', 'docs/design.md'],
      output: 'docs/plan.md',
      force: true,
      verbose: true,
    };

    expect(options.prompt).toBe('Build a feature');
    expect(options.input).toHaveLength(2);
    expect(options.output).toBe('docs/plan.md');
    expect(options.force).toBe(true);
    expect(options.verbose).toBe(true);
  });

  it('supports optional prompt-only usage', () => {
    const options: YoloOptions = { prompt: 'Prompt only' };
    expect(options.prompt).toBe('Prompt only');
    expect(options.input).toBeUndefined();
  });

  it('supports input-only usage', () => {
    const options: YoloOptions = { input: ['docs/spec.md'] };
    expect(options.input).toEqual(['docs/spec.md']);
    expect(options.prompt).toBeUndefined();
  });

  it('supports empty and single-element input arrays', () => {
    const emptyInput: YoloOptions = { input: [] };
    const singleInput: YoloOptions = { input: ['docs/spec.md'] };

    expect(emptyInput.input).toEqual([]);
    expect(singleInput.input).toEqual(['docs/spec.md']);
  });

  it('accepts empty object and undefined option values', () => {
    const defaults: YoloOptions = {};
    const withUndefined: YoloOptions = {
      prompt: undefined,
      input: undefined,
      output: undefined,
      force: undefined,
      verbose: undefined,
    };

    expect(defaults).toEqual({});
    expect(withUndefined.force).toBeUndefined();
  });

  it('rejects invalid null and array element types at compile time', () => {
    const acceptsYoloOptions = (_options: YoloOptions): void => undefined;

    // @ts-expect-error null is not assignable to optional string
    acceptsYoloOptions({ prompt: null });
    // @ts-expect-error number array is not assignable to string[]
    acceptsYoloOptions({ input: [1, 2, 3] });
    // @ts-expect-error undefined elements are not assignable to string
    acceptsYoloOptions({ input: ['docs/spec.md', undefined] });

    expect(true).toBe(true);
  });
});
