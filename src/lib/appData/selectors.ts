/**
 * Pure derived-data helpers over the app data collections.
 * Screens use these so the "query" logic stays out of components —
 * later these map naturally onto Supabase queries/views.
 */
import {
  Announcement,
  AvailabilityResponse,
  ChatMessage,
  ChatReadState,
  ChoirSongSelection,
  Event,
  EventOccurrence,
  AvailabilityStatus,
  RotaAssignment,
  RotaEntry,
  SessionUser,
  Song,
  SongSection,
  Team,
  TeamMembership,
  UserProfile,
} from '../../types';
import { parseDateKey } from '../../utils/dates';
import { expandEventOccurrences } from '../../utils/recurrence';
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

export function upcomingEvents(events: Event[]): EventOccurrence[] {
  return expandEventOccurrences(events);
}

export function nextEvent(events: Event[]): EventOccurrence | undefined {
  return upcomingEvents(events)[0];
}

/** When the event finished — for a recurring series, the end of its last day. */
function eventEndedAt(event: Event): number {
  if (event.is_recurring && event.recurrence_end_date) {
    const seriesEnd = parseDateKey(event.recurrence_end_date);
    seriesEnd.setHours(23, 59, 59, 999);
    return seriesEnd.getTime();
  }
  return new Date(event.end_time).getTime();
}

/**
 * True when the event has already finished. A recurring series only counts
 * as past once its end date has passed; an open-ended series never does.
 */
export function isPastEvent(event: Event, now = new Date()): boolean {
  if (event.is_recurring && !event.recurrence_end_date) return false;
  return eventEndedAt(event) < now.getTime();
}

/**
 * Base event rows that haven't finished yet — for choices like the
 * announcement linked-event picker (past events shouldn't be offered).
 */
export function currentAndUpcomingEvents(events: Event[]): Event[] {
  const now = new Date();
  return events.filter((e) => !isPastEvent(e, now));
}

/** Finished events for the calendar's "Past events" section, newest first. */
export function pastEvents(events: Event[]): Event[] {
  const now = new Date();
  return events
    .filter((e) => isPastEvent(e, now))
    .sort((a, b) => eventEndedAt(b) - eventEndedAt(a));
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

/** The team's next upcoming date that is still going ahead (not cancelled). */
export function nextActiveRotaEntryForTeam(
  teamId: string,
  entries: RotaEntry[],
): RotaEntry | undefined {
  return upcomingRotaEntriesForTeam(teamId, entries).find((e) => e.status !== 'cancelled');
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

/** One row per person for a rota entry, with their role names and status. */
export interface EntryPersonStatus {
  userId: string;
  /** All of this person's assignments on the entry (usually one). */
  assignments: RotaAssignment[];
  /** e.g. "Praise Leader & Worship Leader" */
  roleSummary: string;
  status: AvailabilityStatus;
  note: string | null;
}

/**
 * Groups an entry's assignments by person (someone can hold two roles, e.g.
 * Praise Leader and Worship Leader). Status/note come from the person's
 * first responded assignment.
 */
export function peopleForEntry(
  entryId: string,
  assignments: RotaAssignment[],
  responses: AvailabilityResponse[],
): EntryPersonStatus[] {
  const grouped = new Map<string, RotaAssignment[]>();
  for (const a of assignmentsForEntry(entryId, assignments)) {
    grouped.set(a.user_id, [...(grouped.get(a.user_id) ?? []), a]);
  }
  return [...grouped.entries()].map(([userId, personAssignments]) => {
    const response = personAssignments
      .map((a) => availabilityForAssignment(a.id, responses))
      .find((r) => r && r.status !== 'not_responded');
    return {
      userId,
      assignments: personAssignments,
      roleSummary: personAssignments.map((a) => a.role_name).join(' & '),
      status: response?.status ?? 'not_responded',
      note: response?.note ?? null,
    };
  });
}

export interface AvailabilitySummary {
  available: number;
  maybe: number;
  unavailable: number;
  not_responded: number;
}

/** Per-person availability counts for an entry (the "who's coming" tracker). */
export function availabilitySummaryForEntry(
  entryId: string,
  assignments: RotaAssignment[],
  responses: AvailabilityResponse[],
): AvailabilitySummary {
  const summary: AvailabilitySummary = {
    available: 0,
    maybe: 0,
    unavailable: 0,
    not_responded: 0,
  };
  for (const person of peopleForEntry(entryId, assignments, responses)) {
    summary[person.status] += 1;
  }
  return summary;
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
  const seenEntryIds = new Set<string>();
  return assignments
    .filter((a) => a.user_id === user.profile.id)
    .map((assignment) => {
      const entry = entries.find((e) => e.id === assignment.rota_entry_id);
      const team = entry && teams.find((t) => t.id === entry.team_id);
      // Cancelled dates are not responsibilities; one entry counts once even
      // if the user holds two roles on it (e.g. Praise + Worship Leader).
      return entry &&
        team &&
        entry.status !== 'cancelled' &&
        parseDateKey(entry.date) >= today &&
        !seenEntryIds.has(entry.id) &&
        seenEntryIds.add(entry.id)
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

/** A section's selections for a rota date, in section order. */
export function selectionsForEntrySection(
  entryId: string,
  section: SongSection,
  selections: ChoirSongSelection[],
): ChoirSongSelection[] {
  return selectionsForEntry(entryId, selections).filter((s) => s.section === section);
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
    // Id as tiebreak keeps same-timestamp messages in a stable order however
    // they arrived (send response, realtime insert, or refetch).
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function lastMessageForTeam(
  teamId: string,
  messages: ChatMessage[],
): ChatMessage | undefined {
  const list = messagesForTeam(teamId, messages);
  return list[list.length - 1];
}

/** Friendly one-line preview; image-only messages never appear blank. */
export function chatMessagePreview(message: ChatMessage): string {
  const text = message.body.trim();
  return text || (message.attachment ? 'Photo' : 'Message');
}

/**
 * Unread counts per team: messages from other people newer than the user's
 * read point — their read-state row, or `baseline` for teams without one.
 * The user's own messages never count as unread.
 */
export function countUnreadByTeam(
  messages: ChatMessage[],
  readStates: Pick<ChatReadState, 'team_id' | 'last_read_at'>[],
  baseline: string,
  selfProfileId: string,
): Record<string, number> {
  const timeOf = (timestamp: string) => new Date(timestamp).getTime();
  const lastReadByTeam = new Map(
    readStates.map((s) => [s.team_id, timeOf(s.last_read_at)] as const),
  );
  const baselineTime = timeOf(baseline);
  const counts: Record<string, number> = {};
  for (const message of messages) {
    if (message.sender_id === selfProfileId) continue;
    const readPoint = lastReadByTeam.get(message.team_id) ?? baselineTime;
    if (timeOf(message.created_at) > readPoint) {
      counts[message.team_id] = (counts[message.team_id] ?? 0) + 1;
    }
  }
  return counts;
}
