import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync as nodeRmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeFileSystem } from '@/adapters/node-filesystem.js';

describe('NodeFileSystem', () => {
  let tempDir: string;
  let fs: NodeFileSystem;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'speci-nodefs-'));
    fs = new NodeFileSystem();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      nodeRmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('readFile returns expected content for existing file', async () => {
    const filePath = join(tempDir, 'read.txt');
    writeFileSync(filePath, 'hello world', 'utf8');

    await expect(fs.readFile(filePath)).resolves.toBe('hello world');
  });

  it('readFile throws ENOENT for missing file', async () => {
    const missingPath = join(tempDir, 'missing.txt');

    await expect(fs.readFile(missingPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('writeFile persists string content', async () => {
    const filePath = join(tempDir, 'string.txt');

    await fs.writeFile(filePath, 'string payload');

    expect(readFileSync(filePath, 'utf8')).toBe('string payload');
  });

  it('writeFile persists buffer content', async () => {
    const filePath = join(tempDir, 'buffer.bin');
    const payload = Buffer.from('buffer payload', 'utf8');

    await fs.writeFile(filePath, payload);

    expect(readFileSync(filePath)).toEqual(payload);
  });

  describe('rmSync', () => {
    it('supports recursive and force options', () => {
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
      const filePath = join(tempDir, 'file.txt');
      writeFileSync(filePath, 'content');

      fs.rmSync(filePath);

      expect(existsSync(filePath)).toBe(false);
    });

    it('removes nested directories recursively', () => {
      const dirPath = join(tempDir, 'dir');
      const nestedDir = join(dirPath, 'nested');
      const nestedFile = join(nestedDir, 'file.txt');
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(nestedFile, 'content');

      fs.rmSync(dirPath, { recursive: true, force: true });

      expect(existsSync(dirPath)).toBe(false);
    });
  });
});
