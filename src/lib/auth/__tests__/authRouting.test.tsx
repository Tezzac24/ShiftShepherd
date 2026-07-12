import { render } from '@testing-library/react-native';
import React from 'react';

import Index from '@/app/index';
import { useAuth } from '@/src/lib/auth/AuthContext';
import { AccountContext, SessionUser } from '@/src/types';

/**
 * app/index.tsx is the single canonical hub for authentication routing: every
 * signed-in/signed-out destination is resolved here, from auth state, as an
 * absolute Expo Router href. Screens must not race it with their own
 * `router.replace`.
 */
const redirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    redirects.push(href);
    return null;
  },
}));
jest.mock('@/src/lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));

const mockUseAuth = useAuth as jest.Mock;
const TOKEN = 'A'.repeat(43);

function destinationFor(state: Partial<ReturnType<typeof useAuth>>): string {
  redirects.length = 0;
  mockUseAuth.mockReturnValue({
    user: null,
    isAuthenticated: false,
    accountContext: null,
    pendingInvitationToken: null,
    ...state,
  });
  render(<Index />);
  expect(redirects).toHaveLength(1);
  return redirects[0];
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
const oneOrganisation = account('profile-1', 1);
const noOrganisations = account(null, 0);

it('sends signed-out users to the real login route', () => {
  expect(destinationFor({ isAuthenticated: false })).toBe('/login');
});

it('sends signed-in users with an active profile into the app', () => {
  expect(
    destinationFor({ isAuthenticated: true, user: activeProfile, accountContext: oneOrganisation }),
  ).toBe('/(tabs)/home');
});

it('sends signed-in users with no organisation to the no-organisation route', () => {
  expect(
    destinationFor({ isAuthenticated: true, user: null, accountContext: noOrganisations }),
  ).toBe('/no-organisations');
});

it('sends signed-in users with organisations but no active profile to the selector', () => {
  expect(
    destinationFor({ isAuthenticated: true, user: null, accountContext: account(null, 2) }),
  ).toBe('/organisations/select');
});

it('returns a pending invitation to acceptance ahead of every other destination', () => {
  expect(destinationFor({ isAuthenticated: false, pendingInvitationToken: TOKEN })).toBe(
    '/invite/accept',
  );
  expect(
    destinationFor({
      isAuthenticated: true,
      user: activeProfile,
      accountContext: oneOrganisation,
      pendingInvitationToken: TOKEN,
    }),
  ).toBe('/invite/accept');
});

// The reported regression: a REPLACE aimed at ".index" (an unregistered route
// name) rather than a registered, absolute destination.
it('only ever resolves absolute, registered destinations', () => {
  const everyDestination = [
    destinationFor({ isAuthenticated: false }),
    destinationFor({ isAuthenticated: true, user: activeProfile, accountContext: oneOrganisation }),
    destinationFor({ isAuthenticated: true, accountContext: noOrganisations }),
    destinationFor({ isAuthenticated: false, pendingInvitationToken: TOKEN }),
  ];
  for (const href of everyDestination) {
    expect(href.startsWith('/')).toBe(true);
    expect(href.startsWith('.')).toBe(false); // never "." / "./index" / ".index"
    expect(href).not.toContain('index');
  }
});
