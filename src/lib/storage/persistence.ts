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
    !Number.isNaN(Date.parse(registration.registeredAt))
  );
}

export function pushRegistrationMatchesScope(
  registration: PersistedPushRegistration,
  authUserId: string,
  profileId: string,
): boolean {
  return registration.authUserId === authUserId && registration.profileId === profileId;
}

/** Load the validated device registration, or null on any storage problem. */
export function loadPushRegistration(): Promise<PersistedPushRegistration | null> {
  return loadPersisted<PersistedPushRegistration>(
    STORAGE_KEYS.pushRegistration,
    isPersistedPushRegistration,
  );
}

/** Save the device registration through the existing versioned envelope. */
export function savePushRegistration(registration: PersistedPushRegistration): Promise<void> {
  return savePersisted(STORAGE_KEYS.pushRegistration, registration);
}

/** Idempotently clear this installation's device registration. */
export function clearPushRegistration(): Promise<void> {
  return clearPersisted(STORAGE_KEYS.pushRegistration);
}
