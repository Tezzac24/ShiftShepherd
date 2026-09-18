/**
 * Global Jest setup (runs before each test file's modules load).
 *
 * Tests must be deterministic and offline: no real Supabase client, no
 * network, no device push APIs. Anything Supabase-shaped is mocked per test
 * file via jest.mock('../../client') etc. — this file only provides the
 * baseline environment.
 */

// Jest never loads .env (only the Expo CLI does), but make it impossible for
// ambient shell variables to configure a real Supabase client during tests —
// src/lib/supabase/client.ts must always see demo mode here.
delete process.env.EXPO_PUBLIC_SUPABASE_URL;
delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Expo's runtime installs `fetch` as a lazy global getter. Jest's per-file
// teardown reads every global, so an unread getter would first load Expo's
// fetch module after the file's console is frozen ("Cannot log after tests
// are done"), failing the run. Resolve it now, while the environment is live.
void globalThis.fetch;

// Official in-memory AsyncStorage mock — persistence code works without a
// device and every test file starts from empty storage.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// In-memory SecureStore. It enforces the same key rule as the native module
// (expo-secure-store's ensureValidKey: non-empty, and only letters, numbers,
// ".", "-" and "_"), because a mock that accepted any key let an invalid
// storage key reach the device and break sign-out.
jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  const ensureValidKey = (key: string) => {
    if (typeof key !== 'string' || !/^[\w.-]+$/.test(key)) {
      throw new Error(
        'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".',
      );
    }
  };
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key: string) => {
      ensureValidKey(key);
      return values.get(key) ?? null;
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      ensureValidKey(key);
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      ensureValidKey(key);
      values.delete(key);
    }),
  };
});
