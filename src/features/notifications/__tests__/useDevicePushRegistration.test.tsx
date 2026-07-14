import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useAuth } from '../../../lib/auth/AuthContext';
import {
  getExistingExpoPushToken,
  obtainExpoPushToken,
} from '../../../lib/notifications';
import {
  clearPushRegistration,
  clearPushRegistrationIfMatches,
  loadPushRegistration,
  PersistedPushRegistration,
  savePushRegistration,
} from '../../../lib/storage/persistence';
import {
  beginPushRegistrationSignOut,
  finishPushRegistrationSignOut,
  getDurablePushRegistrationSnapshot,
  resetPushRegistrationOperationsForTests,
  synchronizePushRegistrationScope,
} from '../../../lib/notifications/pushRegistrationOperations';
import {
  registerPushToken,
  unregisterPushToken,
} from '../../../lib/supabase/services/pushTokens';
import {
  PushRegistrationProvider,
  useDevicePushRegistration,
} from '../useDevicePushRegistration';

jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/notifications', () => ({
  getDevicePushSupport: jest.fn(() => 'supported'),
  getExistingExpoPushToken: jest.fn(),
  obtainExpoPushToken: jest.fn(),
}));
jest.mock('../../../lib/storage/persistence', () => ({
  clearPushRegistration: jest.fn(),
  clearPushRegistrationIfMatches: jest.fn(),
  loadPushRegistration: jest.fn(),
  savePushRegistration: jest.fn(),
}));
jest.mock('../../../lib/supabase/services/pushTokens', () => ({
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
  isPushRegistrationAccessError: jest.fn(
    (error: unknown) =>
      (error as { code?: unknown })?.code === 'ORGANISATION_ACCESS_REMOVED' ||
      (error as { code?: unknown })?.code === 'NO_LINKED_PROFILE',
  ),
}));

const AUTH_A = 'auth-account-a';
const AUTH_B = 'auth-account-b';
const PROFILE_A = '5f0d8f5e-1111-2222-3333-444455556666';
const PROFILE_B = '5f0d8f5e-7777-8888-9999-000011112222';
const PROFILE_C = '5f0d8f5e-3333-4444-5555-666677778888';
const TOKEN_A = 'ExponentPushToken[lifecycle-test-token-a]';
const TOKEN_B = 'ExponentPushToken[lifecycle-test-token-b]';
const REGISTERED_A = '2026-07-14T12:00:00.000Z';
const REGISTERED_B = '2026-07-14T13:00:00.000Z';
const ACCESS_CHANGED_TEXT =
  'Your organisation access changed. Refresh your account and try again.';

const STORED_A: PersistedPushRegistration = {
  authUserId: AUTH_A,
  profileId: PROFILE_A,
  token: TOKEN_A,
  platform: 'ios',
  registeredAt: REGISTERED_A,
  lifecycleGeneration: 1,
};

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockGetExistingToken = getExistingExpoPushToken as jest.MockedFunction<
  typeof getExistingExpoPushToken
>;
const mockObtainToken = obtainExpoPushToken as jest.MockedFunction<typeof obtainExpoPushToken>;
const mockLoadRegistration = loadPushRegistration as jest.MockedFunction<
  typeof loadPushRegistration
>;
const mockSaveRegistration = savePushRegistration as jest.MockedFunction<
  typeof savePushRegistration
>;
const mockClearRegistration = clearPushRegistration as jest.MockedFunction<
  typeof clearPushRegistration
>;
const mockConditionalClearRegistration =
  clearPushRegistrationIfMatches as jest.MockedFunction<
    typeof clearPushRegistrationIfMatches
  >;
const mockRegisterToken = registerPushToken as jest.MockedFunction<typeof registerPushToken>;
const mockUnregisterToken = unregisterPushToken as jest.MockedFunction<
  typeof unregisterPushToken
>;

let currentAuth: ReturnType<typeof useAuth>;
let storedRegistration: PersistedPushRegistration | null;

