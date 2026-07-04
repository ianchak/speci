import type { IFileSystem, ILogger, IProcess } from '@/interfaces/index.js';
import type { SpeciConfig } from '@/types.js';
import { promptUser } from './prompt.js';

export const MODEL_ROLES = [
  'plan',
  'task',
  'refactor',
  'impl',
  'review',
  'fix',
  'tidy',
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];
export type ModelPreset = 'best' | 'balanced' | 'budget';

const ROLE_DESCRIPTIONS: Record<ModelRole, string> = {
  plan: 'Orchestrates your task breakdown',
  task: 'Generates and structures tasks',
  refactor: 'Finds safe refactoring opportunities',
  impl: 'Implements production code changes',
  review: 'Reviews correctness and edge cases',
  fix: 'Repairs failures from gates/review',
  tidy: 'Performs cleanup and polish tasks',
};

const PRESET_ORDER: Record<ModelPreset, Record<ModelRole, RegExp[]>> = {
  best: {
    plan: [/claude-opus/i, /codex/i, /claude-sonnet/i, /gpt-5/i],
    task: [/claude-sonnet/i, /gpt-5(?!.*mini)/i, /claude-opus/i, /mini/i],
    refactor: [/claude-sonnet/i, /gpt-5(?!.*mini)/i, /claude-opus/i, /mini/i],
    impl: [/codex/i, /gpt-5(?!.*mini)/i, /claude-opus/i, /claude-sonnet/i],
    review: [/claude-opus/i, /claude-sonnet/i, /codex/i, /gpt-5/i],
    fix: [/claude-sonnet/i, /codex/i, /gpt-5(?!.*mini)/i, /mini/i],
    tidy: [/gpt-5.*mini/i, /claude-haiku/i, /flash/i, /claude-sonnet/i],
  },
  balanced: {
    plan: [/claude-opus/i, /claude-sonnet/i, /codex/i, /gpt-5/i],
    task: [/claude-sonnet/i, /gpt-5(?!.*mini)/i, /claude-haiku/i, /mini/i],
    refactor: [/claude-sonnet/i, /gpt-5(?!.*mini)/i, /claude-haiku/i, /mini/i],
    impl: [/codex/i, /gpt-5(?!.*mini)/i, /claude-sonnet/i, /mini/i],
    review: [/claude-sonnet/i, /claude-opus/i, /codex/i, /gpt-5/i],
    fix: [/claude-sonnet/i, /codex/i, /gpt-5(?!.*mini)/i, /mini/i],
    tidy: [/gpt-5.*mini/i, /claude-haiku/i, /flash/i, /claude-sonnet/i],
  },
  budget: {
    plan: [/mini/i, /flash/i, /haiku/i, /gpt-5/i],
    task: [/mini/i, /flash/i, /haiku/i, /gpt-5/i],
    refactor: [/mini/i, /flash/i, /haiku/i, /gpt-5/i],
    impl: [/mini/i, /flash/i, /haiku/i, /codex/i, /gpt-5/i],
    review: [/mini/i, /flash/i, /haiku/i, /gpt-5/i],
    fix: [/mini/i, /flash/i, /haiku/i, /gpt-5/i],
    tidy: [/mini/i, /flash/i, /haiku/i, /gpt-5/i],
  },
};

function isInteractiveTerminal(
  proc: IProcess,
  promptFn?: (question: string) => Promise<string>
): boolean {
  return Boolean(promptFn) || Boolean(proc.stdin?.isTTY);
}

function pickByPatterns(
  models: string[],
  patterns: RegExp[],
  fallback: string
): string {
  for (const pattern of patterns) {
    const match = models.find((model) => pattern.test(model));
    if (match) return match;
  }
  if (models.includes(fallback)) return fallback;
  return models[0] ?? fallback;
}

export function applyPresetModels(
  preset: ModelPreset,
  models: string[],
  fallback: SpeciConfig['copilot']['models']
): SpeciConfig['copilot']['models'] {
  const resolved = { ...fallback };
  for (const role of MODEL_ROLES) {
    resolved[role] = pickByPatterns(
      models,
      PRESET_ORDER[preset][role],
      fallback[role]
    );
  }
  return resolved;
}

async function promptForChoice(
  logger: ILogger,
  proc: IProcess,
  promptFn: ((question: string) => Promise<string>) | undefined,
  question: string,
  fallback: string,
  models: string[]
): Promise<string> {
  const answer = (await promptUser(question, promptFn, proc)).trim();
  if (answer.length === 0) return fallback;

  const index = Number.parseInt(answer, 10);
  if (!Number.isNaN(index) && index >= 1 && index <= models.length) {
    return models[index - 1];
  }

  if (models.includes(answer)) return answer;

  logger.warn(`Invalid selection "${answer}". Keeping "${fallback}".`);
  return fallback;
}

