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
import { NodeStateReader } from './node-state-reader.js';
import { NodeLockManager } from './node-lock-manager.js';
import { NodeGateRunner } from './node-gate-runner.js';
import { NodePreflight } from './node-preflight.js';
import { NodeSignalManager } from './node-signal-manager.js';
import { defaultSignalManager } from '@/utils/infrastructure/signals.js';
import type { CommandContext } from '@/interfaces/index.js';

/**
 * Create a production context with all dependencies wired up
 *
 * @returns CommandContext with production adapters
 */
export function createProductionContext(): CommandContext {
  const nodeProcess = new NodeProcess();
  const nodeFileSystem = new NodeFileSystem();
  const nodeLogger = new NodeLogger(nodeProcess);

  return {
    fs: nodeFileSystem,
    process: nodeProcess,
    logger: nodeLogger,
    configLoader: new NodeConfigLoader(nodeProcess, nodeFileSystem, nodeLogger),
    copilotRunner: new NodeCopilotRunner(nodeLogger),
    stateReader: new NodeStateReader(nodeFileSystem),
    lockManager: new NodeLockManager(nodeLogger),
    gateRunner: new NodeGateRunner(nodeLogger),
    preflight: new NodePreflight(nodeLogger),
    signalManager: new NodeSignalManager(defaultSignalManager, nodeLogger),
  };
}
