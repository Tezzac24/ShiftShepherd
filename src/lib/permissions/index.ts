/**
 * Role/permission helpers. All permission logic lives here — screens call
 * these helpers instead of checking roles inline.
 *
 * TODO: wire to Supabase — these rules become Row Level Security policies;
 * the helpers stay as the client-side mirror for showing/hiding UI.
 */
import { Announcement, RotaAssignment, RotaEntry, SessionUser, Team } from '../../types';

export function isChurchAdmin(user: SessionUser): boolean {
  return user.orgRole === 'church_admin';
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

// ---------------------------------------------------------------------------
// Choir songs
// ---------------------------------------------------------------------------

/** Every choir member can add, edit, and delete songs. Admins may too. */
export function canManageSongs(user: SessionUser, choirTeam: Team): boolean {
  return isChurchAdmin(user) || isMemberOfTeam(user, choirTeam.id);
}

/** Role name that marks the assigned song leader on a choir rota entry. */
export const SONG_LEADER_ROLE = 'Song Leader';

export function songLeaderAssignment(
  assignments: RotaAssignment[],
): RotaAssignment | undefined {
  return assignments.find((a) => a.role_name === SONG_LEADER_ROLE);
}

/**
 * Songs for a choir rota date can be selected by the assigned song leader
 * for that date, the choir team leader (override), or a church admin.
 */
export function canSelectSongsForRota(
  user: SessionUser,
  entry: RotaEntry,
  assignments: RotaAssignment[],
): boolean {
  if (isChurchAdmin(user)) return true;
  if (isTeamLeader(user, entry.team_id)) return true;
  const leader = songLeaderAssignment(
    assignments.filter((a) => a.rota_entry_id === entry.id),
  );
  return leader?.user_id === user.profile.id;
}