function liveAuth(authUserId = AUTH_A, profileId: string | null = PROFILE_A) {
  return {
    user: null,
    isLoading: false,
    isAuthenticated: true,
    authMode: 'supabase',
    supabaseEnabled: true,
    accountContext: {
      account: {
        auth_user_id: authUserId,
        global_display_name: 'Test Member',
        name_confirmed_at: REGISTERED_A,
        active_profile_id: profileId,
      },
      organisations: [],
    },
    accountStatus: 'ready',
    authIdentity: {
      id: authUserId,
      email: 'member@example.com',
      emailVerified: true,
      suggestedName: null,
    },
    pendingInvitationToken: null,
    signInAsTestUser: jest.fn(),
    signInWithEmail: jest.fn(),
    signUpWithEmail: jest.fn(),
    signOut: jest.fn(),
    refreshAccountContext: jest.fn(),
    savePendingInvitation: jest.fn(),
    clearPendingInvitation: jest.fn(),
    setGlobalDisplayName: jest.fn(),
    setOrganisationDisplayNameOverride: jest.fn(),
    setProfileDisplayNames: jest.fn(),
    switchOrganisation: jest.fn(),
    createOrganisation: jest.fn(),
    leaveOrganisation: jest.fn(),
    applySessionAvatarUrl: jest.fn(),
    applySessionProfile: jest.fn(),
    applySessionDirectorySnapshot: jest.fn(),
  } as ReturnType<typeof useAuth>;
}

function demoAuth() {
  return {
    ...liveAuth(),
    authMode: 'demo',
    authIdentity: null,
    accountContext: null,
    accountStatus: 'idle',
  } as ReturnType<typeof useAuth>;
}

function Wrapper({ children }: React.PropsWithChildren) {
  return <PushRegistrationProvider>{children}</PushRegistrationProvider>;
}

function renderLifecycle() {
  return renderHook(() => useDevicePushRegistration(), { wrapper: Wrapper });
}

