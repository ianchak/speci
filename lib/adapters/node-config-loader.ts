/**
 * Node.js Config Loader Adapter
 *
 * Production implementation of IConfigLoader that wraps the existing config loader.
 */

import { loadConfig } from '@/config.js';
import type { SpeciConfig } from '@/config.js';
import type { IConfigLoader } from '@/interfaces.js';

/**
 * Node.js config loader adapter
 *
 * Implements IConfigLoader by delegating to the existing loadConfig function.
 */
export class NodeConfigLoader implements IConfigLoader {
  async load(): Promise<SpeciConfig> {
    return loadConfig();
  }
}
