import { execSync as nodeExecSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { MESSAGES } from '@/constants.js';
import type { ILogger } from '@/interfaces.js';

/** Injectable exec function type for testability. */
export type ExecSyncFn = (command: string) => void;

/** Seconds to wait before initiating OS sleep. */
export const SLEEP_DELAY_SECONDS = 5;

const SLEEP_COMMANDS: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
  darwin: 'pmset sleepnow',
  linux: 'systemctl suspend',
};

const defaultExecFn: ExecSyncFn = (command) => {
  nodeExecSync(command, { stdio: 'ignore', env: {} });
};

/**
 * Gets the platform-specific sleep command.
 *
 * @param platform - Node.js platform value
 * @returns Sleep command string for supported platforms, otherwise null
 */
export function getSleepCommand(platform: NodeJS.Platform): string | null {
  return SLEEP_COMMANDS[platform] ?? null;
}

/**
 * Waits for a short countdown and then dispatches the OS sleep command.
 *
 * @param platform - Node.js platform value used to select sleep command
 * @param logger - Logger used for user-facing sleep messages
 * @param execFn - Optional injectable exec function
 */
export async function sleepAfterCommand(
  platform: NodeJS.Platform,
  logger: ILogger,
  execFn: ExecSyncFn = defaultExecFn
): Promise<void> {
  const sleepCommand = getSleepCommand(platform);
  if (!sleepCommand) {
    logger.warn(MESSAGES.SLEEP_UNSUPPORTED.replace('{platform}', platform));
    return;
  }

  logger.info(
    MESSAGES.SLEEP_COUNTDOWN.replace('{seconds}', String(SLEEP_DELAY_SECONDS))
  );

  const controller = new AbortController();
  const sigintListener = (): void => {
    controller.abort();
  };
  process.on('SIGINT', sigintListener);

  try {
    await delay(SLEEP_DELAY_SECONDS * 1000, undefined, {
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    logger.warn(
      MESSAGES.SLEEP_FAILED.replace(
        '{error}',
        error instanceof Error ? error.message : String(error)
      )
    );
    return;
  } finally {
    process.removeListener('SIGINT', sigintListener);
  }

  try {
    execFn(sleepCommand);
    logger.info(MESSAGES.SLEEP_SUCCESS);
  } catch (error) {
    logger.warn(
      MESSAGES.SLEEP_FAILED.replace(
        '{error}',
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}
