/**
 * Test Context Utilities
 *
 * Helper functions for creating mock contexts in tests. These utilities
 * make it easy to inject test doubles for all dependencies.
 */

import { vi } from 'vitest';
import type {
  CommandContext,
  IFileSystem,
  IProcess,
  ILogger,
  IConfigLoader,
  ICopilotRunner,
} from '@/interfaces.js';
import type { SpeciConfig } from '@/config.js';

/**
 * Create a mock filesystem for testing
 *
 * @returns Mock IFileSystem with Vitest spy methods
 */
export function createMockFileSystem(): IFileSystem {
  return {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
      isFile: () => true,
    })),
    copyFileSync: vi.fn(),
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => {}),
  };
}

/**
 * Create a mock process for testing
 *
 * @returns Mock IProcess with Vitest spy methods
 */
export function createMockProcess(): IProcess {
  return {
    env: {},
    cwd: vi.fn(() => '/mock/cwd'),
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never,
    pid: 12345,
    platform: 'linux',
    stdout: {
      isTTY: false,
      columns: 80,
      rows: 24,
      write: vi.fn(),
    } as unknown as NodeJS.WriteStream,
    stdin: {
      isTTY: false,
    } as unknown as NodeJS.ReadStream,
    on: vi.fn(),
  };
}

/**
 * Create a mock logger for testing
 *
 * @returns Mock ILogger with Vitest spy methods
 */
export function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    infoPlain: vi.fn(),
    warnPlain: vi.fn(),
    errorPlain: vi.fn(),
    successPlain: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    muted: vi.fn(),
    raw: vi.fn(),
    setVerbose: vi.fn(),
  };
}

/**
 * Create a mock config loader for testing
 *
 * @param config - Optional config to return (defaults to minimal valid config)
 * @returns Mock IConfigLoader with Vitest spy methods
 */
export function createMockConfigLoader(
  config?: Partial<SpeciConfig>
): IConfigLoader {
  const defaultConfig: SpeciConfig = {
    version: '1.0.0',
    paths: {
      progress: 'docs/PROGRESS.md',
      tasks: 'docs/tasks',
      logs: '.speci-logs',
      lock: '.speci-lock',
    },
    copilot: {
      permissions: 'allow-all',
      models: {
        plan: 'claude-opus-4.6',
        task: 'claude-sonnet-4.5',
        refactor: 'claude-sonnet-4.5',
        impl: 'gpt-5.3-codex',
        review: 'claude-sonnet-4.5',
        fix: 'claude-sonnet-4.5',
        tidy: 'gpt-5.2',
      },
      extraFlags: [],
    },
    gate: {
      commands: ['npm test'],
      maxFixAttempts: 3,
    },
    loop: {
      maxIterations: 10,
    },
  };

  return {
    load: vi.fn(async () => ({ ...defaultConfig, ...config })),
  };
}

/**
 * Create a mock copilot runner for testing
 *
 * @returns Mock ICopilotRunner with Vitest spy methods
 */
export function createMockCopilotRunner(): ICopilotRunner {
  return {
    buildArgs: vi.fn(() => []),
    spawn: vi.fn(async () => 0),
    run: vi.fn(async () => ({ isSuccess: true, exitCode: 0 }) as const),
  };
}

/**
 * Options for creating a mock context
 */
export interface MockContextOptions {
  /** Mock filesystem to use */
  fs?: IFileSystem;
  /** Mock process to use */
  process?: IProcess;
  /** Mock logger to use */
  logger?: ILogger;
  /** Mock config loader to use */
  configLoader?: IConfigLoader;
  /** Mock copilot runner to use */
  copilotRunner?: ICopilotRunner;
  /** Config to return from config loader */
  mockConfig?: Partial<SpeciConfig>;
  /** Current working directory for mock process */
  cwd?: string;
}

/**
 * Create a complete mock context for testing
 *
 * @param options - Optional configuration for mock context
 * @returns Mock CommandContext with all dependencies
 */
export function createMockContext(
  options: MockContextOptions = {}
): CommandContext {
  const mockProcess = options.process || createMockProcess();
  if (options.cwd) {
    mockProcess.cwd = vi.fn(() => options.cwd!);
  }

  return {
    fs: options.fs || createMockFileSystem(),
    process: mockProcess,
    logger: options.logger || createMockLogger(),
    configLoader:
      options.configLoader || createMockConfigLoader(options.mockConfig),
    copilotRunner: options.copilotRunner || createMockCopilotRunner(),
  };
}
