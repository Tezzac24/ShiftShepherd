/**
 * Process-local push lifecycle, persistence fencing, and sign-out coordination.
 *
 * AsyncStorage promises cannot be cancelled. Scope generations prevent stale
 * work from publishing UI/snapshot state, while desired-record repair makes a
 * late completed write converge to the newest account/profile record.
 */
import {
  clearPushRegistration,
  clearPushRegistrationIfMatches,
  loadPushRegistration,
  PersistedPushRegistration,
  savePushRegistration,
} from '../storage/persistence';

export const PUSH_CLEANUP_STEP_DEADLINE_MS = 2_000;

export interface PushRegistrationScope {
  authUserId: string;
  profileId: string | null;
  generation: number;
}

export type PushCleanupStepResult<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; error: unknown }
  | { status: 'timedOut' };

interface SignOutInvalidation {
  snapshot: PersistedPushRegistration | null;
  quiesced: Promise<void>;
}

const pausedAuthUsers = new Set<string>();
const activeCounts = new Map<string, number>();
const idleWaiters = new Map<string, Set<() => void>>();

let currentGeneration = 0;
let currentScope: PushRegistrationScope | null = null;
let durableSnapshot: PersistedPushRegistration | null = null;
let desiredRevision = 0;
let desiredRegistration: PersistedPushRegistration | null = null;

function sameRecord(
  first: PersistedPushRegistration | null,
  second: PersistedPushRegistration | null,
): boolean {
  if (!first || !second) return first === second;
  return (
    first.authUserId === second.authUserId &&
    first.profileId === second.profileId &&
    first.token === second.token &&
    first.platform === second.platform &&
    first.registeredAt === second.registeredAt &&
    first.lifecycleGeneration === second.lifecycleGeneration
  );
}

function setDesiredRegistration(
  registration: PersistedPushRegistration | null,
): number {
  desiredRevision += 1;
  desiredRegistration = registration;
  return desiredRevision;
}

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

function waitForIdle(authUserId: string): Promise<void> {
  if (!activeCounts.has(authUserId)) return Promise.resolve();
  return new Promise((resolve) => {
    const waiters = idleWaiters.get(authUserId) ?? new Set<() => void>();
    waiters.add(resolve);
    idleWaiters.set(authUserId, waiters);
  });
}

function advanceScope(
  authUserId: string | null,
  profileId: string | null,
): PushRegistrationScope | null {
  const previousAuthUserId = currentScope?.authUserId ?? null;
  currentGeneration += 1;
  currentScope = authUserId
    ? { authUserId, profileId, generation: currentGeneration }
    : null;

  if (!authUserId || previousAuthUserId !== authUserId || !profileId) {
    durableSnapshot = null;
    setDesiredRegistration(null);
  } else {
    // A same-account profile change keeps the last durable record available
    // for sign-out and as the repair target until the rebind is durably saved.
    setDesiredRegistration(durableSnapshot);
  }
  return currentScope;
}

/**
 * Synchronize the provider's Auth scope. `undefined` means the active profile
 * is still resolving; account replacement is still invalidated immediately.
 */
export function synchronizePushRegistrationScope(
  authUserId: string | null,
  profileId: string | null | undefined,
): PushRegistrationScope | null {
  if (!authUserId) {
    if (currentScope) return advanceScope(null, null);
    return null;
  }

  if (currentScope?.authUserId !== authUserId) {
    return advanceScope(authUserId, profileId ?? null);
  }
  if (profileId === undefined) return currentScope;
  if (currentScope.profileId !== profileId) return advanceScope(authUserId, profileId);
  return currentScope;
}

