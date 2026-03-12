/**
 * Node Preflight Adapter
 *
 * Production implementation of IPreflight that delegates to
 * the preflight module for environment validation.
 */

import type { IPreflight, ILogger, IProcess } from '@/interfaces/index.js';
import type { SpeciConfig, PreflightOptions } from '@/types.js';
import { preflight } from '@/utils/helpers/preflight.js';

/**
 * Production preflight checker using the preflight module
 */
export class NodePreflight implements IPreflight {
  constructor(private readonly logger: ILogger) {}

  async run(
    config: SpeciConfig,
    options?: PreflightOptions,
    proc?: IProcess
  ): Promise<void> {
    return preflight(config, options, proc, undefined, this.logger);
  }
}
