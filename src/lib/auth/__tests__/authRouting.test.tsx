import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import Index from '@/app/index';
import { AccountStatus, useAuth } from '@/src/lib/auth/AuthContext';
import { AccountContext, SessionUser } from '@/src/types';

/**
 * app/index.tsx is the single canonical hub for authentication routing: every
 * destination is resolved here, from auth state, as an absolute Expo Router
 * href. Screens must not race it with their own `router.replace`.
 */
const redirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    redirects.push(href);
    return null;
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/src/lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));

const mockUseAuth = useAuth as jest.Mock;
const refreshAccountContext = jest.fn();
const signOut = jest.fn();
const TOKEN = 'A'.repeat(43);

interface GateState {
  isLoading?: boolean;
  isAuthenticated?: boolean;
  authMode?: 'demo' | 'supabase' | null;
  accountStatus?: AccountStatus;
  user?: SessionUser | null;
  accountContext?: AccountContext | null;
  pendingInvitationToken?: string | null;
}

function account(activeProfileId: string | null, organisationCount: number): AccountContext {
  return {
    account: {
      auth_user_id: 'auth-1',
      global_display_name: 'Person',
      name_confirmed_at: null,
      active_profile_id: activeProfileId,
    },
    organisations: Array.from({ length: organisationCount }, (_, index) => ({
      profile: { id: `profile-${index + 1}` },
      organisation: { id: `org-${index + 1}`, name: `Church ${index + 1}` },
    })) as AccountContext['organisations'],
  };
}

const activeProfile = { supabaseProfileId: 'profile-1' } as SessionUser;

function applyState(state: GateState) {
  mockUseAuth.mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    authMode: null,
    accountStatus: 'idle' as AccountStatus,
    accountContext: null,
    pendingInvitationToken: null,
    refreshAccountContext,
    signOut,
    ...state,
  });
}

/** Renders the hub and reports the redirect it chose, or null if it chose to wait. */
function routeFor(state: GateState): string | null {
  redirects.length = 0;
  applyState(state);
  render(<Index />);
  expect(redirects.length).toBeLessThanOrEqual(1);
  return redirects[0] ?? null;
}

/** The signed-in-but-not-yet-resolved window that produced the bug. */
const RESOLVING: GateState = {
  isAuthenticated: true,
  authMode: 'supabase',
  accountStatus: 'loading',
  user: null,
  accountContext: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  refreshAccountContext.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
});

describe('resolved destinations', () => {
  it('sends signed-out users to the real login route', () => {
    expect(routeFor({ isAuthenticated: false })).toBe('/login');
  });

  it('sends signed-in users with an active profile into the app', () => {
    expect(
      routeFor({
        isAuthenticated: true,
        authMode: 'supabase',
        accountStatus: 'ready',
        user: activeProfile,
        accountContext: account('profile-1', 1),
      }),
    ).toBe('/(tabs)/home');
  });

  it('sends a resolved account with zero organisations to the no-organisation route', () => {
    expect(
      routeFor({
        isAuthenticated: true,
        authMode: 'supabase',
        accountStatus: 'ready',
        user: null,
        accountContext: account(null, 0),
      }),
    ).toBe('/no-organisations');
  });

  it('sends a resolved account with no valid active profile to the selector', () => {
    expect(
      routeFor({
        isAuthenticated: true,
        authMode: 'supabase',
        accountStatus: 'ready',
        user: null,
        accountContext: account(null, 2),
      }),
    ).toBe('/organisations/select');
  });

  it('returns a pending invitation to acceptance ahead of every other destination', () => {
    expect(routeFor({ isAuthenticated: false, pendingInvitationToken: TOKEN })).toBe(
      '/invite/accept',
    );
    expect(
      routeFor({
        isAuthenticated: true,
        authMode: 'supabase',
        accountStatus: 'ready',
        user: activeProfile,
        accountContext: account('profile-1', 1),
        pendingInvitationToken: TOKEN,
      }),
    ).toBe('/invite/accept');
    // ...and it still outranks an unresolved context, so the token is never lost
    // behind a loading screen.
    expect(routeFor({ ...RESOLVING, pendingInvitationToken: TOKEN })).toBe('/invite/accept');
  });

  it('only ever resolves absolute, registered destinations', () => {
    const everyDestination = [
      routeFor({ isAuthenticated: false }),
      routeFor({ ...RESOLVING, accountStatus: 'ready', user: activeProfile }),
      routeFor({ ...RESOLVING, accountStatus: 'ready', accountContext: account(null, 0) }),
      routeFor({ isAuthenticated: false, pendingInvitationToken: TOKEN }),
    ];
    for (const href of everyDestination) {
      expect(href).not.toBeNull();
      expect(href!.startsWith('/')).toBe(true);
      expect(href!.startsWith('.')).toBe(false); // never "." / "./index" / ".index"
      expect(href).not.toContain('index');
    }
  });
});

