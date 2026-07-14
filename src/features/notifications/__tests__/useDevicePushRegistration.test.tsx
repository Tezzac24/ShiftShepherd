import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useAuth } from '../../../lib/auth/AuthContext';
import {
  getExistingExpoPushToken,
  obtainExpoPushToken,
} from '../../../lib/notifications';
import {
  clearPushRegistration,
  loadPushRegistration,
  PersistedPushRegistration,
  savePushRegistration,
} from '../../../lib/storage/persistence';
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
const mockRegisterToken = registerPushToken as jest.MockedFunction<typeof registerPushToken>;
const mockUnregisterToken = unregisterPushToken as jest.MockedFunction<
  typeof unregisterPushToken
>;

let currentAuth: ReturnType<typeof useAuth>;

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
  jest.clearAllMocks();
  currentAuth = liveAuth();
  mockUseAuth.mockImplementation(() => currentAuth);
  mockLoadRegistration.mockResolvedValue(null);
  mockSaveRegistration.mockResolvedValue(undefined);
  mockClearRegistration.mockResolvedValue(undefined);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.state.kind).toBe('notSetUp'));
    expect(mockClearRegistration).toHaveBeenCalledTimes(1);
    expect(mockGetExistingToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
    expect(mockUnregisterToken).not.toHaveBeenCalled();
  });

  it('registers a rotated token first, then best-effort removes the obsolete same-account token', async () => {
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
      mockLoadRegistration.mockResolvedValue(STORED_A);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
    mockLoadRegistration.mockResolvedValue(STORED_A);
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
});
