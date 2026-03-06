/**
 * Node.js Copilot Runner Adapter
 *
 * Production implementation of ICopilotRunner that wraps the existing copilot module.
 */

import {
  buildCopilotArgs,
  spawnCopilot,
  runAgent,
  type CopilotArgsOptions,
  type AgentRunResult,
} from '@/copilot.js';
import type { SpeciConfig } from '@/types.js';
import type { ICopilotRunner, ILogger, IProcess } from '@/interfaces/index.js';

/**
 * Node.js copilot runner adapter
 *
 * Implements ICopilotRunner by delegating to the existing copilot module.
 */
export class NodeCopilotRunner implements ICopilotRunner {
  constructor(private readonly logger: ILogger) {}

  buildArgs(config: SpeciConfig, options: CopilotArgsOptions): string[] {
    return buildCopilotArgs(config, options);
  }

  async spawn(
    args: string[],
    options?: { inherit?: boolean; cwd?: string },
    proc?: IProcess
  ): Promise<number> {
    return spawnCopilot(args, options, proc);
  }

  async run(
    config: SpeciConfig,
    agentName: string,
    proc?: IProcess
  ): Promise<AgentRunResult> {
    return runAgent(config, agentName, undefined, proc, this.logger);
  }
}
