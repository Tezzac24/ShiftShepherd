/**
 * Safe local persistence for demo/mock state (AsyncStorage).
 *
 * Every payload is wrapped in a version envelope. If the stored version does
 * not match PERSISTENCE_VERSION, or the JSON is corrupt, or a validator
 * rejects the shape, the caller gets null and falls back to the original mock
 * seed data — persisted demo state must never be able to break the app.
 *
 * Bump PERSISTENCE_VERSION whenever the persisted data shape changes; old
 * data is then discarded (a reset, not a migration — fine for demo state).
 *
 * Never store secrets here. Supabase session tokens are handled by the
 * Supabase client's own storage, not by these helpers.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PERSISTENCE_VERSION = 1;

export const STORAGE_KEYS = {
  appData: 'shift-shepherd/app-data',
  demoUser: 'shift-shepherd/demo-user',
  pushRegistration: 'shift-shepherd/push-registration',
} as const;

export type PushRegistrationPlatform = 'ios' | 'android' | 'web';

/** The one device token registration this installation can reconcile. */
export interface PersistedPushRegistration {
  authUserId: string;
  profileId: string;
  token: string;
  platform: PushRegistrationPlatform;
  registeredAt: string;
  lifecycleGeneration: number;
}

export type PushRegistrationPersistenceOperation = 'read' | 'write' | 'clear';

/** Sanitized push-only storage failure; never includes stored values or tokens. */
export class PushRegistrationPersistenceError extends Error {
  readonly code: string;

  constructor(public readonly operation: PushRegistrationPersistenceOperation) {
    super(
      operation === 'read'
        ? "We couldn't check saved notification setup on this device. Please try again."
        : operation === 'write'
          ? "We couldn't save notification setup on this device. Please try again."
          : "We couldn't clear notification setup on this device.",
    );
    this.name = 'PushRegistrationPersistenceError';
    this.code = `PUSH_REGISTRATION_STORAGE_${operation.toUpperCase()}_FAILED`;
  }
}

interface Envelope<T> {
  version: number;
  data: T;
}

/**
 * Load a persisted value. Returns null (never throws) when missing, corrupt,
 * from an old version, or rejected by `isValid`.
 */
export async function loadPersisted<T>(
  key: string,
  isValid?: (data: unknown) => boolean,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (envelope?.version !== PERSISTENCE_VERSION) {
      console.log(`[persistence] discarding "${key}": version ${envelope?.version} ≠ ${PERSISTENCE_VERSION}`);
      await AsyncStorage.removeItem(key);
      return null;
    }
    if (isValid && !isValid(envelope.data)) {
      console.warn(`[persistence] discarding "${key}": failed shape validation`);
      await AsyncStorage.removeItem(key);
      return null;
    }
    return envelope.data;
  } catch (error) {
    console.warn(`[persistence] failed to load "${key}", falling back to defaults`, error);
    return null;
  }
}

/** Persist a value inside a version envelope. Failures are logged, not thrown. */
export async function savePersisted<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: Envelope<T> = { version: PERSISTENCE_VERSION, data };
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
  } catch (error) {
    console.warn(`[persistence] failed to save "${key}"`, error);
  }
}

/** Remove a persisted value (e.g. on demo-data reset or sign-out). */
export async function clearPersisted(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn(`[persistence] failed to clear "${key}"`, error);
  }
}

export function isPersistedPushRegistration(
  value: unknown,
): value is PersistedPushRegistration {
  if (!value || typeof value !== 'object') return false;
  const registration = value as Partial<PersistedPushRegistration>;
  return (
    typeof registration.authUserId === 'string' &&
    registration.authUserId.length > 0 &&
    typeof registration.profileId === 'string' &&
    registration.profileId.length > 0 &&
    typeof registration.token === 'string' &&
    registration.token.length > 0 &&
    registration.token.length <= 512 &&
    (registration.platform === 'ios' ||
      registration.platform === 'android' ||
      registration.platform === 'web') &&
    typeof registration.registeredAt === 'string' &&
    registration.registeredAt.length > 0 &&
    !Number.isNaN(Date.parse(registration.registeredAt)) &&
    typeof registration.lifecycleGeneration === 'number' &&
    Number.isSafeInteger(registration.lifecycleGeneration) &&
    registration.lifecycleGeneration >= 0
  );
}

export function pushRegistrationMatchesScope(
  registration: PersistedPushRegistration,
  authUserId: string,
  profileId: string,
): boolean {
  return registration.authUserId === authUserId && registration.profileId === profileId;
}

function pushEnvelope(registration: PersistedPushRegistration): string {
  return JSON.stringify({ version: PERSISTENCE_VERSION, data: registration });
}

function registrationsMatch(
  first: PersistedPushRegistration,
  second: PersistedPushRegistration,
): boolean {
  return (
    first.authUserId === second.authUserId &&
    first.profileId === second.profileId &&
    first.token === second.token &&
    first.platform === second.platform &&
    first.registeredAt === second.registeredAt &&
    first.lifecycleGeneration === second.lifecycleGeneration
  );
}

function discardInvalidPushRegistration(reason: 'version' | 'shape' | 'json') {
  console.warn('[persistence] discarding push registration', { reason });
  // Invalid data is still an unregistered validation result. Its best-effort
  // cleanup is detached so a broken remove operation cannot block hydration.
  void AsyncStorage.removeItem(STORAGE_KEYS.pushRegistration).catch(() => {
    console.warn('[persistence] failed to discard invalid push registration');
  });
}

/**
 * Load a valid push registration. Missing/invalid data is unregistered, while
 * an AsyncStorage transport failure is observable to lifecycle callers.
 */
export async function loadPushRegistration(): Promise<PersistedPushRegistration | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEYS.pushRegistration);
  } catch {
    console.warn('[persistence] failed to read push registration');
    throw new PushRegistrationPersistenceError('read');
  }
  if (!raw) return null;

  let envelope: Envelope<unknown>;
  try {
    envelope = JSON.parse(raw) as Envelope<unknown>;
  } catch {
    discardInvalidPushRegistration('json');
    return null;
  }
  if (envelope?.version !== PERSISTENCE_VERSION) {
    discardInvalidPushRegistration('version');
    return null;
  }
  if (!isPersistedPushRegistration(envelope.data)) {
    discardInvalidPushRegistration('shape');
    return null;
  }
  return envelope.data;
}

/** Save only after AsyncStorage confirms the versioned record was written. */
export async function savePushRegistration(
  registration: PersistedPushRegistration,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.pushRegistration,
      pushEnvelope(registration),
    );
  } catch {
    console.warn('[persistence] failed to save push registration');
    throw new PushRegistrationPersistenceError('write');
  }
}

/** Idempotently clear only after AsyncStorage confirms removal. */
export async function clearPushRegistration(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.pushRegistration);
  } catch {
    console.warn('[persistence] failed to clear push registration');
    throw new PushRegistrationPersistenceError('clear');
  }
}

/**
 * Compensate a stale completed write without deleting a newer record. The
 * lifecycle coordinator re-verifies/re-publishes its newest desired record
 * after this compare-and-clear to close an interleaving between read/remove.
 */
export async function clearPushRegistrationIfMatches(
  expected: PersistedPushRegistration,
): Promise<boolean> {
  const current = await loadPushRegistration();
  if (!current || !registrationsMatch(current, expected)) return false;
  await clearPushRegistration();
  return true;
}
