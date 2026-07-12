import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { AuthProvider, SIGN_OUT_ERROR, useAuth } from '../AuthContext';
import * as pendingInvitation from '../../invitations/pendingInvitation';

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

beforeEach(() => {
  jest.clearAllMocks();
  signOutMock.mockResolvedValue({ error: null });
});

// clearMocks does not undo spyOn implementations — restore so a stubbed
// cleanup failure cannot leak into the next test.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('sign-out', () => {
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
    await renderSignedIn();
    await act(async () => {
      await Promise.all([auth.signOut(), auth.signOut()]);
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(auth.isAuthenticated).toBe(false);
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
