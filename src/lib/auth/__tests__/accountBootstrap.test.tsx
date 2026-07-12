import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '../AuthContext';

const signOutMock = jest.fn();
const getSessionMock = jest.fn();
const getUserMock = jest.fn();
const mockSupabase = {
  auth: {
    signOut: signOutMock,
    getSession: getSessionMock,
    getUser: getUserMock,
    signInWithPassword: jest.fn(),
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

const mockLeaveOrganisation = jest.fn();
jest.mock('../../supabase/services/organisationMemberships', () => ({
  leaveOrganisation: (...args: unknown[]) => mockLeaveOrganisation(...args),
}));

const AUTH_USER = { id: 'auth-1', email: 'member@example.com', email_confirmed_at: 'now' };
const OTHER_AUTH_USER = { id: 'auth-2', email: 'other@example.com', email_confirmed_at: 'now' };

const ORG_MEMBER_CONTEXT = {
  account: { auth_user_id: 'auth-1', active_profile_id: 'profile-1', global_display_name: 'Member' },
  organisations: [
    { profile: { id: 'profile-1', full_name: 'Member' }, organisation: { id: 'org-1', name: 'Church' } },
  ],
};
const NO_ORG_CONTEXT = {
  account: { auth_user_id: 'auth-2', active_profile_id: null, global_display_name: 'Newcomer' },
  organisations: [],
};

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <Text>{auth.accountStatus}</Text>;
}

/** Lets a test hold fetchAccountContext open, which is where the race lived. */
function deferredContext() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  mockFetchAccountContext.mockReturnValue(promise);
  return { resolve, reject };
}

function renderAuth() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  signOutMock.mockResolvedValue({ error: null });
  getSessionMock.mockResolvedValue({ data: { session: null } });
  getUserMock.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
  mockLeaveOrganisation.mockResolvedValue({ transition: 'no_organisations' });
});

describe('account bootstrap status', () => {
  it('starts idle when signed out', async () => {
    renderAuth();
    await waitFor(() => expect(auth.isLoading).toBe(false));
    expect(auth.accountStatus).toBe('idle');
  });

  /**
   * The race: the session is authenticated the moment the auth identity lands,
   * but the organisation context is still in flight. The context is null in that
   * window and must be reported as unresolved, never as "no organisations".
   */
  it('reports loading — not an empty account — while the context is in flight', async () => {
    const pending = deferredContext();
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();

    await waitFor(() => expect(auth.accountStatus).toBe('loading'));
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.accountContext).toBeNull();
    expect(auth.user).toBeNull();

    await act(async () => {
      pending.resolve(ORG_MEMBER_CONTEXT);
    });

    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
    expect(auth.user?.supabaseProfileId).toBe('profile-1');
  });

  it('resolves ready with an active profile for an organisation member', async () => {
    mockFetchAccountContext.mockResolvedValue(ORG_MEMBER_CONTEXT);
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();

    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
    expect(auth.user?.supabaseProfileId).toBe('profile-1');
    expect(auth.accountContext?.organisations).toHaveLength(1);
  });

  it('resolves ready and genuinely empty for a no-organisation account', async () => {
    mockFetchAccountContext.mockResolvedValue(NO_ORG_CONTEXT);
    getSessionMock.mockResolvedValue({ data: { session: { user: OTHER_AUTH_USER } } });
    renderAuth();

    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
    expect(auth.user).toBeNull();
    expect(auth.accountContext?.organisations).toHaveLength(0);
  });

  it('reports error — not an empty account — when the lookup fails', async () => {
    mockFetchAccountContext.mockRejectedValue(new Error('network request failed'));
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();

    await waitFor(() => expect(auth.accountStatus).toBe('error'));
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.accountContext).toBeNull();
    expect(auth.user).toBeNull();
  });

  it('recovers to ready when the account lookup is retried successfully', async () => {
    mockFetchAccountContext.mockRejectedValueOnce(new Error('network request failed'));
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();
    await waitFor(() => expect(auth.accountStatus).toBe('error'));

    mockFetchAccountContext.mockResolvedValue(ORG_MEMBER_CONTEXT);
    await act(async () => auth.refreshAccountContext());

    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
    expect(auth.user?.supabaseProfileId).toBe('profile-1');
  });
});