export function isPushRegistrationScopeCurrent(scope: PushRegistrationScope): boolean {
  return (
    !pausedAuthUsers.has(scope.authUserId) &&
    currentScope?.authUserId === scope.authUserId &&
    currentScope.profileId === scope.profileId &&
    currentScope.generation === scope.generation
  );
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

/** Remember a validated record read durably for the current Auth account. */
export function rememberDurablePushRegistration(
  scope: PushRegistrationScope,
  registration: PersistedPushRegistration,
): boolean {
  if (
    !isPushRegistrationScopeCurrent(scope) ||
    registration.authUserId !== scope.authUserId
  ) {
    return false;
  }
  durableSnapshot = registration;
  setDesiredRegistration(registration);
  return true;
}

/** Internal lifecycle read; callers must never expose or log the token. */
export function getDurablePushRegistrationSnapshot(
  scope: PushRegistrationScope,
): PersistedPushRegistration | null {
  return isPushRegistrationScopeCurrent(scope) &&
    durableSnapshot?.authUserId === scope.authUserId
    ? { ...durableSnapshot }
    : null;
}

/** Immediately stop trusting the current scope's snapshot/desired record. */
export function invalidateDurablePushRegistration(
  scope: PushRegistrationScope,
): boolean {
  if (!isPushRegistrationScopeCurrent(scope)) return false;
  durableSnapshot = null;
  setDesiredRegistration(null);
  return true;
}

async function repairDesiredRegistration(
  attempted?: PersistedPushRegistration,
): Promise<void> {
  if (attempted) await clearPushRegistrationIfMatches(attempted);

  // Every completed repair re-checks the desired revision. If a newer
  // account/profile mutation interleaved, loop and publish/verify that target.
  while (true) {
    const revision = desiredRevision;
    const target = desiredRegistration;
    if (!target) return;

    await savePushRegistration(target);
    const stored = await loadPushRegistration();
    if (revision !== desiredRevision || !sameRecord(target, desiredRegistration)) {
      continue;
    }
    if (!sameRecord(stored, target)) continue;
    return;
  }
}

async function repairWithoutMaskingOriginal(
  attempted: PersistedPushRegistration,
): Promise<void> {
  try {
    await repairDesiredRegistration(attempted);
  } catch (error) {
    console.warn('[pushRegistration] stale persistence repair failed', {
      code: (error as { code?: unknown })?.code,
    });
  }
}

/**
 * Durably save only for a current scope. A stale/failed completion repairs the
 * newest desired record and never updates the in-memory durable snapshot.
 */
export async function persistDurablePushRegistration(
  scope: PushRegistrationScope,
  registration: PersistedPushRegistration,
): Promise<boolean> {
  if (!isPushRegistrationScopeCurrent(scope)) return false;

  const previousSnapshot = durableSnapshot;
  const revision = setDesiredRegistration(registration);
  try {
    await savePushRegistration(registration);
    if (
      !isPushRegistrationScopeCurrent(scope) ||
      revision !== desiredRevision ||
      !sameRecord(desiredRegistration, registration)
    ) {
      await repairDesiredRegistration(registration);
      return false;
    }
    durableSnapshot = registration;
    return true;
  } catch (error) {
    if (revision === desiredRevision) setDesiredRegistration(previousSnapshot);
    await repairWithoutMaskingOriginal(registration);
    throw error;
  }
}

/**
 * Clear the current lifecycle's durable state. A stale completed removal
 * repairs a newer desired record rather than deleting it.
 */
export async function clearDurablePushRegistration(
  scope: PushRegistrationScope,
): Promise<boolean> {
  if (!isPushRegistrationScopeCurrent(scope)) return false;
  durableSnapshot = null;
  const revision = setDesiredRegistration(null);
  try {
    await clearPushRegistration();
    if (!isPushRegistrationScopeCurrent(scope) || revision !== desiredRevision) {
      await repairDesiredRegistration();
      return false;
    }
    return true;
  } catch (error) {
    if (revision !== desiredRevision) {
      try {
        await repairDesiredRegistration();
      } catch (repairError) {
        console.warn('[pushRegistration] stale persistence repair failed', {
          code: (repairError as { code?: unknown })?.code,
        });
      }
    }
    throw error;
  }
}

/**
 * Immediately fence old work, capture the matching durable snapshot, and
 * return a quiescence promise which Auth must await only through a deadline.
 */
export function beginPushRegistrationSignOut(
  authUserId: string,
): SignOutInvalidation {
  pausedAuthUsers.add(authUserId);
  const snapshot =
    durableSnapshot?.authUserId === authUserId ? { ...durableSnapshot } : null;
  advanceScope(null, null);
  return { snapshot, quiesced: waitForIdle(authUserId) };
}

/** Release the pause for a future fresh session; generations stay invalid. */
export function finishPushRegistrationSignOut(authUserId: string): void {
  pausedAuthUsers.delete(authUserId);
}

/**
 * Bound one cleanup dependency and attach rejection handling immediately so a
 * promise that rejects after timeout cannot become unhandled.
 */
export function awaitPushCleanupStep<T>(
  step: 'quiesce' | 'read' | 'revoke' | 'clear',
  promise: Promise<T>,
): Promise<PushCleanupStepResult<T>> {
  const guarded = promise.then<PushCleanupStepResult<T>, PushCleanupStepResult<T>>(
    (value) => ({ status: 'fulfilled', value }),
    (error: unknown) => ({ status: 'rejected', error }),
  );

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[auth] push cleanup deadline reached', { step });
      resolve({ status: 'timedOut' });
    }, PUSH_CLEANUP_STEP_DEADLINE_MS);

    void guarded.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

/** Test isolation for this process-global coordinator. */
export function resetPushRegistrationOperationsForTests(): void {
  pausedAuthUsers.clear();
  activeCounts.clear();
  idleWaiters.clear();
  currentGeneration = 0;
  currentScope = null;
  durableSnapshot = null;
  desiredRevision = 0;
  desiredRegistration = null;
}
