/**
 * Node.js Filesystem Adapter
 *
 * Production implementation of IFileSystem that wraps node:fs operations.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  rmSync,
  readdirSync,
  statSync,
  copyFileSync,
  promises as fsPromises,
} from 'node:fs';
import type { IFileSystem } from '@/interfaces.js';

/**
 * Node.js filesystem adapter
 *
 * Implements IFileSystem by delegating to node:fs operations.
 */
export class NodeFileSystem implements IFileSystem {
  existsSync(path: string): boolean {
    return existsSync(path);
  }

  readFileSync(path: string, encoding: BufferEncoding = 'utf8'): string {
    return readFileSync(path, encoding);
  }

  writeFileSync(
    path: string,
    data: string | Buffer,
    encoding: BufferEncoding = 'utf8'
  ): void {
    if (typeof data === 'string') {
      writeFileSync(path, data, encoding);
    } else {
      writeFileSync(path, data);
    }
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    mkdirSync(path, options);
  }

  unlinkSync(path: string): void {
    unlinkSync(path);
  }

  rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean }
  ): void {
    rmSync(path, options);
  }

  readdirSync(path: string): string[] {
    return readdirSync(path);
  }

  statSync(path: string): { isDirectory(): boolean; isFile(): boolean } {
    return statSync(path);
  }

  copyFileSync(src: string, dest: string): void {
    copyFileSync(src, dest);
  }

  async readFile(
    path: string,
    encoding: BufferEncoding = 'utf8'
  ): Promise<string> {
    return fsPromises.readFile(path, encoding);
  }

  async writeFile(
    path: string,
    data: string | Buffer,
    encoding: BufferEncoding = 'utf8'
  ): Promise<void> {
    if (typeof data === 'string') {
      await fsPromises.writeFile(path, data, encoding);
    } else {
      await fsPromises.writeFile(path, data);
    }
  }
}
