/**
 * Node.js Config Loader Adapter
 *
 * Production implementation of IConfigLoader that wraps the existing config loader.
 */

import { loadConfig } from '@/config/index.js';
import type { SpeciConfig } from '@/types.js';
import type {
  IConfigLoader,
  IFileSystem,
  ILogger,
  IProcess,
} from '@/interfaces/index.js';

/**
 * Node.js config loader adapter
 *
 * Implements IConfigLoader by delegating to the existing loadConfig function.
 */
export class NodeConfigLoader implements IConfigLoader {
  constructor(
    private readonly process: IProcess,
    private readonly fs: IFileSystem,
    private readonly logger: ILogger
  ) {}

  async load(): Promise<SpeciConfig> {
    return loadConfig({ proc: this.process, fs: this.fs, logger: this.logger });
  }
}