describe('cross-account isolation', () => {
  it('drops the previous account the moment a different one starts loading', async () => {
    mockFetchAccountContext.mockResolvedValue(ORG_MEMBER_CONTEXT);
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();
    await waitFor(() => expect(auth.user?.supabaseProfileId).toBe('profile-1'));

    // A different auth user begins bootstrapping; its context has not landed yet.
    const pending = deferredContext();
    getUserMock.mockResolvedValue({ data: { user: OTHER_AUTH_USER }, error: null });
    act(() => {
      void auth.refreshAccountContext();
    });

    // The old organisation must be gone immediately — no flash of the previous
    // user's Home — and the new account must read as unresolved, not as empty.
    await waitFor(() => expect(auth.accountStatus).toBe('loading'));
    expect(auth.user).toBeNull();
    expect(auth.accountContext).toBeNull();

    await act(async () => {
      pending.resolve(NO_ORG_CONTEXT);
    });
    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
    expect(auth.user).toBeNull();
  });

  it('keeps the current session visible while the same account refreshes', async () => {
    mockFetchAccountContext.mockResolvedValue(ORG_MEMBER_CONTEXT);
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();
    await waitFor(() => expect(auth.user?.supabaseProfileId).toBe('profile-1'));

    const pending = deferredContext();
    act(() => {
      void auth.refreshAccountContext();
    });
    await waitFor(() => expect(auth.accountStatus).toBe('loading'));
    // Same account: no reason to blank the app out from under the user.
    expect(auth.user?.supabaseProfileId).toBe('profile-1');

    await act(async () => {
      pending.resolve(ORG_MEMBER_CONTEXT);
    });
    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
  });

  it('can clear the current scope before a same-account access-loss refresh', async () => {
    mockFetchAccountContext.mockResolvedValue(ORG_MEMBER_CONTEXT);
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();
    await waitFor(() => expect(auth.user?.supabaseProfileId).toBe('profile-1'));

    const pending = deferredContext();
    act(() => {
      void auth.refreshAccountContext({ clearCurrentScope: true });
    });

    await waitFor(() => expect(auth.accountStatus).toBe('loading'));
    expect(auth.user).toBeNull();
    expect(auth.accountContext).toBeNull();

    await act(async () => {
      pending.resolve({
        ...NO_ORG_CONTEXT,
        account: { ...NO_ORG_CONTEXT.account, auth_user_id: 'auth-1' },
      });
    });
    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
  });

  it('returns to idle on sign-out', async () => {
    mockFetchAccountContext.mockResolvedValue(ORG_MEMBER_CONTEXT);
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
    renderAuth();
    await waitFor(() => expect(auth.accountStatus).toBe('ready'));

    await act(async () => auth.signOut());

    expect(auth.accountStatus).toBe('idle');
    expect(auth.accountContext).toBeNull();
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });
});

describe('Leave organisation account transitions', () => {
  beforeEach(() => {
    mockFetchAccountContext.mockResolvedValue(ORG_MEMBER_CONTEXT);
    getSessionMock.mockResolvedValue({ data: { session: { user: AUTH_USER } } });
  });

  it('drops old organisation data/channels before the resulting account context resolves', async () => {
    renderAuth();
    await waitFor(() => expect(auth.user?.supabaseProfileId).toBe('profile-1'));

    const pending = deferredContext();
    act(() => {
      void auth.leaveOrganisation();
    });

    await waitFor(() => expect(mockLeaveOrganisation).toHaveBeenCalledTimes(1));
    expect(auth.accountStatus).toBe('loading');
    expect(auth.user).toBeNull();
    expect(auth.accountContext).toBeNull();

    await act(async () => pending.resolve(NO_ORG_CONTEXT));
    await waitFor(() => expect(auth.accountStatus).toBe('ready'));
  });

  it('boots one remaining active organisation directly into its Home scope', async () => {
    renderAuth();
    await waitFor(() => expect(auth.user?.supabaseProfileId).toBe('profile-1'));
    const remaining = {
      account: { ...ORG_MEMBER_CONTEXT.account, active_profile_id: 'profile-2' },
      organisations: [
        { profile: { id: 'profile-2', full_name: 'Member Two' }, organisation: { id: 'org-2', name: 'Second Church' } },
      ],
    };
    mockFetchAccountContext.mockResolvedValue(remaining);
    await act(async () => auth.leaveOrganisation());
    expect(auth.accountStatus).toBe('ready');
    expect(auth.user?.supabaseProfileId).toBe('profile-2');
  });

  it('keeps several remaining organisations unresolved for the existing selector', async () => {
    renderAuth();
    await waitFor(() => expect(auth.user?.supabaseProfileId).toBe('profile-1'));
    mockFetchAccountContext.mockResolvedValue({
      account: { ...ORG_MEMBER_CONTEXT.account, active_profile_id: null },
      organisations: [
        { profile: { id: 'profile-2', full_name: 'Two' }, organisation: { id: 'org-2', name: 'Two' } },
        { profile: { id: 'profile-3', full_name: 'Three' }, organisation: { id: 'org-3', name: 'Three' } },
      ],
    });
    await act(async () => auth.leaveOrganisation());
    expect(auth.accountStatus).toBe('ready');
    expect(auth.user).toBeNull();
    expect(auth.accountContext?.organisations).toHaveLength(2);
  });

  it('reaches the genuine no-organisation state after leaving the last organisation', async () => {
    renderAuth();
    await waitFor(() => expect(auth.user?.supabaseProfileId).toBe('profile-1'));
    mockFetchAccountContext.mockResolvedValue({ ...NO_ORG_CONTEXT, account: { ...NO_ORG_CONTEXT.account, auth_user_id: 'auth-1' } });
    await act(async () => auth.leaveOrganisation());
    expect(auth.accountStatus).toBe('ready');
    expect(auth.user).toBeNull();
    expect(auth.accountContext?.organisations).toHaveLength(0);
  });
});
