/**
 * Signal Handling Module
 *
 * Provides robust signal handling for graceful shutdown when users interrupt
 * long-running operations with Ctrl+C (SIGINT) or when the process receives
 * SIGTERM. Includes cleanup registry for proper resource cleanup.
 */

/**
 * Cleanup function type - sync or async
 */
export interface CleanupFn {
  (): Promise<void> | void;
}

/**
 * Internal state
 */
const cleanupRegistry: CleanupFn[] = [];
let isCleaningUp = false;
let signalReceived = false;

/**
 * Register a cleanup function to be called on exit
 *
 * Cleanup functions are called in reverse registration order (LIFO).
 *
 * @param fn - Cleanup function (sync or async)
 */
export function registerCleanup(fn: CleanupFn): void {
  cleanupRegistry.push(fn);
}

/**
 * Remove a cleanup function from the registry
 *
 * @param fn - Cleanup function to remove
 */
export function unregisterCleanup(fn: CleanupFn): void {
  const index = cleanupRegistry.indexOf(fn);
  if (index !== -1) {
    cleanupRegistry.splice(index, 1);
  }
}

/**
 * Cleanup timeout configuration
 */
const CLEANUP_TIMEOUT_MS = 5000;

/**
 * Execute all registered cleanup functions in reverse order
 *
 * Safe to call multiple times - will only execute once.
 * Continues cleanup even if individual functions throw errors.
 * Includes 5-second timeout to prevent hanging on slow cleanup handlers.
 */
export async function runCleanup(): Promise<void> {
  if (isCleaningUp) return;
  isCleaningUp = true;

  // Create timeout promise
  const timeoutPromise = new Promise<void>((_, reject) =>
    setTimeout(
      () => reject(new Error('Cleanup timeout after 5s')),
      CLEANUP_TIMEOUT_MS
    )
  );

  // Create cleanup promise
  const cleanupPromise = (async () => {
    // Run in reverse order (last registered = first cleaned)
    for (let i = cleanupRegistry.length - 1; i >= 0; i--) {
      try {
        await cleanupRegistry[i]();
      } catch (err) {
        // Log but continue cleanup
        console.error('Cleanup error:', err);
      }
    }

    // Clear registry after cleanup
    cleanupRegistry.length = 0;
  })();

  // Race cleanup against timeout
  try {
    await Promise.race([cleanupPromise, timeoutPromise]);
  } catch (error) {
    console.error('Cleanup did not complete in time:', error);
    // Continue with exit anyway
  }
}

/**
 * Reset cleanup state (for testing)
 */
export function resetCleanupState(): void {
  cleanupRegistry.length = 0;
  isCleaningUp = false;
  signalReceived = false;
}

/**
 * Handle SIGINT (Ctrl+C)
 *
 * First Ctrl+C: graceful shutdown with cleanup
 * Second Ctrl+C: immediate force exit
 */
function handleSigint(): void {
  if (signalReceived) {
    // Second Ctrl+C - force exit
    console.error('\nForce exiting...');
    process.exit(130);
  }

  signalReceived = true;
  console.error('\nInterrupted. Cleaning up...');

  runCleanup()
    .then(() => process.exit(130))
    .catch(() => process.exit(130));
}

/**
 * Handle SIGTERM
 *
 * Graceful shutdown with same cleanup as SIGINT.
 */
function handleSigterm(): void {
  console.error('\nReceived SIGTERM. Shutting down gracefully...');

  runCleanup()
    .then(() => process.exit(143))
    .catch(() => process.exit(143));
}

/**
 * Install signal handlers
 *
 * Registers handlers for SIGINT and SIGTERM.
 * On Windows, also handles SIGHUP for console close events.
 */
export function installSignalHandlers(): void {
  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);

  // Windows doesn't support SIGTERM well
  if (process.platform === 'win32') {
    // Handle Windows console close events
    process.on('SIGHUP', handleSigterm);
  }
}

/**
 * Remove signal handlers
 *
 * Cleans up all registered signal handlers and resets state.
 * Important to call this after command completion to prevent
 * memory leaks in test suites.
 */
export function removeSignalHandlers(): void {
  process.off('SIGINT', handleSigint);
  process.off('SIGTERM', handleSigterm);
  if (process.platform === 'win32') {
    process.off('SIGHUP', handleSigterm);
  }
  signalReceived = false;
  isCleaningUp = false;
}
