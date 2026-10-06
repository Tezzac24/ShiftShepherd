import React from 'react';
import { render } from '@testing-library/react-native';

import { useAuth } from '../../../lib/auth/AuthContext';
import { AccountContext, SessionUser } from '../../../types';
import { ChurchEntryPresentationProvider } from '../ChurchEntryPresentation';

export type AuthState = ReturnType<typeof useAuth>;
export const church = (id: string, name: string): AccountContext['organisations'][number] => ({
  organisation: { id: `org-${id}`, name },
  profile: { id, organisation_id: `org-${id}`, auth_user_id: 'account-a', full_name: 'Alex Member', email: 'alex@example.com',
    phone: null, avatar_url: null, display_name_override: null, created_at: '2026-01-01', access_status: 'active',
    access_removed_at: null, access_removed_by: null, access_removal_reason: null },
});
export const alpha = church('profile-a', 'Grace Community Church');
export const beta = church('profile-b', 'A very long church name that should remain readable in full');
export const gamma = church('profile-c', 'Another church');
export const session = (entry = alpha): SessionUser => ({ profile: entry.profile, supabaseProfileId: entry.profile.id, orgRole: 'general_member', memberships: [] });
export function authState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    authMode: 'supabase', isAuthenticated: true, isLoading: false, accountStatus: 'ready', user: null,
    authIdentity: { id: 'account-a', email: 'alex@example.com', emailVerified: true, suggestedName: 'Alex Member' },
    accountContext: { account: { auth_user_id: 'account-a', global_display_name: 'Alex Member', name_confirmed_at: '2026-01-01', active_profile_id: null }, organisations: [] },
    pendingInvitationToken: null, createOrganisation: jest.fn().mockResolvedValue(undefined), switchOrganisation: jest.fn().mockResolvedValue(undefined),
    refreshAccountContext: jest.fn().mockResolvedValue(undefined), setGlobalDisplayName: jest.fn().mockResolvedValue(undefined), signOut: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as AuthState;
}
export function linked(state: AuthState, entries = [alpha, beta], active = alpha): AuthState {
  return { ...state, user: session(active), accountContext: { ...state.accountContext!,
    account: { ...state.accountContext!.account, active_profile_id: active.profile.id }, organisations: entries } };
}

/** Mirrors the actual profile-keyed root boundary while the presentation provider survives. */
export function renderEntry(child: React.ReactNode, initial: AuthState) {
  const mockAuth = useAuth as jest.Mock;
  function Root({ state }: { state: AuthState }) {
    mockAuth.mockReturnValue(state);
    return <ChurchEntryPresentationProvider>
      <React.Fragment key={state.user?.profile.id ?? 'no-organisation'}>{React.isValidElement(child) ? React.cloneElement(child) : child}</React.Fragment>
    </ChurchEntryPresentationProvider>;
  }
  const view = render(<Root state={initial} />);
  return { ...view, update: (state: AuthState) => view.rerender(<Root state={state} />) };
}
