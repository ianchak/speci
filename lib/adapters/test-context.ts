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
  IStateReader,
  ILockManager,
  IGateRunner,
  IPreflight,
  ISignalManager,
} from '@/interfaces/index.js';
import type { AgentRunResult, SpeciConfig } from '@/types.js';
import { STATE } from '@/types.js';
import { DEFAULT_PATHS } from '@/constants.js';

/**
 * Mock stdout stream used by test process doubles.
 */
export interface MockWriteStream {
  isTTY: boolean;
  columns: number;
  rows: number;
  write: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

/**
 * Mock stdin stream used by test process doubles.
 */
export interface MockReadStream {
  isTTY: boolean;
  setRawMode: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

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
    rmSync: vi.fn(),
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
  const stdout: NodeJS.WriteStream & MockWriteStream = Object.assign(
    Object.create(process.stdout),
    {
      isTTY: false,
      columns: 80,
      rows: 24,
      write: vi.fn(() => true),
      on: vi.fn(),
      off: vi.fn(),
    }
  );
  const stdin: NodeJS.ReadStream & MockReadStream = Object.assign(
    Object.create(process.stdin),
    {
      isTTY: false,
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      removeListener: vi.fn(),
    }
  );

  return {
    env: {},
    cwd: vi.fn(() => '/mock/cwd'),
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never,
    pid: 12345,
    platform: 'linux',
    version: 'v22.0.0',
    argv: ['node', 'speci'],
    stdout,
    stdin,
    on: vi.fn(),
    off: vi.fn(),
  };
}

/**
 * Create a successful agent run result for tests.
 */
export function mockAgentSuccess(exitCode: 0 = 0): AgentRunResult {
  return { isSuccess: true, exitCode };
}

/**
 * Create a failed agent run result for tests.
 */
export function mockAgentFailure(
  exitCode = 1,
  error = 'Agent run failed'
): AgentRunResult {
  return { isSuccess: false, exitCode, error };
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
      progress: DEFAULT_PATHS.PROGRESS,
      tasks: DEFAULT_PATHS.TASKS,
      logs: DEFAULT_PATHS.LOGS,
      lock: DEFAULT_PATHS.LOCK,
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
    run: vi.fn(async () => mockAgentSuccess()),
  };
}

/**
 * Create a mock state reader for testing
 *
 * @returns Mock IStateReader with Vitest spy methods
 */
export function createMockStateReader(): IStateReader {
  return {
    getState: vi.fn(async () => STATE.NO_PROGRESS),
    getTaskStats: vi.fn(async () => ({
      total: 0,
      completed: 0,
      remaining: 0,
      inReview: 0,
      blocked: 0,
    })),
    getCurrentTask: vi.fn(async () => undefined),
    writeFailureNotes: vi.fn(async () => {}),
    getMilestonesMvtStatus: vi.fn(async () => []),
  };
}

/**
 * Create a mock lock manager for testing
 *
 * @returns Mock ILockManager with Vitest spy methods
 */
export function createMockLockManager(): ILockManager {
  return {
    acquire: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    isLocked: vi.fn(async () => false),
    getInfo: vi.fn(async () => ({
      isLocked: false,
      started: null,
      pid: null,
      elapsed: null,
    })),
  };
}

/**
 * Create a mock gate runner for testing
 *
 * @returns Mock IGateRunner with Vitest spy methods
 */
export function createMockGateRunner(): IGateRunner {
  return {
    run: vi.fn(async () => ({
      isSuccess: true as const,
      results: [],
      totalDuration: 0,
    })),
    canRetry: vi.fn(() => true),
  };
}

/**
 * Create a mock preflight checker for testing
 *
 * @returns Mock IPreflight with Vitest spy methods
 */
export function createMockPreflight(): IPreflight {
  return {
    run: vi.fn(async () => {}),
  };
}

/**
 * Create a mock signal manager for testing
 *
 * @returns Mock ISignalManager with Vitest spy methods
 */
export function createMockSignalManager(): ISignalManager {
  return {
    install: vi.fn(),
    remove: vi.fn(),
    registerCleanup: vi.fn(),
    unregisterCleanup: vi.fn(),
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
  /** Mock state reader to use */
  stateReader?: IStateReader;
  /** Mock lock manager to use */
  lockManager?: ILockManager;
  /** Mock gate runner to use */
  gateRunner?: IGateRunner;
  /** Mock preflight checker to use */
  preflight?: IPreflight;
  /** Mock signal manager to use */
  signalManager?: ISignalManager;
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
    stateReader: options.stateReader || createMockStateReader(),
    lockManager: options.lockManager || createMockLockManager(),
    gateRunner: options.gateRunner || createMockGateRunner(),
    preflight: options.preflight || createMockPreflight(),
    signalManager: options.signalManager || createMockSignalManager(),
  };
}
