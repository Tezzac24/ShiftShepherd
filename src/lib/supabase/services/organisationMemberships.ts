/** Narrow organisation member/role lifecycle service for linked Supabase sessions. */
import { SupabaseClient } from '@supabase/supabase-js';

import {
  OrganisationAccessMutationResult,
  OrganisationAccessRemovalReason,
  OrganisationAccessStatus,
  OrganisationAccessTransition,
  OrganisationInvitationStatus,
  OrganisationMemberSummary,
  OrganisationRoleName,
} from '../../../types';
import { getSupabase } from '../client';

export const ORGANISATION_MEMBERSHIP_PERMISSION_ERROR =
  'Only a church admin can manage organisation members and roles.';
export const ORGANISATION_MEMBERSHIP_LAST_ADMIN_ERROR =
  'Another church admin must be appointed before this change can be made.';
export const ORGANISATION_MEMBERSHIP_MEMBER_NOT_FOUND_ERROR =
  'That person is not available in this organisation.';
export const ORGANISATION_MEMBERSHIP_MEMBER_NOT_LINKED_ERROR =
  'That person needs to accept an invitation before their access or role can be managed.';
export const ORGANISATION_MEMBERSHIP_ALREADY_REMOVED_ERROR =
  'That person no longer has access to this organisation.';
export const ORGANISATION_MEMBERSHIP_SELF_REMOVAL_ERROR =
  'Use Leave organisation from your Profile to remove your own access.';
export const ORGANISATION_MEMBERSHIP_INVALID_ROLE_ERROR =
  'Choose one of the available organisation roles.';
export const ORGANISATION_MEMBERSHIP_CONFLICT_ERROR =
  'Someone else changed organisation access at the same time. Refresh and try again.';
export const ORGANISATION_MEMBERSHIP_OFFLINE_ERROR =
  'We couldn’t reach the server. Please check your connection and try again.';
export const ORGANISATION_MEMBERSHIP_SETUP_ERROR =
  'Organisation member management is not switched on for your church yet.';

const LOAD_ERROR = 'We couldn’t load organisation members right now. Please try again.';
const ROLE_ERROR = 'We couldn’t update that role right now. Please try again.';
const REMOVE_ERROR = 'We couldn’t remove that organisation access right now. Please try again.';
const LEAVE_ERROR = 'We couldn’t leave this organisation right now. Please try again.';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES: OrganisationRoleName[] = [
  'church_admin',
  'announcement_manager',
  'event_manager',
  'general_member',
];

interface MemberRpcRow {
  profile_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  access_status: OrganisationAccessStatus;
  access_removed_at: string | null;
  access_removal_reason: OrganisationAccessRemovalReason | null;
  linked: boolean;
  role: OrganisationRoleName | null;
  team_count: number;
  pending_invitation_status: OrganisationInvitationStatus | null;
  is_current_user: boolean;
  is_last_church_admin: boolean;
}

interface AccessMutationRpcRow {
  profile_id: string;
  access_status: 'removed';
  active_profile_id: string | null;
  remaining_profile_count: number;
  transition: OrganisationAccessTransition;
}

function requireClient(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error(ORGANISATION_MEMBERSHIP_OFFLINE_ERROR);
  return client;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isMissingFunction(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|function .* does not exist/i.test(messageOf(error))
  );
}

function friendly(error: unknown, fallback: string): Error {
  const message = messageOf(error);
  const known = [
    ORGANISATION_MEMBERSHIP_PERMISSION_ERROR,
    ORGANISATION_MEMBERSHIP_LAST_ADMIN_ERROR,
    ORGANISATION_MEMBERSHIP_MEMBER_NOT_FOUND_ERROR,
    ORGANISATION_MEMBERSHIP_MEMBER_NOT_LINKED_ERROR,
    ORGANISATION_MEMBERSHIP_ALREADY_REMOVED_ERROR,
    ORGANISATION_MEMBERSHIP_SELF_REMOVAL_ERROR,
    ORGANISATION_MEMBERSHIP_INVALID_ROLE_ERROR,
    ORGANISATION_MEMBERSHIP_CONFLICT_ERROR,
    ORGANISATION_MEMBERSHIP_OFFLINE_ERROR,
    ORGANISATION_MEMBERSHIP_SETUP_ERROR,
  ];
  if (error instanceof Error && known.includes(error.message)) return error;
  if (isMissingFunction(error)) return new Error(ORGANISATION_MEMBERSHIP_SETUP_ERROR);
  if (/fetch|network|timeout/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_OFFLINE_ERROR);
  }
  if (/NOT_AUTHENTICATED|NOT_AUTHORISED|permission|row-level security/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_PERMISSION_ERROR);
  }
  if (/LAST_CHURCH_ADMIN/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_LAST_ADMIN_ERROR);
  }
  if (/MEMBER_NOT_FOUND/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_MEMBER_NOT_FOUND_ERROR);
  }
  if (/MEMBER_NOT_LINKED/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_MEMBER_NOT_LINKED_ERROR);
  }
  if (/ALREADY_REMOVED|ORGANISATION_ACCESS_REMOVED/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_ALREADY_REMOVED_ERROR);
  }
  if (/CANNOT_REMOVE_SELF_HERE/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_SELF_REMOVAL_ERROR);
  }
  if (/INVALID_ROLE|invalid input value for enum/i.test(message)) {
    return new Error(ORGANISATION_MEMBERSHIP_INVALID_ROLE_ERROR);
  }
  if (
    ['40001', '40P01', '55P03'].includes((error as { code?: string })?.code ?? '') ||
    /serialization|deadlock|lock timeout/i.test(message)
  ) {
    return new Error(ORGANISATION_MEMBERSHIP_CONFLICT_ERROR);
  }
  return new Error(fallback);
}

