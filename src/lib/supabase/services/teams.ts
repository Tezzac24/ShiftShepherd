/**
 * Live people/team directory and church-admin team lifecycle service.
 *
 * Directory reads stay RLS-scoped. Team create/update/archive/restore writes
 * use narrow SECURITY DEFINER RPCs that derive Auth identity, active profile,
 * organisation, and church-admin authority entirely on the server.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import {
  Organisation,
  OrganisationRoleName,
  Team,
  TeamMembership,
  TeamRole,
  TeamType,
  UserProfile,
} from '../../../types';
import { getSupabase } from '../client';

export const TEAM_NAME_MAX_LENGTH = 100;
export const TEAM_DESCRIPTION_MAX_LENGTH = 500;

export const TEAM_LIFECYCLE_DEMO_ERROR =
  'Team management is available with your church account.';
export const TEAM_LIFECYCLE_PERMISSION_ERROR =
  'Only a church admin can manage teams.';
export const TEAM_LIFECYCLE_NOT_FOUND_ERROR =
  "We couldn't find that team in your church right now.";
export const TEAM_LIFECYCLE_INVALID_NAME_ERROR =
  `Enter a team name between 1 and ${TEAM_NAME_MAX_LENGTH} characters.`;
export const TEAM_LIFECYCLE_INVALID_DESCRIPTION_ERROR =
  `Keep the team description to ${TEAM_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
export const TEAM_LIFECYCLE_INVALID_INITIAL_ADMIN_ERROR =
  'That person is no longer available to be the initial team admin. Choose someone else or create the team without one.';
export const TEAM_LIFECYCLE_ARCHIVED_ERROR =
  'Restore this team before changing it.';
export const TEAM_LIFECYCLE_ALREADY_ARCHIVED_ERROR =
  'This team has already been archived.';
export const TEAM_LIFECYCLE_NOT_ARCHIVED_ERROR =
  'This team is already active.';
export const TEAM_LIFECYCLE_CONFLICT_ERROR =
  'Something changed while you were saving. Please review the team and try again.';
export const TEAM_LIFECYCLE_OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";
export const TEAM_LIFECYCLE_SETUP_ERROR =
  'Team management is not switched on for your church yet. Please try again after the next update.';

const LOAD_ERROR = "We couldn't load your teams right now. Please try again.";
const CREATE_ERROR = "We couldn't create this team right now. Please try again.";
const UPDATE_ERROR = "We couldn't update this team right now. Please try again.";
const ARCHIVE_ERROR = "We couldn't archive this team right now. Please try again.";
const RESTORE_ERROR = "We couldn't restore this team right now. Please try again.";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Everything the app needs to render people/team context in live mode. */
export interface TeamsDirectory {
  organisation: Organisation | null;
  users: UserProfile[];
  /** Active plus archived metadata visible under RLS; selectors split them. */
  teams: Team[];
  memberships: TeamMembership[];
  currentOrgRole: OrganisationRoleName;
}

export interface CreateTeamInput {
  name: string;
  description: string | null;
  initialAdminProfileId: string | null;
}

export interface UpdateTeamInput {
  teamId: string;
  name: string;
  description: string | null;
}

export interface TeamCreationResult {
  team: Team;
  /** Exactly one row when an initial admin was selected; otherwise null. */
  initialAdminMembership: TeamMembership | null;
}

interface OrganisationRow {
  id: string;
  name: string;
  logo_url: string | null;
  primary_colour: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  organisation_id: string;
  full_name: string;
  display_name_override: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  access_status?: 'active' | 'removed';
  access_removed_at?: string | null;
  access_removed_by?: string | null;
  access_removal_reason?: 'admin_removed' | 'self_left' | null;
  created_at: string;
}

interface TeamRow {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  type: TeamType;
  avatar_url: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
}

interface MembershipRow {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  created_at: string;
}

