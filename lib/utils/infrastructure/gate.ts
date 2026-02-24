/**
 * Gate Runner Module
 *
 * Executes validation commands (lint, typecheck, test) after implementation phases.
 * Acts as quality checkpoint - triggers fix agent on failures.
 */

import { spawn } from 'node:child_process';
import type { SpeciConfig, GateCommandResult, GateResult } from '@/types.js';
import { log } from './logger.js';
import { getGlyph } from '@/ui/glyphs.js';
import { colorize } from '@/ui/colors.js';

// Re-export types for backward compatibility
export type { GateCommandResult, GateResult } from '@/types.js';

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

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
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
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

    child.stdout?.on('data', (data: Buffer | string) => {
      stdoutChunks.push(String(data));
    });

    child.stderr?.on('data', (data: Buffer | string) => {
      stderrChunks.push(String(data));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      const stdout = stdoutChunks.join('');
      const stderr = stderrChunks.join('');

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
 * Format a duration in milliseconds to a human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g. "123ms" or "1.5s")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Log a gate command with its result on a single line
 * @param command - The command that was executed
 * @param result - Command result to log
 */
function logCommandLine(command: string, result: GateCommandResult): void {
  const duration = formatDuration(result.duration);
  if (result.isSuccess) {
    log.raw(
      `  ${colorize(`${getGlyph('pointer')}`, 'sky400')} ${colorize(command, 'sky400')}  ${colorize(`${getGlyph('success')} passed`, 'success')}  ${colorize(duration, 'dim')}`
    );
  } else {
    log.raw(
      `  ${colorize(`${getGlyph('pointer')}`, 'sky400')} ${colorize(command, 'sky400')}  ${colorize(`${getGlyph('error')} failed`, 'error')}  ${colorize(`exit ${result.exitCode}`, 'dim')}`
    );
    if (result.error) {
      const errorLines = result.error.split('\n').slice(0, 5);
      for (const line of errorLines) {
        if (line.trim()) {
          log.errorPlain(`      ${line}`);
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

  log.raw('');
  log.infoPlain(
    `Running gate checks (${commands.length} commands, ${strategy})...`
  );
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
      logCommandLine(commands[i], results[i]);
    }
  } else {
    // Sequential execution (existing behavior)
    results = [];
    for (const command of commands) {
      const result = await executeGateCommand(command);
      results.push(result);
      logCommandLine(command, result);
    }
  }

  const totalDuration = Date.now() - startTime;
  const isSuccess = results.every((r) => r.isSuccess);

  if (isSuccess) {
    log.raw('');
    log.success(
      `Gate passed ${getGlyph('bullet')} ${commands.length}/${commands.length} checks in ${formatDuration(totalDuration)}`
    );
    return {
      isSuccess: true,
      results,
      totalDuration,
    };
  }

  // At least one command failed
  const failed = results.filter((r) => !r.isSuccess);
  const firstError = failed[0];
  log.raw('');
  log.error(
    `Gate failed ${getGlyph('bullet')} ${failed.length}/${commands.length} checks failed`
  );

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
