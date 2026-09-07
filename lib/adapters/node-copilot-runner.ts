/**
 * Node.js Copilot Runner Adapter
 *
 * Production implementation of ICopilotRunner that wraps the existing copilot module.
 */

import {
  buildCopilotArgs,
  buildCopilotPromptArgs,
  listCopilotModels,
  spawnCopilot,
  runAgent,
  type CopilotArgsOptions,
  type AgentRunResult,
} from '@/copilot.js';
import type { CommandName, SpeciConfig } from '@/types.js';
import type { ICopilotRunner, ILogger, IProcess } from '@/interfaces/index.js';

/**
 * Node.js copilot runner adapter
 *
 * Implements ICopilotRunner by delegating to the existing copilot module.
 */
export class NodeCopilotRunner implements ICopilotRunner {
  constructor(private readonly logger: ILogger) {}

  async generateOpenSpecConfig(
    config: SpeciConfig,
    prompt: string,
    proc?: IProcess
  ): Promise<number> {
    const args = buildCopilotPromptArgs(config, prompt);
    this.logger.infoPlain('Generating OpenSpec config with Copilot CLI...');
    return spawnCopilot(args, { config, command: 'plan', inherit: true }, proc);
  }

  buildArgs(config: SpeciConfig, options: CopilotArgsOptions): string[] {
    return buildCopilotArgs(config, options);
  }

  async spawn(
    args: string[],
    options?: {
      inherit?: boolean;
      cwd?: string;
      config?: SpeciConfig;
      command?: CommandName;
    },
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

  async listModels(proc?: IProcess): Promise<string[] | null> {
    return listCopilotModels(proc, this.logger);
  }
}