interface TeamLifecycleRpcRow {
  team_id: string;
  organisation_id: string;
  team_name: string;
  team_description: string;
  team_type: TeamType;
  avatar_url: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  initial_admin_membership_id?: string | null;
  initial_admin_profile_id?: string | null;
  initial_admin_role?: TeamRole | null;
  initial_admin_created_at?: string | null;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(TEAM_LIFECYCLE_OFFLINE_ERROR);
  return supabase;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isNetworkError(error: unknown): boolean {
  return /fetch|network|timeout/i.test(messageOf(error));
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

function toAppProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id ?? '',
    organisation_id: row.organisation_id,
    full_name: row.full_name,
    display_name_override: row.display_name_override,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    access_status: row.access_status ?? 'active',
    access_removed_at: row.access_removed_at ?? null,
    access_removed_by: row.access_removed_by ?? null,
    access_removal_reason: row.access_removal_reason ?? null,
    created_at: row.created_at,
  };
}

function isTeamType(value: unknown): value is TeamType {
  return value === 'generic' || value === 'choir' || value === 'media';
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && UUID_PATTERN.test(value));
}

function toTeam(row: TeamLifecycleRpcRow, expectedTeamId?: string): Team {
  if (
    !UUID_PATTERN.test(row.team_id) ||
    (expectedTeamId !== undefined && row.team_id !== expectedTeamId) ||
    !UUID_PATTERN.test(row.organisation_id) ||
    typeof row.team_name !== 'string' ||
    !row.team_name.trim() ||
    row.team_name.length > TEAM_NAME_MAX_LENGTH ||
    typeof row.team_description !== 'string' ||
    row.team_description.length > TEAM_DESCRIPTION_MAX_LENGTH ||
    !isTeamType(row.team_type) ||
    (row.avatar_url !== null && typeof row.avatar_url !== 'string') ||
    (row.archived_at !== null && typeof row.archived_at !== 'string') ||
    !isNullableUuid(row.archived_by) ||
    typeof row.created_at !== 'string' ||
    !row.created_at
  ) {
    throw new Error('INVALID_TEAM_RESPONSE');
  }
  return {
    id: row.team_id,
    organisation_id: row.organisation_id,
    name: row.team_name,
    description: row.team_description,
    type: row.team_type,
    avatar_url: row.avatar_url,
    archived_at: row.archived_at,
    archived_by: row.archived_by,
    created_at: row.created_at,
  };
}

function oneRpcRow(data: unknown): TeamLifecycleRpcRow {
  const value = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  if (!value || typeof value !== 'object') throw new Error('INVALID_TEAM_RESPONSE');
  return value as TeamLifecycleRpcRow;
}

export function normaliseTeamDraft(input: Pick<CreateTeamInput, 'name' | 'description'>): {
  name: string;
  description: string | null;
} {
  const name = input.name.trim();
  const description = input.description?.trim() ?? '';
  if (!name || name.length > TEAM_NAME_MAX_LENGTH) {
    throw new Error(TEAM_LIFECYCLE_INVALID_NAME_ERROR);
  }
  if (description.length > TEAM_DESCRIPTION_MAX_LENGTH) {
    throw new Error(TEAM_LIFECYCLE_INVALID_DESCRIPTION_ERROR);
  }
  return { name, description: description || null };
}

type LifecycleOperation = 'create' | 'update' | 'archive' | 'restore';