async function pickModelForRole(
  role: ModelRole,
  models: string[],
  fallback: string,
  logger: ILogger,
  proc: IProcess,
  promptFn?: (question: string) => Promise<string>
): Promise<string> {
  logger.raw('');
  logger.infoPlain(`? Model for [${role}] — ${ROLE_DESCRIPTIONS[role]}:`);
  models.forEach((model, index) => {
    logger.raw(`  ${index + 1}. ${model}`);
  });
  return promptForChoice(
    logger,
    proc,
    promptFn,
    `  Select model number (Enter to keep "${fallback}"): `,
    fallback,
    models
  );
}

export async function selectModelsForInit(options: {
  preset?: ModelPreset;
  custom?: boolean;
  prompt?: (question: string) => Promise<string>;
  logger: ILogger;
  proc: IProcess;
  liveModels: string[] | null;
  fallbackModels: SpeciConfig['copilot']['models'];
}): Promise<SpeciConfig['copilot']['models']> {
  const {
    preset,
    custom,
    prompt,
    logger,
    proc,
    liveModels,
    fallbackModels,
  } = options;

  if (!liveModels || liveModels.length === 0) {
    logger.warn(
      'Could not fetch live Copilot models. Continuing with default model settings.'
    );
    return fallbackModels;
  }

  if (preset) {
    return applyPresetModels(preset, liveModels, fallbackModels);
  }

  const interactive = isInteractiveTerminal(proc, prompt);

  if (!custom && !interactive) {
    logger.warn(
      'Non-interactive terminal detected. Applying Balanced model preset.'
    );
    return applyPresetModels('balanced', liveModels, fallbackModels);
  }

  let mode: 'best' | 'balanced' | 'budget' | 'custom';

  if (custom) {
    mode = 'custom';
  } else {
    logger.infoPlain('? Choose a model preset:');
    logger.raw('  1. Best-in-Class');
    logger.raw('  2. Balanced');
    logger.raw('  3. Budget-Friendly');
    logger.raw('  4. Custom');
    const answer = (
      await promptUser(
        '  Select 1-4 (default 2): ',
        prompt,
        proc
      )
    ).trim();
    mode =
      answer === '1'
        ? 'best'
        : answer === '3'
          ? 'budget'
          : answer === '4'
            ? 'custom'
            : 'balanced';
  }

  if (mode !== 'custom') {
    return applyPresetModels(mode, liveModels, fallbackModels);
  }

  const selected = { ...fallbackModels };
  for (const role of MODEL_ROLES) {
    selected[role] = await pickModelForRole(
      role,
      liveModels,
      selected[role],
      logger,
      proc,
      prompt
    );
  }
  return selected;
}

function updateModelsInConfigFile(
  fs: IFileSystem,
  configPath: string,
  models: SpeciConfig['copilot']['models']
): void {
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as SpeciConfig;
  parsed.copilot.models = { ...models };
  fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

export async function remediateInvalidModels(options: {
  configPath: string;
  config: SpeciConfig;
  fs: IFileSystem;
  proc: IProcess;
  logger: ILogger;
  liveModels: string[] | null;
  prompt?: (question: string) => Promise<string>;
}): Promise<SpeciConfig['copilot']['models'] | null> {
  const { configPath, config, fs, proc, logger, liveModels, prompt } = options;
  if (!liveModels || liveModels.length === 0) {
    logger.warn(
      'Could not validate configured Copilot models against live availability.'
    );
    return null;
  }

  const invalidRoles = MODEL_ROLES.filter(
    (role) => !liveModels.includes(config.copilot.models[role])
  );
  if (invalidRoles.length === 0) return null;

  logger.raw('');
  logger.warnPlain('⚠ Model validation failed');
  for (const role of invalidRoles) {
    logger.warnPlain(
      `  ${role.padEnd(8)}→ "${config.copilot.models[role]}" is no longer available`
    );
  }
  logger.raw('');
  logger.infoPlain('Run `speci init --reconfigure-models` to fix, or choose now:');
  logger.infoPlain('  1. Pick replacements interactively');
  logger.infoPlain(
    '  2. Apply the Balanced preset to all affected roles'
  );
  logger.infoPlain(
    '  3. Skip and continue anyway (may cause runtime errors)'
  );

  if (!isInteractiveTerminal(proc, prompt)) {
    logger.warn('Non-interactive terminal detected; skipping remediation.');
    return null;
  }

  const answer = (
    await promptUser('  Select 1-3 (default 1): ', prompt, proc)
  ).trim();
  const action = answer === '2' ? '2' : answer === '3' ? '3' : '1';
  if (action === '3') {
    logger.warn('Continuing with invalid model configuration.');
    return null;
  }

  const nextModels = { ...config.copilot.models };

  if (action === '2') {
    const balanced = applyPresetModels('balanced', liveModels, nextModels);
    for (const role of invalidRoles) {
      nextModels[role] = balanced[role];
    }
  } else {
    for (const role of invalidRoles) {
      nextModels[role] = await pickModelForRole(
        role,
        liveModels,
        nextModels[role],
        logger,
        proc,
        prompt
      );
    }
  }

  updateModelsInConfigFile(fs, configPath, nextModels);
  logger.success('Updated models in speci.config.json');
  return nextModels;
}
