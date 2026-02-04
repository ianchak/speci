/**
 * Process management utilities
 * Provides child process tracking, cleanup, and zombie prevention
 */

import type { ChildProcess } from 'node:child_process';

const childRegistry = new Set<ChildProcess>();

const KILL_TIMEOUT_MS = 5000;

/**
 * Track a child process for cleanup
 * @param child - Child process to track
 */
export function trackChild(child: ChildProcess): void {
  if (!child || !child.pid) return;

  childRegistry.add(child);

  // Auto-remove when process exits
  child.once('exit', () => {
    childRegistry.delete(child);
  });

  child.once('error', () => {
    childRegistry.delete(child);
  });
}

/**
 * Clean up all tracked child processes
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupChildren(): Promise<void> {
  if (childRegistry.size === 0) return;

  const children = Array.from(childRegistry);
  const killPromises = children.map((child) => killChild(child));

  await Promise.allSettled(killPromises);

  childRegistry.clear();
}

/**
 * Kill a single child process gracefully
 */
async function killChild(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!child.pid || child.killed) {
      resolve();
      return;
    }

    // Set up exit handler
    const onExit = () => {
      clearTimeout(forceKillTimer);
      resolve();
    };

    child.once('exit', onExit);

    // Try graceful termination first
    try {
      child.kill('SIGTERM');
    } catch {
      resolve();
      return;
    }

    // Force kill after timeout
    const forceKillTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Process may have already exited
      }
      child.off('exit', onExit);
      resolve();
    }, KILL_TIMEOUT_MS);
  });
}

/**
 * Set up zombie process prevention (Unix only)
 */
export function preventZombies(): void {
  if (process.platform === 'win32') {
    // Not needed on Windows
    return;
  }

  // Set up SIGCHLD handler to reap zombies
  const handler = () => {
    // Node.js handles child process reaping internally,
    // but this ensures we're registered for the signal
  };

  // Only add handler once
  if (process.listenerCount('SIGCHLD') === 0) {
    process.on('SIGCHLD', handler);
  }
}

/**
 * Get count of tracked children (for testing/debugging)
 */
export function getTrackedChildCount(): number {
  return childRegistry.size;
}

/**
 * Kill all children immediately without waiting
 */
export function killAllChildren(): void {
  for (const child of childRegistry) {
    try {
      if (child.pid && !child.killed) {
        child.kill('SIGKILL');
      }
    } catch {
      // Ignore errors during force kill
    }
  }
  childRegistry.clear();
}
