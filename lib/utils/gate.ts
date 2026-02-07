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
 */
export interface GateResult {
  isSuccess: boolean;
  results: GateCommandResult[];
  error?: string;
  totalDuration: number;
}

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
 * Run all gate commands sequentially
 * @param config - Speci configuration
 * @returns Aggregate gate result
 */
export async function runGate(config: SpeciConfig): Promise<GateResult> {
  const { commands } = config.gate;

  if (commands.length === 0) {
    log.debug('No gate commands configured, skipping gate');
    return { isSuccess: true, results: [], totalDuration: 0 };
  }

  log.info(`Running gate checks (${commands.length} commands)...`);
  const startTime = Date.now();
  const results: GateCommandResult[] = [];

  for (const command of commands) {
    log.info(`  ${getGlyph('pointer')} ${command}`);
    const result = await executeGateCommand(command);
    results.push(result);

    if (result.isSuccess) {
      log.success(`    ${getGlyph('success')} Passed (${result.duration}ms)`);
    } else {
      log.error(
        `    ${getGlyph('error')} Failed (exit code ${result.exitCode})`
      );
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

  const totalDuration = Date.now() - startTime;
  const isSuccess = results.every((r) => r.isSuccess);
  const firstError = results.find((r) => !r.isSuccess);

  if (isSuccess) {
    log.success(
      `Gate passed! All ${commands.length} checks completed in ${totalDuration}ms`
    );
  } else {
    log.error(`Gate failed: ${firstError?.command}`);
  }

  return {
    isSuccess,
    results,
    error: firstError?.error,
    totalDuration,
  };
}

/**
 * Track gate retry attempts for the current run
 */
let currentAttempt = 0;

/**
 * Reset gate attempt counter (call at start of speci run)
 */
export function resetGateAttempts(): void {
  currentAttempt = 0;
}

/**
 * Increment gate attempt counter (call after fix agent runs)
 */
export function incrementGateAttempt(): void {
  currentAttempt++;
}

/**
 * Get current gate attempt number
 * @returns Current attempt count
 */
export function getGateAttempt(): number {
  return currentAttempt;
}

/**
 * Check if gate can be retried
 * @param config - Speci configuration
 * @returns true if under maxFixAttempts limit
 */
export function canRetryGate(config: SpeciConfig): boolean {
  return currentAttempt < config.gate.maxFixAttempts;
}
