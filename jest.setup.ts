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

// Official in-memory AsyncStorage mock — persistence code works without a
// device and every test file starts from empty storage.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});
