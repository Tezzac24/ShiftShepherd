/**
 * Pure derived-data helpers over the app data collections.
 * Screens use these so the "query" logic stays out of components —
 * later these map naturally onto Supabase queries/views.
 */
import {
  Announcement,
  AvailabilityResponse,
  ChatMessage,
  ChoirSongSelection,
  Event,
  RotaAssignment,
  RotaEntry,
  SessionUser,
  Song,
  Team,
  TeamMembership,
  UserProfile,
} from '../../types';
import { parseDateKey } from '../../utils/dates';
import { isChurchAdmin } from '../permissions';

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/** Teams visible to the user: their own; church admins see all. */
export function visibleTeams(user: SessionUser, teams: Team[]): Team[] {
  if (isChurchAdmin(user)) return teams;
  const ids = new Set(user.memberships.map((m) => m.team_id));
  return teams.filter((t) => ids.has(t.id));
}

export function teamMembers(
  teamId: string,
  memberships: TeamMembership[],
  users: UserProfile[],
): { profile: UserProfile; membership: TeamMembership }[] {
  return memberships
    .filter((m) => m.team_id === teamId)
    .map((membership) => ({
      membership,
      profile: users.find((u) => u.id === membership.user_id)!,
    }))
    .filter((x) => x.profile);
}

export function userById(users: UserProfile[], id: string): UserProfile | undefined {
  return users.find((u) => u.id === id);
}

export function userName(users: UserProfile[], id: string): string {
  return userById(users, id)?.full_name ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function upcomingEvents(events: Event[]): Event[] {
  const now = new Date();
  return events
    .filter((e) => new Date(e.end_time) >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function nextEvent(events: Event[]): Event | undefined {
  return upcomingEvents(events)[0];
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** Announcements the user can see: church-wide + their teams'. */
export function visibleAnnouncements(
  user: SessionUser,
  announcements: Announcement[],
): Announcement[] {
  const teamIds = new Set(user.memberships.map((m) => m.team_id));
  return announcements
    .filter((a) => !a.team_id || isChurchAdmin(user) || teamIds.has(a.team_id))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.created_at.localeCompare(a.created_at);
    });
}

export function latestAnnouncement(
  user: SessionUser,
  announcements: Announcement[],
): Announcement | undefined {
  // "Latest" for the home card = newest visible, regardless of pinning
  return [...visibleAnnouncements(user, announcements)].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
}

export function teamAnnouncements(teamId: string, announcements: Announcement[]): Announcement[] {
  return announcements
    .filter((a) => a.team_id === teamId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export function rotaEntriesForTeam(teamId: string, entries: RotaEntry[]): RotaEntry[] {
  return entries
    .filter((e) => e.team_id === teamId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

export function upcomingRotaEntriesForTeam(teamId: string, entries: RotaEntry[]): RotaEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return rotaEntriesForTeam(teamId, entries).filter((e) => parseDateKey(e.date) >= today);
}

export function assignmentsForEntry(
  entryId: string,
  assignments: RotaAssignment[],
): RotaAssignment[] {
  return assignments.filter((a) => a.rota_entry_id === entryId);
}

export function availabilityForAssignment(
  assignmentId: string,
  responses: AvailabilityResponse[],
): AvailabilityResponse | undefined {
  return responses.find((r) => r.rota_assignment_id === assignmentId);
}

export interface Responsibility {
  entry: RotaEntry;
  assignment: RotaAssignment;
  team: Team;
}

/** The user's upcoming rota responsibilities across all teams, soonest first. */
export function upcomingResponsibilities(
  user: SessionUser,
  entries: RotaEntry[],
  assignments: RotaAssignment[],
  teams: Team[],
): Responsibility[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return assignments
    .filter((a) => a.user_id === user.profile.id)
    .map((assignment) => {
      const entry = entries.find((e) => e.id === assignment.rota_entry_id);
      const team = entry && teams.find((t) => t.id === entry.team_id);
      return entry && team && parseDateKey(entry.date) >= today
        ? { entry, assignment, team }
        : null;
    })
    .filter((x): x is Responsibility => x !== null)
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date));
}

export function nextResponsibility(
  user: SessionUser,
  entries: RotaEntry[],
  assignments: RotaAssignment[],
  teams: Team[],
): Responsibility | undefined {
  return upcomingResponsibilities(user, entries, assignments, teams)[0];
}

// ---------------------------------------------------------------------------
// Choir songs
// ---------------------------------------------------------------------------

export function selectionsForEntry(
  entryId: string,
  selections: ChoirSongSelection[],
): ChoirSongSelection[] {
  return selections
    .filter((s) => s.rota_entry_id === entryId)
    .sort((a, b) => a.order_index - b.order_index);
}

export function songById(songs: Song[], id: string): Song | undefined {
  return songs.find((s) => s.id === id);
}

export function searchSongs(songs: Song[], query: string): Song[] {
  const q = query.trim().toLowerCase();
  const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title));
  if (!q) return sorted;
  return sorted.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      (s.artist ?? '').toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function messagesForTeam(teamId: string, messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.team_id === teamId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function lastMessageForTeam(
  teamId: string,
  messages: ChatMessage[],
): ChatMessage | undefined {
  const list = messagesForTeam(teamId, messages);
  return list[list.length - 1];
}
