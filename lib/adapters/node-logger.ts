/**
 * Node.js Logger Adapter
 *
 * Production implementation of ILogger that wraps the existing logger utility.
 */

import { createLogger } from '@/utils/infrastructure/logger.js';
import type { ILogger, IProcess } from '@/interfaces/index.js';

/**
 * Node.js logger adapter
 *
 * Implements ILogger by delegating to the existing log utility.
 */
export class NodeLogger implements ILogger {
  private readonly logger: ILogger;

  constructor(process: IProcess) {
    this.logger = createLogger(process);
  }

  info(message: string): void {
    this.logger.info(message);
  }

  infoPlain(message: string): void {
    this.logger.infoPlain(message);
  }

  warnPlain(message: string): void {
    this.logger.warnPlain(message);
  }

  errorPlain(message: string): void {
    this.logger.errorPlain(message);
  }

  successPlain(message: string): void {
    this.logger.successPlain(message);
  }

  error(message: string): void {
    this.logger.error(message);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  success(message: string): void {
    this.logger.success(message);
  }

  debug(message: string): void {
    this.logger.debug(message);
  }

  muted(message: string): void {
    this.logger.muted(message);
  }

  raw(message: string): void {
    this.logger.raw(message);
  }

  setVerbose(enabled: boolean): void {
    this.logger.setVerbose(enabled);
  }
}
