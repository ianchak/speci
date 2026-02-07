/**
 * Node.js Process Adapter
 *
 * Production implementation of IProcess that wraps the Node.js process global.
 */

import type { IProcess } from '@/interfaces.js';

/**
 * Node.js process adapter
 *
 * Implements IProcess by delegating to the process global.
 */
export class NodeProcess implements IProcess {
  get env(): NodeJS.ProcessEnv {
    return process.env;
  }

  cwd(): string {
    return process.cwd();
  }

  exit(code = 0): never {
    process.exit(code);
  }

  get pid(): number {
    return process.pid;
  }

  get platform(): NodeJS.Platform {
    return process.platform;
  }

  get stdout(): NodeJS.WriteStream {
    return process.stdout;
  }

  get stdin(): NodeJS.ReadStream {
    return process.stdin;
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    process.on(event, listener);
  }
}
