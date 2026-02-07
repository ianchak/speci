/**
 * Production Context Factory
 *
 * Factory function to create a fully-wired CommandContext with production
 * implementations of all dependencies. This is the main entry point for
 * obtaining a context in production code.
 */

import { NodeFileSystem } from './node-filesystem.js';
import { NodeProcess } from './node-process.js';
import { NodeLogger } from './node-logger.js';
import { NodeConfigLoader } from './node-config-loader.js';
import { NodeCopilotRunner } from './node-copilot-runner.js';
import type { CommandContext } from '@/interfaces.js';

/**
 * Create a production context with all dependencies wired up
 *
 * @returns CommandContext with production adapters
 */
export function createProductionContext(): CommandContext {
  const nodeProcess = new NodeProcess();

  return {
    fs: new NodeFileSystem(),
    process: nodeProcess,
    logger: new NodeLogger(nodeProcess),
    configLoader: new NodeConfigLoader(nodeProcess),
    copilotRunner: new NodeCopilotRunner(),
  };
}
