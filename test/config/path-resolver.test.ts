import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { resolveConfigPath } from '@/config/path-resolver.js';

describe('resolveConfigPath', () => {
  const root = resolve('repo', 'speci');

  it('resolves relative paths against root', () => {
    const resolved = resolveConfigPath(
      'docs/PROGRESS.md',
      root,
      'docs/default.md'
    );

    expect(resolved).toBe(resolve(root, 'docs/PROGRESS.md'));
  });

  it('returns absolute paths unchanged', () => {
    const absolutePath = resolve(root, 'absolute', 'file.md');

    const resolved = resolveConfigPath(absolutePath, root, 'docs/default.md');

    expect(resolved).toBe(absolutePath);
  });

  it('uses default path when configured path is empty', () => {
    const resolved = resolveConfigPath('', root, 'docs/PROGRESS.md');

    expect(resolved).toBe(resolve(root, 'docs/PROGRESS.md'));
  });

  it('normalizes parent directory segments', () => {
    const resolved = resolveConfigPath(
      '../sibling/file.md',
      root,
      'docs/default.md'
    );

    expect(resolved).toBe(resolve(root, '..', 'sibling', 'file.md'));
    expect(resolved).toBe(join(resolve(root, '..', 'sibling'), 'file.md'));
  });
});
