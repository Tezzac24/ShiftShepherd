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
} as const;

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
