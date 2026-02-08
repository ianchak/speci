/**
 * Node.js Logger Adapter
 *
 * Production implementation of ILogger that wraps the existing logger utility.
 */

import { log, setLoggerProcess, setVerbose } from '@/utils/logger.js';
import type { ILogger, IProcess } from '@/interfaces.js';

/**
 * Node.js logger adapter
 *
 * Implements ILogger by delegating to the existing log utility.
 */
export class NodeLogger implements ILogger {
  constructor(process: IProcess) {
    setLoggerProcess(process);
  }

  info(message: string): void {
    log.info(message);
  }

  error(message: string): void {
    log.error(message);
  }

  warn(message: string): void {
    log.warn(message);
  }

  success(message: string): void {
    log.success(message);
  }

  debug(message: string): void {
    log.debug(message);
  }

  muted(message: string): void {
    log.muted(message);
  }

  setVerbose(enabled: boolean): void {
    setVerbose(enabled);
  }
}
