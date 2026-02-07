import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../lib/config.js';
import type { IProcess } from '../lib/interfaces.js';

describe('config with IProcess parameter', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `speci-test-config-process-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should use mock process.cwd() when provided', async () => {
    // Create config file in test directory
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(configPath, JSON.stringify({ version: '1.0.0' }));

    // Create mock process that returns testDir as cwd
    const mockProcess: IProcess = {
      env: {},
      cwd: () => testDir,
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
    };

    // Load config with mock process
    const config = await loadConfig(mockProcess);

    expect(config).toBeDefined();
    expect(config.version).toBe('1.0.0');
  });

  it('should use mock process.env for environment overrides', async () => {
    // Create config file
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0.0',
        gate: { commands: ['npm test'], maxFixAttempts: 3 },
      })
    );

    // Create mock process with env override
    const mockProcess: IProcess = {
      env: {
        SPECI_MAX_FIX_ATTEMPTS: '7',
      },
      cwd: () => testDir,
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
    };

    // Load config with mock process
    const config = await loadConfig(mockProcess);

    // Verify env override was applied
    expect(config.gate.maxFixAttempts).toBe(7);
  });

  it('should use real process when parameter not provided (backward compat)', async () => {
    // Change to test directory
    process.chdir(testDir);

    // Create config file
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(configPath, JSON.stringify({ version: '1.0.0' }));

    // Load config without process parameter
    const config = await loadConfig();

    expect(config).toBeDefined();
    expect(config.version).toBe('1.0.0');
  });

  it('should handle empty env gracefully', async () => {
    const configPath = join(testDir, 'speci.config.json');
    writeFileSync(configPath, JSON.stringify({ version: '1.0.0' }));

    const mockProcess: IProcess = {
      env: {}, // Empty environment
      cwd: () => testDir,
      exit: vi.fn() as never,
      pid: 12345,
      platform: 'linux',
      stdout: {} as NodeJS.WriteStream,
      stdin: {} as NodeJS.ReadStream,
      on: vi.fn(),
    };

    const config = await loadConfig(mockProcess);

    expect(config).toBeDefined();
    // Should use defaults when no env overrides present
    expect(config.gate.maxFixAttempts).toBe(5);
  });
});
