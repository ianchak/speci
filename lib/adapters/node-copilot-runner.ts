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
import type { SpeciConfig } from '@/config.js';
import type { ICopilotRunner } from '@/interfaces.js';

/**
 * Node.js copilot runner adapter
 *
 * Implements ICopilotRunner by delegating to the existing copilot module.
 */
export class NodeCopilotRunner implements ICopilotRunner {
  buildArgs(config: SpeciConfig, options: CopilotArgsOptions): string[] {
    return buildCopilotArgs(config, options);
  }

  async spawn(
    args: string[],
    options?: { inherit?: boolean; cwd?: string }
  ): Promise<number> {
    return spawnCopilot(args, options);
  }

  async run(
    config: SpeciConfig,
    agentName: string,
    label: string
  ): Promise<AgentRunResult> {
    return runAgent(config, agentName, label);
  }
}