function friendlyLifecycleError(operation: LifecycleOperation, error: unknown): Error {
  const message = messageOf(error);
  const known = [
    TEAM_LIFECYCLE_DEMO_ERROR,
    TEAM_LIFECYCLE_PERMISSION_ERROR,
    TEAM_LIFECYCLE_NOT_FOUND_ERROR,
    TEAM_LIFECYCLE_INVALID_NAME_ERROR,
    TEAM_LIFECYCLE_INVALID_DESCRIPTION_ERROR,
    TEAM_LIFECYCLE_INVALID_INITIAL_ADMIN_ERROR,
    TEAM_LIFECYCLE_ARCHIVED_ERROR,
    TEAM_LIFECYCLE_ALREADY_ARCHIVED_ERROR,
    TEAM_LIFECYCLE_NOT_ARCHIVED_ERROR,
    TEAM_LIFECYCLE_CONFLICT_ERROR,
    TEAM_LIFECYCLE_OFFLINE_ERROR,
    TEAM_LIFECYCLE_SETUP_ERROR,
  ];
  if (error instanceof Error && known.includes(error.message)) return error;
  if (isMissingFunctionError(error)) return new Error(TEAM_LIFECYCLE_SETUP_ERROR);
  if (isNetworkError(error)) return new Error(TEAM_LIFECYCLE_OFFLINE_ERROR);
  if (
    /NOT_AUTHENTICATED|NO_LINKED_PROFILE|ORGANISATION_ACCESS_REMOVED|NOT_AUTHORISED|permission|row-level security/i.test(
      message,
    )
  ) {
    return new Error(TEAM_LIFECYCLE_PERMISSION_ERROR);
  }
  if (/INVALID_TEAM_NAME/i.test(message)) return new Error(TEAM_LIFECYCLE_INVALID_NAME_ERROR);
  if (/INVALID_TEAM_DESCRIPTION/i.test(message)) {
    return new Error(TEAM_LIFECYCLE_INVALID_DESCRIPTION_ERROR);
  }
  if (/INVALID_INITIAL_ADMIN/i.test(message)) {
    return new Error(TEAM_LIFECYCLE_INVALID_INITIAL_ADMIN_ERROR);
  }
  if (/TEAM_ALREADY_ARCHIVED/i.test(message)) {
    return new Error(TEAM_LIFECYCLE_ALREADY_ARCHIVED_ERROR);
  }
  if (/TEAM_NOT_ARCHIVED/i.test(message)) return new Error(TEAM_LIFECYCLE_NOT_ARCHIVED_ERROR);
  if (/TEAM_ARCHIVED/i.test(message)) return new Error(TEAM_LIFECYCLE_ARCHIVED_ERROR);
  if (/TEAM_NOT_FOUND/i.test(message)) return new Error(TEAM_LIFECYCLE_NOT_FOUND_ERROR);
  if (/CONFLICT_RETRY/i.test(message) || ['40001', '40P01'].includes((error as { code?: string })?.code ?? '')) {
    return new Error(TEAM_LIFECYCLE_CONFLICT_ERROR);
  }
  return new Error(
    operation === 'create'
      ? CREATE_ERROR
      : operation === 'update'
        ? UPDATE_ERROR
        : operation === 'archive'
          ? ARCHIVE_ERROR
          : RESTORE_ERROR,
  );
}

function logLifecycleFailure(operation: LifecycleOperation, error: unknown): void {
  console.warn(`[teams] ${operation} failed`, {
    code: (error as { code?: string })?.code ?? 'unknown',
  });
}

