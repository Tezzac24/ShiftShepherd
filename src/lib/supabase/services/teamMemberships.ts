/** Narrow add/remove service for live Team Membership Management V1. */
import { SupabaseClient } from '@supabase/supabase-js';

import { TeamMembership, TeamRole } from '../../../types';
import { getSupabase } from '../client';

export const TEAM_MEMBERSHIP_DEMO_ERROR =
  'Member management is available with your church account.';
export const TEAM_MEMBERSHIP_PERMISSION_ERROR =
  'You do not have permission to manage members of this team.';
export const TEAM_MEMBERSHIP_TEAM_NOT_FOUND_ERROR =
  "We couldn't find that team right now.";
export const TEAM_MEMBERSHIP_ARCHIVED_ERROR =
  'Restore this team before adding members.';
export const TEAM_MEMBERSHIP_PROFILE_NOT_ELIGIBLE_ERROR =
  'That person is not available to add to this team.';
export const TEAM_MEMBERSHIP_ALREADY_MEMBER_ERROR =
  'That person is already a member of this team.';
export const TEAM_MEMBERSHIP_NOT_FOUND_ERROR =
  'That person is no longer a member of this team.';
export const TEAM_MEMBERSHIP_LEADER_ERROR =
  'Another team admin cannot be removed by a team admin in this version.';
export const TEAM_MEMBERSHIP_FINAL_ADMIN_ERROR =
  'This is the final team admin. Another team admin must be appointed before they can be removed.';
export const TEAM_MEMBERSHIP_SELF_REMOVAL_ERROR =
  'Use Leave Team from the team page to remove your own membership.';
export const TEAM_MEMBERSHIP_LEAVE_FINAL_ADMIN_ERROR =
  'Another team admin must be appointed before you can leave.';
export const TEAM_MEMBERSHIP_OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";
export const TEAM_MEMBERSHIP_SETUP_ERROR =
  'Member management is not switched on for your church yet. Please try again after the next update.';

const ADD_ERROR = "We couldn't add this person right now. Please try again.";
const REMOVE_ERROR = "We couldn't remove this person right now. Please try again.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TeamMembershipMutationInput {
  teamId: string;
  profileId: string;
}

export interface LeaveTeamInput {
  teamId: string;
}

interface TeamMembershipRpcRow {
  membership_id: string;
  team_id: string;
  profile_id: string;
  role: TeamRole;
  created_at: string;
}

function assertLiveIds({ teamId, profileId }: TeamMembershipMutationInput): void {
  if (!UUID_PATTERN.test(teamId) || !UUID_PATTERN.test(profileId)) {
    throw new Error(TEAM_MEMBERSHIP_DEMO_ERROR);
  }
}

function assertLiveTeamId(teamId: string): void {
  if (!UUID_PATTERN.test(teamId)) throw new Error(TEAM_MEMBERSHIP_DEMO_ERROR);
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(TEAM_MEMBERSHIP_OFFLINE_ERROR);
  return supabase;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isMissingFunctionError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = messageOf(error);
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|function .* does not exist/i.test(message)
  );
}

