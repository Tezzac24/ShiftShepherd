import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Text } from 'react-native';

import { AuthProvider, SIGN_OUT_ERROR, useAuth } from '../AuthContext';
import * as pendingInvitation from '../../invitations/pendingInvitation';
import {
  PUSH_CLEANUP_STEP_DEADLINE_MS,
  rememberDurablePushRegistration,
  resetPushRegistrationOperationsForTests,
  runPushRegistrationOperation,
  synchronizePushRegistrationScope,
} from '../../notifications/pushRegistrationOperations';
import * as pushPersistence from '../../storage/persistence';
import {
  loadPushRegistration,
  savePushRegistration,
  STORAGE_KEYS,
} from '../../storage/persistence';
import { unregisterPushToken } from '../../supabase/services/pushTokens';

jest.mock('../../supabase/services/pushTokens', () => ({
  unregisterPushToken: jest.fn(),
}));

const signOutMock = jest.fn();
const getSessionMock = jest.fn();
const mockSupabase = {
  auth: {
    signOut: signOutMock,
    getSession: getSessionMock,
    getUser: jest.fn(),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data: { role: 'general_member' }, error: null })),
        order: jest.fn(async () => ({ data: [], error: null })),
      })),
    })),
  })),
};

jest.mock('../../supabase/client', () => ({
  getSupabase: () => mockSupabase,
  isSupabaseConfigured: true,
}));

const mockFetchAccountContext = jest.fn();
jest.mock('../../supabase/services/accounts', () => ({
  fetchAccountContext: (...args: unknown[]) => mockFetchAccountContext(...args),
  switchActiveProfile: jest.fn(),
  setGlobalDisplayName: jest.fn(),
  setOrganisationDisplayNameOverride: jest.fn(),
  setProfileDisplayNames: jest.fn(),
  createOrganisation: jest.fn(),
}));

const AUTH_USER = { id: 'auth-1', email: 'person@example.com', email_confirmed_at: 'now' };
const PROFILE = { id: 'profile-1', full_name: 'Person', email: 'person@example.com' };
const TOKEN = 'A'.repeat(43);
const PUSH_TOKEN = 'ExponentPushToken[sign-out-test-token]';
const mockUnregisterPushToken = unregisterPushToken as jest.MockedFunction<
  typeof unregisterPushToken
>;

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <Text>{auth.isAuthenticated ? 'in' : 'out'}</Text>;
}

async function renderSignedIn() {
  getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
  mockFetchAccountContext.mockResolvedValue({
    account: { id: 'account-1', active_profile_id: 'profile-1', global_display_name: 'Person' },
    organisations: [{ profile: PROFILE, organisation: { id: 'org-1', name: 'Church' } }],
  });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('in')).toBeTruthy());
}

beforeEach(async () => {
  resetPushRegistrationOperationsForTests();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  signOutMock.mockResolvedValue({ error: null });
  mockUnregisterPushToken.mockResolvedValue(true);
});

