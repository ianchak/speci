/**
 * Tests for Production Context Factory
 *
 * Verifies that the createProductionContext() factory correctly instantiates
 * all adapters and wires up dependencies for production use.
 */

import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionContext } from '@/adapters/context-factory.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const missingPath = join(currentDir, '__speci_missing_path__');
const KNOWN_PLATFORMS = [
  'aix',
  'darwin',
  'freebsd',
  'linux',
  'openbsd',
  'sunos',
  'win32',
] as const;

describe('createProductionContext', () => {
  it('should create a context with all dependencies', () => {
    const context = createProductionContext();

    expect(context).toBeDefined();
    expect(context.fs).toBeDefined();
    expect(context.process).toBeDefined();
    expect(context.logger).toBeDefined();
    expect(context.configLoader).toBeDefined();
    expect(context.copilotRunner).toBeDefined();
  });

  it('should provide a filesystem adapter', () => {
    const context = createProductionContext();

    // Check that key methods exist
    expect(context.fs.existsSync).toBeInstanceOf(Function);
    expect(context.fs.readFileSync).toBeInstanceOf(Function);
    expect(context.fs.writeFileSync).toBeInstanceOf(Function);
    expect(context.fs.mkdirSync).toBeInstanceOf(Function);
    expect(context.fs.unlinkSync).toBeInstanceOf(Function);
    expect(context.fs.readdirSync).toBeInstanceOf(Function);
    expect(context.fs.existsSync(currentDir)).toBe(true);
    expect(context.fs.existsSync(missingPath)).toBe(false);
  });

  it('should provide a process adapter', () => {
    const context = createProductionContext();

    // Check that key properties and methods exist
    expect(context.process.env).toBeDefined();
    expect(context.process.cwd).toBeInstanceOf(Function);
    expect(context.process.exit).toBeInstanceOf(Function);
    expect(context.process.pid).toBeTypeOf('number');
    expect(context.process.platform).toBeTypeOf('string');
    expect(context.process.stdout).toBeDefined();
    expect(context.process.stdin).toBeDefined();
    expect(typeof context.process.cwd()).toBe('string');
    expect(context.process.cwd().length).toBeGreaterThan(0);
    expect(Number.isInteger(context.process.pid)).toBe(true);
    expect(context.process.pid).toBeGreaterThan(0);
    expect(KNOWN_PLATFORMS).toContain(context.process.platform);
  });

  it('should provide a logger adapter', () => {
    const context = createProductionContext();

    // Check that all log methods exist
    expect(context.logger.info).toBeInstanceOf(Function);
    expect(context.logger.error).toBeInstanceOf(Function);
    expect(context.logger.warn).toBeInstanceOf(Function);
    expect(context.logger.success).toBeInstanceOf(Function);
    expect(context.logger.debug).toBeInstanceOf(Function);
    expect(context.logger.muted).toBeInstanceOf(Function);
    expect(() => context.logger.info('smoke test')).not.toThrow();
  });

  it('should provide a config loader adapter', () => {
    const context = createProductionContext();

    expect(context.configLoader.load).toBeInstanceOf(Function);
  });

  it('should provide a copilot runner adapter', () => {
    const context = createProductionContext();

    expect(context.copilotRunner.buildArgs).toBeInstanceOf(Function);
    expect(context.copilotRunner.spawn).toBeInstanceOf(Function);
    expect(context.copilotRunner.run).toBeInstanceOf(Function);
  });

  it('should return the same types for multiple calls', () => {
    const context1 = createProductionContext();
    const context2 = createProductionContext();

    // Should be different instances but same structure
    expect(context1).not.toBe(context2);
    expect(Object.keys(context1)).toEqual(Object.keys(context2));
  });
});