beforeEach(() => {
  resetPushRegistrationOperationsForTests();
  jest.clearAllMocks();
  currentAuth = liveAuth();
  storedRegistration = null;
  mockUseAuth.mockImplementation(() => currentAuth);
  mockLoadRegistration.mockImplementation(async () => storedRegistration);
  mockSaveRegistration.mockImplementation(async (registration) => {
    storedRegistration = registration;
  });
  mockClearRegistration.mockImplementation(async () => {
    storedRegistration = null;
  });
  mockConditionalClearRegistration.mockImplementation(async (expected) => {
    if (
      storedRegistration?.authUserId === expected.authUserId &&
      storedRegistration.profileId === expected.profileId &&
      storedRegistration.token === expected.token &&
      storedRegistration.lifecycleGeneration === expected.lifecycleGeneration
    ) {
      storedRegistration = null;
      return true;
    }
    return false;
  });
  mockGetExistingToken.mockResolvedValue({
    status: 'obtained',
    token: TOKEN_A,
    platform: 'ios',
  });
  mockObtainToken.mockResolvedValue({
    status: 'obtained',
    token: TOKEN_A,
    platform: 'ios',
  });
  mockRegisterToken.mockResolvedValue(REGISTERED_B);
  mockUnregisterToken.mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('push registration lifecycle', () => {
  it('keeps demo mode offline even when registration is invoked', async () => {
    currentAuth = demoAuth();
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    expect(mockLoadRegistration).not.toHaveBeenCalled();
    expect(mockObtainToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('hydrates missing state as unregistered without requesting permission', async () => {
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    expect(mockGetExistingToken).not.toHaveBeenCalled();
    expect(mockObtainToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('hydrates a matching account/profile/token as registered without a duplicate RPC', async () => {
    storedRegistration = STORED_A;
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    expect(result.current.state).toEqual({
      kind: 'registered',
      registeredAt: REGISTERED_A,
    });
    expect(mockGetExistingToken).toHaveBeenCalledTimes(1);
    expect(mockObtainToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
    expect(JSON.stringify(result.current.state)).not.toContain(TOKEN_A);
  });

  it('requests permission only after the explicit control and persists success', async () => {
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    expect(mockObtainToken).toHaveBeenCalledTimes(1);
    expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_A, TOKEN_A, 'ios');
    expect(mockSaveRegistration).toHaveBeenCalledWith({
      authUserId: AUTH_A,
      profileId: PROFILE_A,
      token: TOKEN_A,
      platform: 'ios',
      registeredAt: REGISTERED_B,
      lifecycleGeneration: 1,
    });
  });

  it('finishes an explicit opt-in on the newest profile after a same-account switch', async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    mockRegisterToken
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(REGISTERED_B);

    const { result, rerender } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    await waitFor(() =>
      expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_A, TOKEN_A, 'ios'),
    );

    currentAuth = liveAuth(AUTH_A, PROFILE_B);
    rerender(undefined);
    act(() => resolveFirst(REGISTERED_A));

    await waitFor(() =>
      expect(mockRegisterToken).toHaveBeenLastCalledWith(PROFILE_B, TOKEN_A, 'ios'),
    );
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1);
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: AUTH_A,
        profileId: PROFILE_B,
        token: TOKEN_A,
      }),
    );
  });

  it.each(['ORGANISATION_ACCESS_REMOVED', 'NO_LINKED_PROFILE'] as const)(
    'keeps explicit %s failures unregistered and retryable',
    async (code) => {
      mockRegisterToken.mockRejectedValue({ code });
      const { result } = renderLifecycle();
      await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
      act(() => result.current.register());
      await waitFor(() => expect(result.current.state.kind).toBe('failed'));
      expect(result.current.state).toEqual({ kind: 'failed', message: ACCESS_CHANGED_TEXT });
      expect(mockClearRegistration).toHaveBeenCalled();
      expect(mockSaveRegistration).not.toHaveBeenCalled();
    },
  );

  it('does not persist or show success when explicit registration fails', async () => {
    mockRegisterToken.mockRejectedValue(new Error('friendly retry'));
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    await waitFor(() => expect(result.current.state.kind).toBe('failed'));
    expect(mockSaveRegistration).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: 'failed', message: 'friendly retry' });
  });

  it('rebinds the unchanged token to a new active profile without unregistering or prompting', async () => {
    currentAuth = liveAuth(AUTH_A, PROFILE_B);
    storedRegistration = STORED_A;
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_B, TOKEN_A, 'ios');
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: AUTH_A, profileId: PROFILE_B, token: TOKEN_A }),
    );
    expect(mockUnregisterToken).not.toHaveBeenCalled();
    expect(mockObtainToken).not.toHaveBeenCalled();
  });

  it('does not auto-register when no persisted opt-in exists', async () => {
    currentAuth = liveAuth(AUTH_A, PROFILE_B);
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    expect(mockGetExistingToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('clears another Auth account record and leaves the new account unregistered', async () => {
    currentAuth = liveAuth(AUTH_B, PROFILE_B);
    storedRegistration = STORED_A;
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    expect(mockClearRegistration).toHaveBeenCalledTimes(1);
    expect(mockGetExistingToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
    expect(mockUnregisterToken).not.toHaveBeenCalled();
  });

  it('registers a rotated token first, then best-effort removes the obsolete same-account token', async () => {
    storedRegistration = STORED_A;
    mockGetExistingToken.mockResolvedValue({
      status: 'obtained',
      token: TOKEN_B,
      platform: 'ios',
    });
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_A, TOKEN_B, 'ios');
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_A);
    expect(mockRegisterToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockUnregisterToken.mock.invocationCallOrder[0],
    );
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ token: TOKEN_B }),
    );
  });

  it('revokes best-effort and clears locally when permission is no longer granted', async () => {
    storedRegistration = STORED_A;
    mockGetExistingToken.mockResolvedValue({ status: 'permissionDenied' });
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_A);
    expect(mockClearRegistration).toHaveBeenCalled();
    expect(mockObtainToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('revokes and clears an existing opt-in when there is no active profile', async () => {
    currentAuth = liveAuth(AUTH_A, null);
    storedRegistration = STORED_A;
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_A);
    expect(mockClearRegistration).toHaveBeenCalled();
    expect(mockGetExistingToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it.each(['ORGANISATION_ACCESS_REMOVED', 'NO_LINKED_PROFILE'] as const)(
    'clears %s failures and does not retry through rerenders',
    async (code) => {
      currentAuth = liveAuth(AUTH_A, PROFILE_B);
      storedRegistration = STORED_A;
      mockRegisterToken.mockRejectedValue({ code });
      const { result, rerender } = renderLifecycle();
      await waitFor(() => expect(result.current.state.kind).toBe('failed'));
      expect(result.current.state).toEqual({ kind: 'failed', message: ACCESS_CHANGED_TEXT });
      expect(mockClearRegistration).toHaveBeenCalled();
      rerender(undefined);
      await act(async () => Promise.resolve());
      expect(mockRegisterToken).toHaveBeenCalledTimes(1);
    },
  );

  it('does not repeat reconciliation calls on ordinary rerenders', async () => {
    storedRegistration = STORED_A;
    const { result, rerender } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    rerender(undefined);
    rerender(undefined);
    await act(async () => Promise.resolve());
    expect(mockLoadRegistration).toHaveBeenCalledTimes(1);
    expect(mockGetExistingToken).toHaveBeenCalledTimes(1);
  });

  it('serializes quick profile changes so the newest profile wins and stale results are not saved', async () => {
    currentAuth = liveAuth(AUTH_A, PROFILE_B);
    storedRegistration = STORED_A;
    let resolveFirst: (value: string) => void = () => undefined;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    mockRegisterToken
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(REGISTERED_B);

    const { result, rerender } = renderLifecycle();
    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_B, TOKEN_A, 'ios'));
    currentAuth = liveAuth(AUTH_A, PROFILE_C);
    rerender(undefined);
    act(() => resolveFirst(REGISTERED_A));

    await waitFor(() =>
      expect(mockRegisterToken).toHaveBeenLastCalledWith(PROFILE_C, TOKEN_A, 'ios'),
    );
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1);
    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: PROFILE_C, registeredAt: REGISTERED_B }),
    );
  });

  it('cannot persist an old in-flight result after the Auth user changes', async () => {
    currentAuth = liveAuth(AUTH_A, PROFILE_B);
    storedRegistration = STORED_A;
    let resolveRegistration: (value: string) => void = () => undefined;
    mockRegisterToken.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    const { result, rerender } = renderLifecycle();
    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));
    currentAuth = liveAuth(AUTH_B, PROFILE_C);
    rerender(undefined);
    act(() => resolveRegistration(REGISTERED_B));
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    expect(mockSaveRegistration).not.toHaveBeenCalled();
    expect(mockClearRegistration).toHaveBeenCalled();
  });

  it('rolls back server registration when an explicit durable save fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSaveRegistration.mockRejectedValueOnce(
      new Error("We couldn't save notification setup on this device. Please try again."),
    );
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));

    act(() => result.current.register());

    await waitFor(() => expect(result.current.state.kind).toBe('failed'));
    expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_A, TOKEN_A, 'ios');
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_A);
    expect(storedRegistration).toBeNull();
    const scope = synchronizePushRegistrationScope(AUTH_A, PROFILE_A)!;
    expect(getDurablePushRegistrationSnapshot(scope)).toBeNull();
    const visibleText = JSON.stringify({ state: result.current.state, logs: warn.mock.calls });
    expect(visibleText).not.toContain(TOKEN_A);
    warn.mockRestore();
  });

  it('keeps a failed profile rebind unregistered and rolls back the rebound token', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    currentAuth = liveAuth(AUTH_A, PROFILE_B);
    storedRegistration = STORED_A;
    mockSaveRegistration.mockRejectedValueOnce(new Error('storage unavailable'));
    const { result } = renderLifecycle();

    await waitFor(() => expect(result.current.state.kind).toBe('failed'));
    expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_B, TOKEN_A, 'ios');
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_A);
    expect(storedRegistration).toEqual(STORED_A);
    expect(result.current.state.kind).not.toBe('registered');
  });

  it('preserves the old durable token when rotated-token persistence fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    storedRegistration = STORED_A;
    mockGetExistingToken.mockResolvedValue({
      status: 'obtained',
      token: TOKEN_B,
      platform: 'ios',
    });
    mockSaveRegistration.mockRejectedValueOnce(new Error('storage unavailable'));
    const { result } = renderLifecycle();

    await waitFor(() => expect(result.current.state.kind).toBe('failed'));
    expect(mockRegisterToken).toHaveBeenCalledWith(PROFILE_A, TOKEN_B, 'ios');
    expect(mockUnregisterToken).toHaveBeenCalledTimes(1);
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_B);
    expect(storedRegistration).toEqual(STORED_A);
  });

  it('surfaces hydration read failure without opting the account in', async () => {
    mockLoadRegistration.mockRejectedValueOnce(
      new Error("We couldn't check saved notification setup on this device. Please try again."),
    );
    const { result } = renderLifecycle();

    await waitFor(() => expect(result.current.state.kind).toBe('failed'));
    expect(mockGetExistingToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
    expect(result.current.state.kind).not.toBe('registered');
  });

  it('does not trust another account record when its local clear fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    currentAuth = liveAuth(AUTH_B, PROFILE_B);
    storedRegistration = STORED_A;
    mockClearRegistration.mockRejectedValue(new Error('storage locked'));
    const first = renderLifecycle();

    await waitFor(() => expect(first.result.current.state.kind).toBe('notSetUp'));
    expect(storedRegistration).toEqual(STORED_A);
    expect(mockRegisterToken).not.toHaveBeenCalled();
    first.unmount();

    const second = renderLifecycle();
    await waitFor(() => expect(second.result.current.state.kind).toBe('notSetUp'));
    expect(mockRegisterToken).not.toHaveBeenCalled();
    expect(mockGetExistingToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[pushRegistration] account-replacement local clear failed',
      expect.any(Object),
    );
    warn.mockRestore();
  });

  it('cleans a delayed Account A save after Account B initializes unregistered', async () => {
    let resolveSave: () => void = () => undefined;
    mockSaveRegistration.mockImplementationOnce(
      (registration) =>
        new Promise<void>((resolve) => {
          resolveSave = () => {
            storedRegistration = registration;
            resolve();
          };
        }),
    );
    const { result, rerender } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    await waitFor(() => expect(mockSaveRegistration).toHaveBeenCalledTimes(1));

    currentAuth = liveAuth(AUTH_B, PROFILE_B);
    rerender(undefined);
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => resolveSave());

    await waitFor(() => expect(storedRegistration).toBeNull());
    expect(result.current.state.kind).toBe('notSetUp');
    expect(mockConditionalClearRegistration).toHaveBeenCalled();
  });

  it('cannot persist or publish a delayed save after sign-out invalidation', async () => {
    let resolveSave: () => void = () => undefined;
    mockSaveRegistration.mockImplementationOnce(
      (registration) =>
        new Promise<void>((resolve) => {
          resolveSave = () => {
            storedRegistration = registration;
            resolve();
          };
        }),
    );
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    await waitFor(() => expect(mockSaveRegistration).toHaveBeenCalledTimes(1));

    const signOut = beginPushRegistrationSignOut(AUTH_A);
    act(() => resolveSave());
    await signOut.quiesced;

    await waitFor(() => expect(storedRegistration).toBeNull());
    expect(result.current.state.kind).not.toBe('registered');
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_A);
    finishPushRegistrationSignOut(AUTH_A);
  });

  it('rolls back a delayed rotation RPC that finishes after sign-out starts', async () => {
    storedRegistration = STORED_A;
    mockGetExistingToken.mockResolvedValue({
      status: 'obtained',
      token: TOKEN_B,
      platform: 'ios',
    });
    let resolveRegistration: (value: string) => void = () => undefined;
    mockRegisterToken.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    renderLifecycle();
    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));

    const signOut = beginPushRegistrationSignOut(AUTH_A);
    act(() => resolveRegistration(REGISTERED_B));
    await signOut.quiesced;

    expect(mockSaveRegistration).not.toHaveBeenCalled();
    expect(mockUnregisterToken).toHaveBeenCalledWith(TOKEN_B);
    finishPushRegistrationSignOut(AUTH_A);
  });

  it('repairs Account B after Account A delayed save completes over B newer state', async () => {
    let resolveSaveA: () => void = () => undefined;
    mockSaveRegistration.mockImplementationOnce(
      (registration) =>
        new Promise<void>((resolve) => {
          resolveSaveA = () => {
            storedRegistration = registration;
            resolve();
          };
        }),
    );
    const { result, rerender } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    await waitFor(() => expect(mockSaveRegistration).toHaveBeenCalledTimes(1));

    currentAuth = liveAuth(AUTH_B, PROFILE_B);
    rerender(undefined);
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    act(() => result.current.register());
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));
    expect(storedRegistration?.authUserId).toBe(AUTH_B);

    act(() => resolveSaveA());
    await waitFor(() => expect(storedRegistration?.authUserId).toBe(AUTH_B));
    expect(storedRegistration?.profileId).toBe(PROFILE_B);
  });

  it('converges delayed same-account profile saves on the newest profile', async () => {
    currentAuth = liveAuth(AUTH_A, PROFILE_B);
    storedRegistration = STORED_A;
    let resolveB: () => void = () => undefined;
    let resolveC: () => void = () => undefined;
    mockSaveRegistration
      .mockImplementationOnce(
        (registration) =>
          new Promise<void>((resolve) => {
            resolveB = () => {
              storedRegistration = registration;
              resolve();
            };
          }),
      )
      .mockImplementationOnce(
        (registration) =>
          new Promise<void>((resolve) => {
            resolveC = () => {
              storedRegistration = registration;
              resolve();
            };
          }),
      );
    const { rerender } = renderLifecycle();
    await waitFor(() => expect(mockSaveRegistration).toHaveBeenCalledTimes(1));

    currentAuth = liveAuth(AUTH_A, PROFILE_C);
    rerender(undefined);
    await waitFor(() => expect(mockSaveRegistration).toHaveBeenCalledTimes(2));
    act(() => resolveC());
    await waitFor(() => expect(storedRegistration?.profileId).toBe(PROFILE_C));
    act(() => resolveB());

    await waitFor(() => expect(storedRegistration?.profileId).toBe(PROFILE_C));
    expect(storedRegistration?.authUserId).toBe(AUTH_A);
  });
});
