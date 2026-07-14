import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPushRegistration,
  clearPushRegistrationIfMatches,
  isPersistedPushRegistration,
  loadPushRegistration,
  PERSISTENCE_VERSION,
  PersistedPushRegistration,
  PushRegistrationPersistenceError,
  pushRegistrationMatchesScope,
  savePushRegistration,
  STORAGE_KEYS,
} from '../persistence';

const REGISTRATION: PersistedPushRegistration = {
  authUserId: 'auth-account-a',
  profileId: 'profile-organisation-a',
  token: 'ExponentPushToken[persisted-test-token]',
  platform: 'ios',
  registeredAt: '2026-07-14T12:00:00.000Z',
  lifecycleGeneration: 1,
};

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

describe('persisted push registration', () => {
  it('round-trips a valid versioned record', async () => {
    await savePushRegistration(REGISTRATION);
    await expect(loadPushRegistration()).resolves.toEqual(REGISTRATION);
  });

  it('treats missing state as unregistered', async () => {
    await expect(loadPushRegistration()).resolves.toBeNull();
  });

  it('discards malformed JSON safely', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.pushRegistration, '{not-json');
    await expect(loadPushRegistration()).resolves.toBeNull();
  });

  it('discards a version-incompatible envelope', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.pushRegistration,
      JSON.stringify({ version: PERSISTENCE_VERSION + 1, data: REGISTRATION }),
    );
    await expect(loadPushRegistration()).resolves.toBeNull();
    await expect(AsyncStorage.getItem(STORAGE_KEYS.pushRegistration)).resolves.toBeNull();
  });

  it('rejects a persisted shape without authUserId', async () => {
    const missingAccount = { ...REGISTRATION, authUserId: undefined };
    expect(isPersistedPushRegistration(missingAccount)).toBe(false);
    await AsyncStorage.setItem(
      STORAGE_KEYS.pushRegistration,
      JSON.stringify({ version: PERSISTENCE_VERSION, data: missingAccount }),
    );
    await expect(loadPushRegistration()).resolves.toBeNull();
  });

  it('distinguishes a different account and a different active profile', () => {
    expect(
      pushRegistrationMatchesScope(REGISTRATION, 'auth-account-b', REGISTRATION.profileId),
    ).toBe(false);
    expect(
      pushRegistrationMatchesScope(REGISTRATION, REGISTRATION.authUserId, 'profile-b'),
    ).toBe(false);
    expect(
      pushRegistrationMatchesScope(
        REGISTRATION,
        REGISTRATION.authUserId,
        REGISTRATION.profileId,
      ),
    ).toBe(true);
  });

  it('replaces the stored token and profile when a registration changes', async () => {
    await savePushRegistration(REGISTRATION);
    const changed: PersistedPushRegistration = {
      ...REGISTRATION,
      profileId: 'profile-organisation-b',
      token: 'ExponentPushToken[rotated-test-token]',
      platform: 'android',
      registeredAt: '2026-07-14T13:00:00.000Z',
    };
    await savePushRegistration(changed);
    await expect(loadPushRegistration()).resolves.toEqual(changed);
  });

  it('clears repeatedly without failing', async () => {
    await savePushRegistration(REGISTRATION);
    await expect(clearPushRegistration()).resolves.toBeUndefined();
    await expect(clearPushRegistration()).resolves.toBeUndefined();
    await expect(loadPushRegistration()).resolves.toBeNull();
  });

  it('distinguishes a storage read failure from missing state', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(loadPushRegistration()).rejects.toMatchObject({
      name: 'PushRegistrationPersistenceError',
      operation: 'read',
      code: 'PUSH_REGISTRATION_STORAGE_READ_FAILED',
    });
  });

  it('reports storage writing and clearing failures through the push-only contract', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(savePushRegistration(REGISTRATION)).rejects.toBeInstanceOf(
      PushRegistrationPersistenceError,
    );
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('storage locked'));
    await expect(clearPushRegistration()).rejects.toMatchObject({ operation: 'clear' });
  });

  it('conditionally clears only the exact stale record', async () => {
    await savePushRegistration(REGISTRATION);
    const newer = { ...REGISTRATION, profileId: 'profile-newer', lifecycleGeneration: 2 };
    await expect(clearPushRegistrationIfMatches(newer)).resolves.toBe(false);
    await expect(loadPushRegistration()).resolves.toEqual(REGISTRATION);
    await expect(clearPushRegistrationIfMatches(REGISTRATION)).resolves.toBe(true);
    await expect(loadPushRegistration()).resolves.toBeNull();
  });

  it('never includes a raw token in sanitized storage failures or logs', async () => {
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error(`disk failure ${REGISTRATION.token}`));
    const failure = await savePushRegistration(REGISTRATION).catch((error) => error);
    expect(String(failure)).not.toContain(REGISTRATION.token);
    expect(warnSpy.mock.calls.map((call) => JSON.stringify(call)).join(' ')).not.toContain(
      REGISTRATION.token,
    );
  });
});
