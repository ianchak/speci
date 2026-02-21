/**
 * Node Preflight Adapter
 *
 * Production implementation of IPreflight that delegates to
 * the preflight module for environment validation.
 */

import type { IPreflight, IProcess } from '@/interfaces.js';
import type { SpeciConfig, PreflightOptions } from '@/types.js';
import { preflight } from '@/utils/preflight.js';

/**
 * Production preflight checker using the preflight module
 */
export class NodePreflight implements IPreflight {
  async run(
    config: SpeciConfig,
    options?: PreflightOptions,
    processParam?: IProcess
  ): Promise<void> {
    return preflight(config, options, processParam);
  }
}
