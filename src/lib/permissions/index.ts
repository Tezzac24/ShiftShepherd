/**
 * Role/permission helpers. All permission logic lives here — screens call
 * these helpers instead of checking roles inline.
 *
 * TODO: wire to Supabase — these rules become Row Level Security policies;
 * the helpers stay as the client-side mirror for showing/hiding UI.
 */
import {
  Announcement,
  OrganisationRoleName,
  RotaAssignment,
  RotaEntry,
  SessionUser,
  SongSection,
  Team,
  TeamMembership,
} from '../../types';

export function isChurchAdmin(user: SessionUser): boolean {
  return user.orgRole === 'church_admin';
}

export interface OrganisationRoleOption {
  value: OrganisationRoleName;
  label: string;
  description: string;
  highPrivilege?: boolean;
}

/** The complete schema-backed, single-role organisation catalog. */
export const ORGANISATION_ROLE_OPTIONS: OrganisationRoleOption[] = [
  {
    value: 'general_member',
    label: 'Church Member',
    description: 'Baseline organisation access without extra management permissions.',
  },
  {
    value: 'announcement_manager',
    label: 'Announcement Manager',
    description: 'Can create and manage church-wide announcements.',
  },
  {
    value: 'event_manager',
    label: 'Event Manager',
    description: 'Can create and manage organisation events and categories.',
  },
  {
    value: 'church_admin',
    label: 'Church Admin',
    description: 'High privilege: can manage invitations, members, roles, and organisation content.',
    highPrivilege: true,
  },
];

export function canManageOrganisationMembers(user: SessionUser): boolean {
  return isChurchAdmin(user);
}

/** Organisation-level create/edit/archive/restore authority. */
export function canManageTeamLifecycle(user: SessionUser): boolean {
  return isChurchAdmin(user);
}

export function isMemberOfTeam(user: SessionUser, teamId: string): boolean {
  return user.memberships.some((m) => m.team_id === teamId);
}

export function isTeamLeader(user: SessionUser, teamId: string): boolean {
  return user.memberships.some((m) => m.team_id === teamId && m.role === 'team_leader');
}

/** Teams the user can open (their own teams; admins see every team). */
export function canViewTeam(user: SessionUser, teamId: string): boolean {
  return isChurchAdmin(user) || isMemberOfTeam(user, teamId);
}

/** Chat visibility follows team visibility. */
export function canViewTeamChat(user: SessionUser, teamId: string): boolean {
  return canViewTeam(user, teamId);
}

/** Team profile/photo management follows the existing leader/admin boundary. */
export function canManageTeamAvatar(user: SessionUser, teamId: string): boolean {
  return isChurchAdmin(user) || isTeamLeader(user, teamId);
}

/** Membership writes follow the same team-leader/church-admin boundary. */
export function canManageTeamMemberships(user: SessionUser, teamId: string): boolean {
  return isChurchAdmin(user) || isTeamLeader(user, teamId);
}

export type TeamMemberRemovalState =
  | 'removable'
  | 'self'
  | 'peer_team_admin'
  | 'final_team_admin';

/**
 * Presentation-only removal availability. The target's team role is the only
 * protected role input: an organisation-wide church admin whose membership is
 * `member` remains an ordinary removable target. The RPC is authoritative.
 */
export function teamMemberRemovalState(
  user: SessionUser,
  target: TeamMembership,
  teamMemberships: TeamMembership[],
): TeamMemberRemovalState {
  if (target.user_id === user.profile.id) return 'self';
  if (target.role !== 'team_leader') return 'removable';
  if (!isChurchAdmin(user)) return 'peer_team_admin';
  const adminCount = teamMemberships.filter(
    (membership) =>
      membership.team_id === target.team_id && membership.role === 'team_leader',
  ).length;
  return adminCount > 1 ? 'removable' : 'final_team_admin';
}

export type LeaveTeamState = 'allowed' | 'final_team_admin' | 'not_member';

