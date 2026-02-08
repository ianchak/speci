/**
 * Gate Runner Module
 *
 * Executes validation commands (lint, typecheck, test) after implementation phases.
 * Acts as quality checkpoint - triggers fix agent on failures.
 */

import { spawn } from 'node:child_process';
import type { SpeciConfig } from '@/config.js';
import { log } from '@/utils/logger.js';
import { getGlyph } from '@/ui/glyphs.js';

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Result from a single gate command execution
 *
 * Note: This interface keeps error as a string field (not optional) because
 * gate commands always return stderr output. On success, error will be empty string.
 */
export interface GateCommandResult {
  command: string;
  isSuccess: boolean;
  exitCode: number;
  output: string;
  error: string;
  duration: number;
}

/**
 * Aggregate result from all gate commands
 *
 * This is a discriminated union type that uses the `isSuccess` property as the discriminator.
 * When `isSuccess` is `true`, all commands passed and there is no error.
 * When `isSuccess` is `false`, at least one command failed and `error` contains the first failure message.
 *
 * @example
 * ```typescript
 * const result = await runGate(config);
 * if (result.isSuccess) {
 *   // TypeScript knows error doesn't exist
 *   console.log('All gates passed!');
 * } else {
 *   // TypeScript knows error exists (no optional chaining needed)
 *   console.error(result.error);
 * }
 * ```
 */
export type GateResult =
  | { isSuccess: true; results: GateCommandResult[]; totalDuration: number }
  | {
      isSuccess: false;
      results: GateCommandResult[];
      error: string;
      totalDuration: number;
    };

/**
 * Execute a single gate command
 * @param command - Shell command to execute
 * @param options - Execution options (timeout, cwd)
 * @returns Command result with output and timing
 */
export async function executeGateCommand(
  command: string,
  options: { timeout?: number; cwd?: string } = {}
): Promise<GateCommandResult> {
  const { timeout = DEFAULT_TIMEOUT, cwd = process.cwd() } = options;
  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(command, [], {
      shell: true,
      cwd,
      env: process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      resolve({
        command,
        isSuccess: code === 0 && !timedOut,
        exitCode: timedOut ? 124 : (code ?? 1),
        output: stdout,
        error: timedOut ? `Command timed out after ${timeout}ms` : stderr,
        duration,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      resolve({
        command,
        isSuccess: false,
        exitCode: 127,
        output: '',
        error: err.message,
        duration,
      });
    });
  });
}

/**
 * Log the result of a gate command execution
 * @param result - Command result to log
 */
function logCommandResult(result: GateCommandResult): void {
  if (result.isSuccess) {
    log.success(`    ${getGlyph('success')} Passed (${result.duration}ms)`);
  } else {
    log.error(`    ${getGlyph('error')} Failed (exit code ${result.exitCode})`);
    if (result.error) {
      const errorLines = result.error.split('\n').slice(0, 5);
      for (const line of errorLines) {
        if (line.trim()) {
          log.error(`      ${line}`);
        }
      }
    }
  }
}

/**
 * Run all gate commands with strategy-based execution (sequential or parallel)
 * @param config - Speci configuration
 * @returns Aggregate gate result
 */
export async function runGate(config: SpeciConfig): Promise<GateResult> {
  const { commands, strategy = 'sequential' } = config.gate;

  if (commands.length === 0) {
    log.debug('No gate commands configured, skipping gate');
    return { isSuccess: true, results: [], totalDuration: 0 };
  }

  log.info(`Running gate checks (${commands.length} commands, ${strategy})...`);
  const startTime = Date.now();
  let results: GateCommandResult[];

  if (strategy === 'parallel') {
    // Execute all commands concurrently using Promise.allSettled
    const promises = commands.map((command) =>
      executeGateCommand(command).then((result) => ({ command, result }))
    );

    const settled = await Promise.allSettled(promises);
    results = settled.map((s, index) => {
      if (s.status === 'fulfilled') {
        return s.value.result;
      }
      // Create error result for rejected promises
      return {
        command: commands[index],
        isSuccess: false,
        exitCode: 127,
        output: '',
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        duration: 0,
      };
    });

    // Log results after all complete (avoid interleaving)
    for (let i = 0; i < results.length; i++) {
      log.info(`  ${getGlyph('pointer')} ${commands[i]}`);
      logCommandResult(results[i]);
    }
  } else {
    // Sequential execution (existing behavior)
    results = [];
    for (const command of commands) {
      log.info(`  ${getGlyph('pointer')} ${command}`);
      const result = await executeGateCommand(command);
      results.push(result);
      logCommandResult(result);
    }
  }

  const totalDuration = Date.now() - startTime;
  const isSuccess = results.every((r) => r.isSuccess);

  if (isSuccess) {
    log.success(
      `Gate passed! All ${commands.length} checks completed in ${totalDuration}ms`
    );
    return {
      isSuccess: true,
      results,
      totalDuration,
    };
  }

  // At least one command failed
  const firstError = results.find((r) => !r.isSuccess);
  log.error(`Gate failed: ${firstError?.command}`);

  return {
    isSuccess: false,
    results,
    error: firstError?.error ?? 'Unknown gate failure',
    totalDuration,
  };
}

/**
 * Check if gate can be retried
 * @param config - Speci configuration
 * @param attemptCount - Current number of fix attempts
 * @returns true if under maxFixAttempts limit
 */
export function canRetryGate(
  config: SpeciConfig,
  attemptCount: number
): boolean {
  return attemptCount < config.gate.maxFixAttempts;
}