// clearMocks does not undo spyOn implementations — restore so a stubbed
// cleanup failure cannot leak into the next test.
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('sign-out', () => {
  async function persistPush(authUserId = AUTH_USER.id) {
    await savePushRegistration({
      authUserId,
      profileId: PROFILE.id,
      token: PUSH_TOKEN,
      platform: 'ios',
      registeredAt: '2026-07-14T12:00:00.000Z',
      lifecycleGeneration: 1,
    });
  }

  it('clears the authenticated session state', async () => {
    await renderSignedIn();
    await act(async () => auth.signOut());

    expect(signOutMock).toHaveBeenCalled();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
    expect(auth.accountContext).toBeNull();
    expect(auth.authIdentity).toBeNull();
    await waitFor(() => expect(screen.getByText('out')).toBeTruthy());
  });

  /**
   * The reported regression: pending-invitation cleanup threw (an invalid
   * SecureStore key), which rejected before supabase.auth.signOut() was ever
   * reached. The Supabase session survived on disk and the previous user came
   * back on the next launch.
   */
  it('signs out of Supabase even when pending-invitation cleanup fails', async () => {
    jest
      .spyOn(pendingInvitation, 'clearPendingInvitation')
      .mockRejectedValue(new Error('Invalid key provided to SecureStore.'));
    await renderSignedIn();

    await act(async () => auth.signOut());

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('does not reject when optional cleanup fails', async () => {
    jest
      .spyOn(pendingInvitation, 'clearPendingInvitation')
      .mockRejectedValue(new Error('keychain unavailable'));
    await renderSignedIn();

    await expect(act(async () => auth.signOut())).resolves.not.toThrow();
  });

  it('surfaces a real Supabase sign-out failure to the caller', async () => {
    signOutMock.mockResolvedValueOnce({ error: { message: 'network request failed' } });
    await renderSignedIn();

    let failure: unknown;
    await act(async () => {
      failure = await auth.signOut().catch((cause: unknown) => cause);
    });

    expect((failure as Error).message).toBe(SIGN_OUT_ERROR);
    // The device session is still dropped so a restart cannot resurrect it.
    expect(signOutMock).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(auth.isAuthenticated).toBe(false);
  });

  it('is safe to invoke twice', async () => {
    await persistPush();
    await renderSignedIn();
    await act(async () => {
      await Promise.all([auth.signOut(), auth.signOut()]);
    });

    expect(mockUnregisterPushToken).toHaveBeenCalledTimes(1);
    await expect(loadPushRegistration()).resolves.toBeNull();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('orders push revocation, local registration clear, then Auth sign-out', async () => {
    await persistPush();
    await renderSignedIn();
    await act(async () => auth.signOut());

    const removeItem = AsyncStorage.removeItem as jest.Mock;
    const registrationClearIndex = removeItem.mock.calls.findIndex(
      ([key]) => key === STORAGE_KEYS.pushRegistration,
    );
    expect(registrationClearIndex).toBeGreaterThanOrEqual(0);
    expect(mockUnregisterPushToken.mock.invocationCallOrder[0]).toBeLessThan(
      removeItem.mock.invocationCallOrder[registrationClearIndex],
    );
    expect(removeItem.mock.invocationCallOrder[registrationClearIndex]).toBeLessThan(
      signOutMock.mock.invocationCallOrder[0],
    );
  });

  it('quiesces an active lifecycle write before reading and revoking the token', async () => {
    await persistPush();
    await renderSignedIn();
    let finishLifecycle: () => void = () => undefined;
    const activeLifecycle = runPushRegistrationOperation(
      AUTH_USER.id,
      () =>
        new Promise<void>((resolve) => {
          finishLifecycle = resolve;
        }),
    );

    await act(async () => {
      const signOut = auth.signOut();
      await Promise.resolve();
      expect(mockUnregisterPushToken).not.toHaveBeenCalled();
      expect(signOutMock).not.toHaveBeenCalled();
      finishLifecycle();
      await activeLifecycle;
      await signOut;
    });

    expect(mockUnregisterPushToken).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('skips server revocation when there is no persisted record', async () => {
    await renderSignedIn();
    await act(async () => auth.signOut());
    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('never sends another Auth account record to unregister', async () => {
    await persistPush('auth-someone-else');
    await renderSignedIn();
    await act(async () => auth.signOut());
    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
    await expect(loadPushRegistration()).resolves.toBeNull();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('continues sign-out when unregister returns false', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUnregisterPushToken.mockResolvedValue(false);
    await persistPush();
    await renderSignedIn();
    await act(async () => auth.signOut());
    expect(signOutMock).toHaveBeenCalledTimes(1);
    await expect(loadPushRegistration()).resolves.toBeNull();
  });

  it('continues sign-out and clears locally after unregister rejects', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUnregisterPushToken.mockRejectedValue(new Error('session expired'));
    await persistPush();
    await renderSignedIn();
    await act(async () => auth.signOut());
    expect(signOutMock).toHaveBeenCalledTimes(1);
    await expect(loadPushRegistration()).resolves.toBeNull();
  });

  it('never logs the raw token when best-effort revocation fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUnregisterPushToken.mockRejectedValue(new Error(`network failure ${PUSH_TOKEN}`));
    await persistPush();
    await renderSignedIn();
    await act(async () => auth.signOut());
    expect(warn.mock.calls.map((args) => JSON.stringify(args)).join(' ')).not.toContain(
      PUSH_TOKEN,
    );
  });

  it('reaches Auth sign-out after the deadline when lifecycle work never settles', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderSignedIn();
    void runPushRegistrationOperation(AUTH_USER.id, () => new Promise<void>(() => {}));

    let signOutPromise!: Promise<void>;
    act(() => {
      signOutPromise = auth.signOut();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(PUSH_CLEANUP_STEP_DEADLINE_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    await act(async () => signOutPromise);
    jest.useRealTimers();
  });

  it('reaches Auth sign-out when unregister never settles', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await persistPush();
    mockUnregisterPushToken.mockImplementation(() => new Promise<boolean>(() => {}));
    await renderSignedIn();

    let signOutPromise!: Promise<void>;
    act(() => {
      signOutPromise = auth.signOut();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(PUSH_CLEANUP_STEP_DEADLINE_MS);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    await act(async () => signOutPromise);
    jest.useRealTimers();
  });

  it('uses the matching durable snapshot without waiting for a stuck storage read', async () => {
    const registration = {
      authUserId: AUTH_USER.id,
      profileId: PROFILE.id,
      token: PUSH_TOKEN,
      platform: 'ios' as const,
      registeredAt: '2026-07-14T12:00:00.000Z',
      lifecycleGeneration: 1,
    };
    const scope = synchronizePushRegistrationScope(AUTH_USER.id, PROFILE.id)!;
    rememberDurablePushRegistration(scope, registration);
    jest.spyOn(pushPersistence, 'loadPushRegistration').mockImplementation(
      () => new Promise<null>(() => {}),
    );
    await renderSignedIn();

    await act(async () => auth.signOut());

    expect(mockUnregisterPushToken).toHaveBeenCalledWith(PUSH_TOKEN);
    expect(pushPersistence.loadPushRegistration).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('reaches Auth sign-out when storage read never settles without a snapshot', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const load = jest.spyOn(pushPersistence, 'loadPushRegistration').mockImplementation(
      () => new Promise<null>(() => {}),
    );
    await renderSignedIn();

    let signOutPromise!: Promise<void>;
    act(() => {
      signOutPromise = auth.signOut();
    });
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PUSH_CLEANUP_STEP_DEADLINE_MS);
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });

    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    await act(async () => signOutPromise);
    jest.useRealTimers();
  });

  it('reaches Auth sign-out when local push clear never settles', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const clear = jest.spyOn(pushPersistence, 'clearPushRegistration').mockImplementation(
      () => new Promise<void>(() => {}),
    );
    await renderSignedIn();

    let signOutPromise!: Promise<void>;
    act(() => {
      signOutPromise = auth.signOut();
    });
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(clear).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PUSH_CLEANUP_STEP_DEADLINE_MS);
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    await act(async () => signOutPromise);
    jest.useRealTimers();
  });

  it('records a push storage read failure and still signs out without a snapshot', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(pushPersistence, 'loadPushRegistration')
      .mockRejectedValue(new pushPersistence.PushRegistrationPersistenceError('read'));
    await renderSignedIn();

    await act(async () => auth.signOut());

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[auth] push registration read failed during sign-out',
      { code: 'PUSH_REGISTRATION_STORAGE_READ_FAILED' },
    );
  });

  it('records a push storage clear failure and still signs out', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(pushPersistence, 'clearPushRegistration')
      .mockRejectedValue(new pushPersistence.PushRegistrationPersistenceError('clear'));
    await renderSignedIn();

    await act(async () => auth.signOut());

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[auth] push registration clear failed during sign-out',
      { code: 'PUSH_REGISTRATION_STORAGE_CLEAR_FAILED' },
    );
  });
});

describe('pending invitation across sign-out', () => {
  it('drops the pending token on an ordinary sign-out', async () => {
    const clear = jest.spyOn(pendingInvitation, 'clearPendingInvitation');
    await renderSignedIn();
    await act(async () => auth.savePendingInvitation(TOKEN));
    expect(auth.pendingInvitationToken).toBe(TOKEN);

    await act(async () => auth.signOut());

    expect(clear).toHaveBeenCalled();
    expect(auth.pendingInvitationToken).toBeNull();
  });

  // "Switch account" on a wrong-account invitation: the user signs out only to
  // sign back in with the invited email, so the invitation must still be waiting.
  it('preserves the pending token for a wrong-account sign-out', async () => {
    const clear = jest.spyOn(pendingInvitation, 'clearPendingInvitation');
    await renderSignedIn();
    await act(async () => auth.savePendingInvitation(TOKEN));
    clear.mockClear();

    await act(async () => auth.signOut({ preservePendingInvitation: true }));

    expect(clear).not.toHaveBeenCalled();
    expect(auth.pendingInvitationToken).toBe(TOKEN);
    expect(signOutMock).toHaveBeenCalled();
    await expect(pendingInvitation.loadPendingInvitation()).resolves.toBe(TOKEN);
  });

  it('removes the token on deliberate cleanup after acceptance or a terminal invitation', async () => {
    await renderSignedIn();
    await act(async () => auth.savePendingInvitation(TOKEN));

    await act(async () => auth.clearPendingInvitation());

    expect(auth.pendingInvitationToken).toBeNull();
    await expect(pendingInvitation.loadPendingInvitation()).resolves.toBeNull();
  });
});