function assertProfileId(profileId: string): void {
  if (!UUID_PATTERN.test(profileId)) {
    throw new Error(ORGANISATION_MEMBERSHIP_MEMBER_NOT_FOUND_ERROR);
  }
}

function mapMember(row: MemberRpcRow): OrganisationMemberSummary {
  if (
    !UUID_PATTERN.test(row.profile_id) ||
    !row.full_name ||
    !row.email ||
    !['active', 'removed'].includes(row.access_status) ||
    (row.role !== null && !ROLES.includes(row.role)) ||
    !Number.isInteger(Number(row.team_count))
  ) {
    throw new Error('INVALID_ORGANISATION_MEMBER_RESPONSE');
  }
  return { ...row, team_count: Number(row.team_count) };
}

function mapAccessMutation(value: unknown, expectedProfileId?: string): OrganisationAccessMutationResult {
  const row = (Array.isArray(value) ? value[0] : value) as AccessMutationRpcRow | null;
  const transitions: OrganisationAccessTransition[] = [
    'active_unchanged',
    'selected_remaining',
    'choose_organisation',
    'no_organisations',
  ];
  if (
    !row ||
    !UUID_PATTERN.test(row.profile_id) ||
    (expectedProfileId && row.profile_id !== expectedProfileId) ||
    row.access_status !== 'removed' ||
    !Number.isInteger(Number(row.remaining_profile_count)) ||
    !transitions.includes(row.transition)
  ) {
    throw new Error('INVALID_ORGANISATION_ACCESS_RESPONSE');
  }
  return { ...row, remaining_profile_count: Number(row.remaining_profile_count) };
}

export async function listOrganisationMembers(
  search = '',
): Promise<OrganisationMemberSummary[]> {
  try {
    const { data, error } = await requireClient().rpc('list_organisation_members', {
      p_search: search.trim() || null,
      p_limit: 200,
    });
    if (error) throw error;
    return ((data ?? []) as MemberRpcRow[]).map(mapMember);
  } catch (error) {
    console.warn('[organisationMemberships] list failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, LOAD_ERROR);
  }
}

export async function setOrganisationMemberRole(
  profileId: string,
  role: OrganisationRoleName,
): Promise<{ profile_id: string; role: OrganisationRoleName }> {
  try {
    assertProfileId(profileId);
    if (!ROLES.includes(role)) throw new Error(ORGANISATION_MEMBERSHIP_INVALID_ROLE_ERROR);
    const { data, error } = await requireClient().rpc('set_organisation_member_role', {
      p_profile_id: profileId,
      p_role: role,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as {
      profile_id?: string;
      role?: OrganisationRoleName;
    } | null;
    if (row?.profile_id !== profileId || !row.role || !ROLES.includes(row.role)) {
      throw new Error('INVALID_ORGANISATION_ROLE_RESPONSE');
    }
    return { profile_id: row.profile_id, role: row.role };
  } catch (error) {
    console.warn('[organisationMemberships] role update failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, ROLE_ERROR);
  }
}

export async function removeOrganisationMember(
  profileId: string,
): Promise<OrganisationAccessMutationResult> {
  try {
    assertProfileId(profileId);
    const { data, error } = await requireClient().rpc('remove_organisation_member', {
      p_profile_id: profileId,
    });
    if (error) throw error;
    return mapAccessMutation(data, profileId);
  } catch (error) {
    console.warn('[organisationMemberships] removal failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, REMOVE_ERROR);
  }
}

export async function leaveOrganisation(): Promise<OrganisationAccessMutationResult> {
  try {
    const { data, error } = await requireClient().rpc('leave_organisation');
    if (error) throw error;
    return mapAccessMutation(data);
  } catch (error) {
    console.warn('[organisationMemberships] leave failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, LEAVE_ERROR);
  }
}

