import {
  existsSync,
  mkdirSync,
  rmSync as nodeRmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFileSystem } from '@/adapters/node-filesystem.js';

describe('NodeFileSystem.rmSync', () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const path of cleanupPaths.splice(0)) {
      if (existsSync(path)) {
        nodeRmSync(path, { recursive: true, force: true });
      }
    }
  });

  it('supports recursive and force options', () => {
    const fs = new NodeFileSystem();
    const missingPath = join(
      tmpdir(),
      `speci-nodefs-missing-${Date.now()}-${Math.random()}`
    );

    expect(() =>
      fs.rmSync(missingPath, { recursive: true, force: true })
    ).not.toThrow();
    expect(existsSync(missingPath)).toBe(false);
  });

  it('supports rmSync without options for files', () => {
    const fs = new NodeFileSystem();
    const filePath = join(
      tmpdir(),
      `speci-nodefs-file-${Date.now()}-${Math.random()}.txt`
    );
    cleanupPaths.push(filePath);
    writeFileSync(filePath, 'content');

    fs.rmSync(filePath);

    expect(existsSync(filePath)).toBe(false);
  });

  it('removes nested directories recursively', () => {
    const fs = new NodeFileSystem();
    const dirPath = join(
      tmpdir(),
      `speci-nodefs-dir-${Date.now()}-${Math.random()}`
    );
    const nestedDir = join(dirPath, 'nested');
    const nestedFile = join(nestedDir, 'file.txt');
    cleanupPaths.push(dirPath);
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(nestedFile, 'content');

    fs.rmSync(dirPath, { recursive: true, force: true });

    expect(existsSync(dirPath)).toBe(false);
  });
});
