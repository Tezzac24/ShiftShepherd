import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  awaitPushCleanupStep,
  beginPushRegistrationSignOut,
  finishPushRegistrationSignOut,
  isPushRegistrationScopeCurrent,
  persistDurablePushRegistration,
  PUSH_CLEANUP_STEP_DEADLINE_MS,
  resetPushRegistrationOperationsForTests,
  runPushRegistrationOperation,
  synchronizePushRegistrationScope,
} from '../pushRegistrationOperations';

const AUTH_USER_ID = 'auth-operation-test';
const PROFILE_ID = 'profile-operation-test';

beforeEach(async () => {
  resetPushRegistrationOperationsForTests();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('push registration operation coordination', () => {
  it('waits for active lifecycle work before completing sign-out quiescence', async () => {
    const scope = synchronizePushRegistrationScope(AUTH_USER_ID, PROFILE_ID)!;
    let finish: () => void = () => undefined;
    const active = runPushRegistrationOperation(
      AUTH_USER_ID,
      () =>
        new Promise<string>((resolve) => {
          finish = () => resolve('done');
        }),
    );
    const signOut = beginPushRegistrationSignOut(AUTH_USER_ID);
    let quiesced = false;
    void signOut.quiesced.then(() => {
      quiesced = true;
    });
    await Promise.resolve();
    expect(quiesced).toBe(false);
    expect(isPushRegistrationScopeCurrent(scope)).toBe(false);

    finish();
    await expect(active).resolves.toBe('done');
    await expect(signOut.quiesced).resolves.toBeUndefined();
    finishPushRegistrationSignOut(AUTH_USER_ID);
  });

  it('skips new work while sign-out is paused', async () => {
    synchronizePushRegistrationScope(AUTH_USER_ID, PROFILE_ID);
    beginPushRegistrationSignOut(AUTH_USER_ID);
    const operation = jest.fn(async () => 'ran');
    await expect(
      runPushRegistrationOperation(AUTH_USER_ID, operation),
    ).resolves.toBeUndefined();
    expect(operation).not.toHaveBeenCalled();

    finishPushRegistrationSignOut(AUTH_USER_ID);
    synchronizePushRegistrationScope(AUTH_USER_ID, PROFILE_ID);
    await expect(runPushRegistrationOperation(AUTH_USER_ID, operation)).resolves.toBe('ran');
  });

  it('prevents a late pre-sign-out operation from persisting', async () => {
    const scope = synchronizePushRegistrationScope(AUTH_USER_ID, PROFILE_ID)!;
    let release: () => void = () => undefined;
    const active = runPushRegistrationOperation(AUTH_USER_ID, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return persistDurablePushRegistration(scope, {
        authUserId: AUTH_USER_ID,
        profileId: PROFILE_ID,
        token: 'ExponentPushToken[late-operation-test]',
        platform: 'ios',
        registeredAt: '2026-07-14T12:00:00.000Z',
        lifecycleGeneration: scope.generation,
      });
    });
    const signOut = beginPushRegistrationSignOut(AUTH_USER_ID);
    release();

    await expect(active).resolves.toBe(false);
    await expect(signOut.quiesced).resolves.toBeUndefined();
    await expect(AsyncStorage.getItem('shift-shepherd/push-registration')).resolves.toBeNull();
  });

  it('consumes a timed-out cleanup promise rejection without an unhandled rejection', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let rejectLate: (error: Error) => void = () => undefined;
    const dependency = new Promise<void>((_resolve, reject) => {
      rejectLate = reject;
    });
    const cleanup = awaitPushCleanupStep('revoke', dependency);
    jest.advanceTimersByTime(PUSH_CLEANUP_STEP_DEADLINE_MS);
    await expect(cleanup).resolves.toEqual({ status: 'timedOut' });
    expect(warn).toHaveBeenCalledWith('[auth] push cleanup deadline reached', {
      step: 'revoke',
    });

    rejectLate(new Error('late failure'));
    await Promise.resolve();
    await Promise.resolve();
  });
});