function friendlyError(operation: 'add' | 'remove' | 'leave', error: unknown): Error {
  const message = messageOf(error);
  const known = [
    TEAM_MEMBERSHIP_DEMO_ERROR,
    TEAM_MEMBERSHIP_PERMISSION_ERROR,
    TEAM_MEMBERSHIP_TEAM_NOT_FOUND_ERROR,
    TEAM_MEMBERSHIP_ARCHIVED_ERROR,
    TEAM_MEMBERSHIP_PROFILE_NOT_ELIGIBLE_ERROR,
    TEAM_MEMBERSHIP_ALREADY_MEMBER_ERROR,
    TEAM_MEMBERSHIP_NOT_FOUND_ERROR,
    TEAM_MEMBERSHIP_LEADER_ERROR,
    TEAM_MEMBERSHIP_FINAL_ADMIN_ERROR,
    TEAM_MEMBERSHIP_SELF_REMOVAL_ERROR,
    TEAM_MEMBERSHIP_LEAVE_FINAL_ADMIN_ERROR,
    TEAM_MEMBERSHIP_OFFLINE_ERROR,
    TEAM_MEMBERSHIP_SETUP_ERROR,
  ];
  if (error instanceof Error && known.includes(error.message)) return error;
  if (isMissingFunctionError(error)) return new Error(TEAM_MEMBERSHIP_SETUP_ERROR);
  if (/fetch|network|timeout/i.test(message)) return new Error(TEAM_MEMBERSHIP_OFFLINE_ERROR);
  if (/NOT_AUTHORISED|NO_LINKED_PROFILE|permission|row-level security/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_PERMISSION_ERROR);
  }
  if (/TEAM_NOT_FOUND/i.test(message)) return new Error(TEAM_MEMBERSHIP_TEAM_NOT_FOUND_ERROR);
  if (/TEAM_ARCHIVED/i.test(message)) return new Error(TEAM_MEMBERSHIP_ARCHIVED_ERROR);
  if (/PROFILE_NOT_ELIGIBLE/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_PROFILE_NOT_ELIGIBLE_ERROR);
  }
  if (/ALREADY_MEMBER|duplicate key|team_memberships_team_id_user_id_key/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_ALREADY_MEMBER_ERROR);
  }
  if (/MEMBERSHIP_NOT_FOUND/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_NOT_FOUND_ERROR);
  }
  if (/PEER_TEAM_ADMIN_REMOVAL_BLOCKED|TEAM_LEADER_REMOVAL_BLOCKED/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_LEADER_ERROR);
  }
  if (/FINAL_TEAM_ADMIN_REMOVAL_BLOCKED/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_FINAL_ADMIN_ERROR);
  }
  if (/SELF_REMOVAL_USE_LEAVE_TEAM|SELF_REMOVAL_BLOCKED/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_SELF_REMOVAL_ERROR);
  }
  if (/FINAL_TEAM_ADMIN_LEAVE_BLOCKED/i.test(message)) {
    return new Error(TEAM_MEMBERSHIP_LEAVE_FINAL_ADMIN_ERROR);
  }
  return new Error(operation === 'add' ? ADD_ERROR : operation === 'remove' ? REMOVE_ERROR : "We couldn't leave this team right now. Please try again.");
}

function toMembership(
  value: unknown,
  expected: { teamId: string; profileId?: string },
): TeamMembership {
  const row = (Array.isArray(value) ? value[0] : value) as TeamMembershipRpcRow | null;
  if (
    !row ||
    row.team_id !== expected.teamId ||
    (expected.profileId !== undefined && row.profile_id !== expected.profileId) ||
    !row.membership_id ||
    !UUID_PATTERN.test(row.profile_id) ||
    !['member', 'team_leader'].includes(row.role)
  ) {
    throw new Error('INVALID_MEMBERSHIP_RESPONSE');
  }
  return {
    id: row.membership_id,
    team_id: row.team_id,
    user_id: row.profile_id,
    role: row.role,
    created_at: row.created_at,
  };
}

/** Add one existing linked profile as an ordinary member. Caller authority is server-derived. */
export async function addTeamMember(
  input: TeamMembershipMutationInput,
): Promise<TeamMembership> {
  try {
    assertLiveIds(input);
    const { data, error } = await requireClient().rpc('add_team_member', {
      p_team_id: input.teamId,
      p_profile_id: input.profileId,
    });
    if (error) throw error;
    return toMembership(data, input);
  } catch (error) {
    console.warn('[teamMemberships] add failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendlyError('add', error);
  }
}

/** Remove exactly one ordinary membership. Profiles, Auth users, and roles are untouched. */
export async function removeTeamMember(
  input: TeamMembershipMutationInput,
): Promise<TeamMembership> {
  try {
    assertLiveIds(input);
    const { data, error } = await requireClient().rpc('remove_team_member', {
      p_team_id: input.teamId,
      p_profile_id: input.profileId,
    });
    if (error) throw error;
    return toMembership(data, input);
  } catch (error) {
    console.warn('[teamMemberships] remove failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendlyError('remove', error);
  }
}

/** Leave one team as the authenticated caller; caller identity and role are server-derived. */
export async function leaveTeam(input: LeaveTeamInput): Promise<TeamMembership> {
  try {
    assertLiveTeamId(input.teamId);
    const { data, error } = await requireClient().rpc('leave_team', {
      p_team_id: input.teamId,
    });
    if (error) throw error;
    return toMembership(data, { teamId: input.teamId });
  } catch (error) {
    console.warn('[teamMemberships] leave failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendlyError('leave', error);
  }
}
