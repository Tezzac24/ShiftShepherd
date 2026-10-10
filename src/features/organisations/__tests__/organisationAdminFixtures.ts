import { useAuth } from '../../../lib/auth/AuthContext';
import { OrganisationMemberSummary, SessionUser, UserProfile } from '../../../types';

export const ORGANISATION_ID = '10000000-0000-4000-a000-000000000001';
export const PROFILE: UserProfile = {
  id: '20000000-0000-4000-a000-000000000001', auth_user_id: '90000000-0000-4000-a000-000000000001',
  organisation_id: ORGANISATION_ID, full_name: 'Daniel Okafor', email: 'daniel@example.church', phone: null,
  avatar_url: null, access_status: 'active', access_removed_at: null, access_removed_by: null,
  access_removal_reason: null, created_at: '',
};
export const ADMIN: SessionUser = { profile: PROFILE, orgRole: 'church_admin', memberships: [], supabaseProfileId: PROFILE.id };
export const CURRENT: OrganisationMemberSummary = {
  profile_id: PROFILE.id, full_name: PROFILE.full_name, email: PROFILE.email, avatar_url: null,
  access_status: 'active', access_removed_at: null, access_removal_reason: null, linked: true,
  role: 'church_admin', team_count: 1, pending_invitation_status: null, is_current_user: true, is_last_church_admin: false,
};
export const MEMBER: OrganisationMemberSummary = { ...CURRENT, profile_id: '20000000-0000-4000-a000-000000000002',
  full_name: 'Ruth Johnson', email: 'ruth@example.church', role: 'general_member', team_count: 0, is_current_user: false };
export const DIRECTORY: OrganisationMemberSummary = { ...MEMBER, profile_id: '20000000-0000-4000-a000-000000000003',
  full_name: 'Alex Morgan', email: 'alex@example.com', linked: false };
export const REMOVED: OrganisationMemberSummary = { ...DIRECTORY, profile_id: '20000000-0000-4000-a000-000000000004',
  full_name: 'Former Member', email: 'former@example.com', linked: true, access_status: 'removed', role: null };
export function memberProfile(member: OrganisationMemberSummary): UserProfile {
  return { ...PROFILE, id: member.profile_id, full_name: member.full_name, email: member.email,
    access_status: member.access_status, auth_user_id: member.linked ? `account-${member.profile_id}` : '' };
}
export function adminAuth(user = ADMIN, overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return { authMode: 'supabase', user, isAuthenticated: true, isLoading: false, accountStatus: 'ready',
    authIdentity: { id: user.profile.auth_user_id, email: user.profile.email, emailVerified: true, suggestedName: null },
    accountContext: { account: { auth_user_id: user.profile.auth_user_id, global_display_name: user.profile.full_name,
      name_confirmed_at: '2026-01-01', active_profile_id: user.profile.id }, organisations: [{ profile: user.profile,
      organisation: { id: user.profile.organisation_id, name: 'Grace Church' } }] },
    refreshAccountContext: jest.fn().mockResolvedValue(undefined), ...overrides };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