/** Presentation hint for Leave Team; the database repeats the final-admin check under lock. */
export function leaveTeamState(
  profileId: string,
  teamId: string,
  memberships: TeamMembership[],
): LeaveTeamState {
  const own = memberships.find(
    (membership) => membership.team_id === teamId && membership.user_id === profileId,
  );
  if (!own) return 'not_member';
  if (own.role !== 'team_leader') return 'allowed';
  const adminCount = memberships.filter(
    (membership) => membership.team_id === teamId && membership.role === 'team_leader',
  ).length;
  return adminCount > 1 ? 'allowed' : 'final_team_admin';
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export function canCreateChurchAnnouncements(user: SessionUser): boolean {
  return isChurchAdmin(user) || user.orgRole === 'announcement_manager';
}

export function canCreateTeamAnnouncements(user: SessionUser, teamId: string): boolean {
  return isChurchAdmin(user) || isTeamLeader(user, teamId);
}

/** Whether the user can create any kind of announcement at all. */
export function canCreateAnyAnnouncement(user: SessionUser): boolean {
  return (
    canCreateChurchAnnouncements(user) ||
    user.memberships.some((m) => m.role === 'team_leader')
  );
}

export function canEditAnnouncement(user: SessionUser, announcement: Announcement): boolean {
  if (announcement.team_id) {
    return canCreateTeamAnnouncements(user, announcement.team_id);
  }
  return canCreateChurchAnnouncements(user);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function canManageEvents(user: SessionUser): boolean {
  return isChurchAdmin(user) || user.orgRole === 'event_manager';
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export function canManageTeamRota(user: SessionUser, teamId: string): boolean {
  return isChurchAdmin(user) || isTeamLeader(user, teamId);
}

/** Only the assigned person can confirm availability for their assignment. */
export function canRespondToAssignment(user: SessionUser, assignment: RotaAssignment): boolean {
  return assignment.user_id === user.profile.id;
}

/** Cancelling a rota entry (marking it "Cancelled", not deleting) is a leader action. */
export function canCancelRotaEntry(user: SessionUser, entry: RotaEntry): boolean {
  return canManageTeamRota(user, entry.team_id);
}

// ---------------------------------------------------------------------------
// Choir songs
// ---------------------------------------------------------------------------

/** Every choir member can add, edit, and delete songs. Admins may too. */
export function canManageSongs(user: SessionUser, choirTeam: Team): boolean {
  return isChurchAdmin(user) || isMemberOfTeam(user, choirTeam.id);
}

// Centralised choir rota role names. Assignments store role names as free
// text, but these specific names carry meaning for song-selection permissions.

/** Leads the praise (upbeat) section and manages its song list. */
export const PRAISE_LEADER_ROLE = 'Praise Leader';
/** Leads the worship (reflective) section and manages its song list. */
export const WORSHIP_LEADER_ROLE = 'Worship Leader';
/**
 * Legacy single-leader role: one person leading the whole service. Still
 * supported — a Song Leader can manage both praise and worship songs.
 */
export const SONG_LEADER_ROLE = 'Song Leader';
/** Default role for choir members expected at a service or rehearsal. */
export const CHOIR_MEMBER_ROLE = 'Choir Member';

const sectionLeaderRoles: Record<SongSection, string> = {
  praise: PRAISE_LEADER_ROLE,
  worship: WORSHIP_LEADER_ROLE,
};

/** Plain-English labels for song sections. */
export const songSectionLabels: Record<SongSection, string> = {
  praise: 'Praise',
  worship: 'Worship',
};

/** The assignment (if any) for a section's leader on a rota entry. */
export function sectionLeaderAssignment(
  assignments: RotaAssignment[],
  section: SongSection,
): RotaAssignment | undefined {
  return (
    assignments.find((a) => a.role_name === sectionLeaderRoles[section]) ??
    assignments.find((a) => a.role_name === SONG_LEADER_ROLE)
  );
}

export function songLeaderAssignment(
  assignments: RotaAssignment[],
): RotaAssignment | undefined {
  return assignments.find((a) => a.role_name === SONG_LEADER_ROLE);
}

/**
 * A section's songs can be changed by the leader assigned to that section
 * (Praise Leader for praise, Worship Leader for worship), a legacy Song
 * Leader (both sections), the choir team leader (override), or a church
 * admin. The same person may hold both leader roles.
 */
export function canManageSongSectionForRotaEntry(
  user: SessionUser,
  entry: RotaEntry,
  assignments: RotaAssignment[],
  section: SongSection,
): boolean {
  if (isChurchAdmin(user)) return true;
  if (isTeamLeader(user, entry.team_id)) return true;
  const entryAssignments = assignments.filter((a) => a.rota_entry_id === entry.id);
  return entryAssignments.some(
    (a) =>
      a.user_id === user.profile.id &&
      (a.role_name === sectionLeaderRoles[section] || a.role_name === SONG_LEADER_ROLE),
  );
}

export function canManagePraiseSongsForRotaEntry(
  user: SessionUser,
  entry: RotaEntry,
  assignments: RotaAssignment[],
): boolean {
  return canManageSongSectionForRotaEntry(user, entry, assignments, 'praise');
}

export function canManageWorshipSongsForRotaEntry(
  user: SessionUser,
  entry: RotaEntry,
  assignments: RotaAssignment[],
): boolean {
  return canManageSongSectionForRotaEntry(user, entry, assignments, 'worship');
}

/** Whether the user can change songs for at least one section of this date. */
export function canSelectSongsForRota(
  user: SessionUser,
  entry: RotaEntry,
  assignments: RotaAssignment[],
): boolean {
  return (
    canManagePraiseSongsForRotaEntry(user, entry, assignments) ||
    canManageWorshipSongsForRotaEntry(user, entry, assignments)
  );
}
