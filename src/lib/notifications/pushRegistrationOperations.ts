/**
 * Process-local coordination between lifecycle writes and Auth sign-out.
 *
 * Sign-out pauses one Auth user's new work and waits for its active operation
 * before loading/revoking the persisted token. This prevents an already
 * in-flight rebind from recreating the server row after sign-out cleanup.
 */
const pausedAuthUsers = new Set<string>();
const activeCounts = new Map<string, number>();
const idleWaiters = new Map<string, Set<() => void>>();

function finishOperation(authUserId: string): void {
  const remaining = (activeCounts.get(authUserId) ?? 1) - 1;
  if (remaining > 0) {
    activeCounts.set(authUserId, remaining);
    return;
  }

  activeCounts.delete(authUserId);
  const waiters = idleWaiters.get(authUserId);
  idleWaiters.delete(authUserId);
  waiters?.forEach((resolve) => resolve());
}

/** Run unless sign-out has paused this Auth user's registration work. */
export async function runPushRegistrationOperation<T>(
  authUserId: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (pausedAuthUsers.has(authUserId)) return undefined;
  activeCounts.set(authUserId, (activeCounts.get(authUserId) ?? 0) + 1);
  try {
    return await operation();
  } finally {
    finishOperation(authUserId);
  }
}

/** Block new work and resolve once this Auth user's active write is finished. */
export function pausePushRegistrationOperations(authUserId: string): Promise<void> {
  pausedAuthUsers.add(authUserId);
  if (!activeCounts.has(authUserId)) return Promise.resolve();
  return new Promise((resolve) => {
    const waiters = idleWaiters.get(authUserId) ?? new Set<() => void>();
    waiters.add(resolve);
    idleWaiters.set(authUserId, waiters);
  });
}

/** Release the process-local pause after Auth sign-out has finished. */
export function resumePushRegistrationOperations(authUserId: string): void {
  pausedAuthUsers.delete(authUserId);
}