/**
 * The reported regression. On interactive sign-in the session becomes
 * authenticated the moment the auth identity lands, but the organisation context
 * is still in flight. `accountContext` is null in that window — and null used to
 * mean "no organisations", so an organisation member was routed to
 * "No organisations yet". A cold launch got it right only because the startup
 * gate happened to hold the router back until bootstrap finished.
 */
describe('account bootstrap race', () => {
  it('waits instead of guessing while the account context is unresolved', () => {
    expect(routeFor(RESOLVING)).toBeNull();
    expect(redirects).not.toContain('/no-organisations');
    expect(screen.getByText('Loading your organisation...')).toBeTruthy();
  });

  it('never treats an unresolved context as an empty one, whatever the status', () => {
    for (const accountStatus of ['idle', 'loading'] as AccountStatus[]) {
      expect(routeFor({ ...RESOLVING, accountStatus })).toBeNull();
      expect(redirects).not.toContain('/no-organisations');
    }
  });

  it('reaches Home as soon as the context resolves — no reload needed', () => {
    // The exact sign-in sequence: authenticated first, resolved a moment later.
    expect(routeFor(RESOLVING)).toBeNull();
    expect(
      routeFor({ ...RESOLVING, accountStatus: 'ready', user: activeProfile }),
    ).toBe('/(tabs)/home');
  });

  it('routes a genuine no-organisation account only after its context resolves', () => {
    expect(routeFor(RESOLVING)).toBeNull();
    expect(
      routeFor({ ...RESOLVING, accountStatus: 'ready', accountContext: account(null, 0) }),
    ).toBe('/no-organisations');
  });

  it('gives interactive sign-in and cold launch the same final route', () => {
    const resolved: GateState = {
      ...RESOLVING,
      accountStatus: 'ready',
      user: activeProfile,
      accountContext: account('profile-1', 1),
    };
    // Cold launch: the auth bootstrap gate holds first, then resolves.
    expect(routeFor({ ...resolved, isLoading: true })).toBeNull();
    const coldLaunch = routeFor(resolved);
    // Interactive sign-in: authenticated, unresolved, then resolved.
    expect(routeFor(RESOLVING)).toBeNull();
    const interactive = routeFor(resolved);

    expect(interactive).toBe(coldLaunch);
    expect(interactive).toBe('/(tabs)/home');
  });
});

describe('account bootstrap failure', () => {
  it('shows a bounded retry instead of claiming the account has no organisations', () => {
    expect(routeFor({ ...RESOLVING, accountStatus: 'error' })).toBeNull();
    expect(redirects).not.toContain('/no-organisations');
    expect(screen.getByText('We couldn’t load your account')).toBeTruthy();
  });

  it('retries the account bootstrap rather than re-authenticating', async () => {
    routeFor({ ...RESOLVING, accountStatus: 'error' });
    await act(async () => fireEvent.press(screen.getByText('Try again')));
    expect(refreshAccountContext).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('stays on the retry screen when the retry also fails', async () => {
    refreshAccountContext.mockRejectedValue(new Error('still offline'));
    routeFor({ ...RESOLVING, accountStatus: 'error' });
    await act(async () => fireEvent.press(screen.getByText('Try again')));
    expect(screen.getByText('We couldn’t load your account')).toBeTruthy();
    expect(redirects).not.toContain('/no-organisations');
  });

  it('offers sign-out as the escape hatch', async () => {
    routeFor({ ...RESOLVING, accountStatus: 'error' });
    await act(async () => fireEvent.press(screen.getByText('Sign out')));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('does not leak the underlying failure to the user', () => {
    routeFor({ ...RESOLVING, accountStatus: 'error' });
    expect(screen.queryByText(/supabase|postgres|PGRST|JWT/i)).toBeNull();
  });
});

describe('demo mode', () => {
  it('routes a demo session home without waiting on a live account context', () => {
    expect(
      routeFor({ isAuthenticated: true, authMode: 'demo', user: activeProfile }),
    ).toBe('/(tabs)/home');
  });
});
