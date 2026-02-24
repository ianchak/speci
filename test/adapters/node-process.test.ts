import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeProcess } from '@/adapters/node-process.js';

describe('NodeProcess', () => {
  const adapter = new NodeProcess();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns process.env by reference', () => {
    expect(adapter.env).toBe(process.env);
  });

  it('delegates cwd to process.cwd', () => {
    expect(adapter.cwd()).toBe(process.cwd());
  });

  it('returns process.pid', () => {
    expect(adapter.pid).toBe(process.pid);
  });

  it('returns process.platform', () => {
    expect(adapter.platform).toBe(process.platform);
  });

  it('returns process.stdout by reference', () => {
    expect(adapter.stdout).toBe(process.stdout);
  });

  it('returns process.stdin by reference', () => {
    expect(adapter.stdin).toBe(process.stdin);
  });

  it('delegates exit to process.exit', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null): never => {
        throw new Error(`exit:${code ?? 0}`);
      });

    expect(() => adapter.exit(2)).toThrow('exit:2');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('delegates on to process.on', () => {
    const onSpy = vi.spyOn(process, 'on');
    const listener = vi.fn();

    adapter.on('SIGINT', listener);

    expect(onSpy).toHaveBeenCalledWith('SIGINT', listener);
  });
});