/** Fetch the RLS-scoped people/teams directory for the current profile. */
export async function fetchTeamsDirectory(currentProfileId: string): Promise<TeamsDirectory> {
  const supabase = requireClient();
  try {
    const [orgRes, profilesRes, teamsRes, membershipsRes, currentRoleRes] = await Promise.all([
      supabase
        .from('organisations')
        .select('id, name, logo_url, primary_colour, created_at')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select(
          'id, auth_user_id, organisation_id, full_name, display_name_override, email, phone, avatar_url, access_status, access_removed_at, access_removed_by, access_removal_reason, created_at',
        )
        .order('full_name', { ascending: true }),
      supabase
        .from('teams')
        .select(
          'id, organisation_id, name, description, type, avatar_url, archived_at, archived_by, created_at',
        )
        .order('name', { ascending: true }),
      supabase
        .from('team_memberships')
        .select('id, team_id, user_id, role, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('organisation_roles')
        .select('role')
        .eq('user_id', currentProfileId)
        .maybeSingle(),
    ]);
    if (orgRes.error) throw orgRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (teamsRes.error) throw teamsRes.error;
    if (membershipsRes.error) throw membershipsRes.error;
    if (currentRoleRes.error) throw currentRoleRes.error;

    return {
      organisation: (orgRes.data as OrganisationRow | null) ?? null,
      users: ((profilesRes.data ?? []) as ProfileRow[]).map(toAppProfile),
      teams: (teamsRes.data ?? []) as TeamRow[],
      memberships: (membershipsRes.data ?? []) as MembershipRow[],
      currentOrgRole: (currentRoleRes.data?.role ?? 'general_member') as OrganisationRoleName,
    };
  } catch (error) {
    console.warn('[teams] directory fetch failed', {
      code: (error as { code?: string })?.code ?? 'unknown',
    });
    if (error instanceof Error && error.message === TEAM_LIFECYCLE_OFFLINE_ERROR) throw error;
    if (isNetworkError(error)) throw new Error(TEAM_LIFECYCLE_OFFLINE_ERROR);
    throw new Error(LOAD_ERROR);
  }
}

/** Create an active team; selecting no initial admin creates no membership. */
export async function createTeam(input: CreateTeamInput): Promise<TeamCreationResult> {
  try {
    const draft = normaliseTeamDraft(input);
    if (
      input.initialAdminProfileId !== null &&
      !UUID_PATTERN.test(input.initialAdminProfileId)
    ) {
      throw new Error(TEAM_LIFECYCLE_INVALID_INITIAL_ADMIN_ERROR);
    }
    const { data, error } = await requireClient().rpc('create_team', {
      p_name: draft.name,
      p_description: draft.description,
      p_initial_admin_profile_id: input.initialAdminProfileId,
    });
    if (error) throw error;
    const row = oneRpcRow(data);
    const team = toTeam(row);
    if (team.archived_at !== null || team.archived_by !== null) {
      throw new Error('INVALID_TEAM_RESPONSE');
    }

    const membershipFields = [
      row.initial_admin_membership_id,
      row.initial_admin_profile_id,
      row.initial_admin_role,
      row.initial_admin_created_at,
    ];
    let initialAdminMembership: TeamMembership | null = null;
    if (input.initialAdminProfileId === null) {
      if (membershipFields.some((value) => value != null)) {
        throw new Error('INVALID_TEAM_RESPONSE');
      }
    } else if (
      typeof row.initial_admin_membership_id === 'string' &&
      UUID_PATTERN.test(row.initial_admin_membership_id) &&
      row.initial_admin_profile_id === input.initialAdminProfileId &&
      row.initial_admin_role === 'team_leader' &&
      typeof row.initial_admin_created_at === 'string' &&
      row.initial_admin_created_at
    ) {
      initialAdminMembership = {
        id: row.initial_admin_membership_id,
        team_id: team.id,
        user_id: row.initial_admin_profile_id,
        role: row.initial_admin_role,
        created_at: row.initial_admin_created_at,
      };
    } else {
      throw new Error('INVALID_TEAM_RESPONSE');
    }
    return { team, initialAdminMembership };
  } catch (error) {
    logLifecycleFailure('create', error);
    throw friendlyLifecycleError('create', error);
  }
}

/** Update only active-team name and description. */
export async function updateTeam(input: UpdateTeamInput): Promise<Team> {
  try {
    if (!UUID_PATTERN.test(input.teamId)) throw new Error(TEAM_LIFECYCLE_DEMO_ERROR);
    const draft = normaliseTeamDraft(input);
    const { data, error } = await requireClient().rpc('update_team', {
      p_team_id: input.teamId,
      p_name: draft.name,
      p_description: draft.description,
    });
    if (error) throw error;
    const team = toTeam(oneRpcRow(data), input.teamId);
    if (team.archived_at !== null || team.archived_by !== null) {
      throw new Error('INVALID_TEAM_RESPONSE');
    }
    return team;
  } catch (error) {
    logLifecycleFailure('update', error);
    throw friendlyLifecycleError('update', error);
  }
}

/** Soft-archive one active team; no child rows are touched. */
export async function archiveTeam(teamId: string): Promise<Team> {
  try {
    if (!UUID_PATTERN.test(teamId)) throw new Error(TEAM_LIFECYCLE_DEMO_ERROR);
    const { data, error } = await requireClient().rpc('archive_team', {
      p_team_id: teamId,
    });
    if (error) throw error;
    const team = toTeam(oneRpcRow(data), teamId);
    if (team.archived_at === null || team.archived_by === null) {
      throw new Error('INVALID_TEAM_RESPONSE');
    }
    return team;
  } catch (error) {
    logLifecycleFailure('archive', error);
    throw friendlyLifecycleError('archive', error);
  }
}

/** Restore the same team row and retained memberships/history. */
export async function restoreTeam(teamId: string): Promise<Team> {
  try {
    if (!UUID_PATTERN.test(teamId)) throw new Error(TEAM_LIFECYCLE_DEMO_ERROR);
    const { data, error } = await requireClient().rpc('restore_team', {
      p_team_id: teamId,
    });
    if (error) throw error;
    const team = toTeam(oneRpcRow(data), teamId);
    if (team.archived_at !== null || team.archived_by !== null) {
      throw new Error('INVALID_TEAM_RESPONSE');
    }
    return team;
  } catch (error) {
    logLifecycleFailure('restore', error);
    throw friendlyLifecycleError('restore', error);
  }
}
