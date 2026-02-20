/**
 * Options accepted by yolo command.
 * Mirrors PlanOptions fields (cannot extend due to Commander.js limitations).
 */
export interface YoloOptions {
  /** Initial prompt for plan generation */
  prompt?: string;
  /** Input files to include as context (design docs, specs, etc.) */
  input?: string[];
  /** Output file path for plan (defaults to config.paths.plan) */
  output?: string;
  /** Custom agent path override */
  agent?: string;
  /** Override existing lock file */
  force?: boolean;
  /** Show detailed output */
  verbose?: boolean;
}
