/**
 * Pure reducers for the canonical live per-team unread map.
 *
 * The authoritative source is the server unread summary
 * (get_team_chat_unread_summary); Realtime message events apply a bounded local
 * delta between reconciliations. These helpers keep that single truth
 * consistent — own messages never count, the actively-viewed team stays at
 * zero, counts never go negative, and inaccessible teams are pruned. The map is
 * sparse: a team with zero unread has no key (callers read `map[teamId] ?? 0`).
 */
import { ChatMessage, SessionUser, Team, TeamChatUnreadEntry } from '../../types';

export type UnreadByTeam = Record<string, number>;

/**
 * Canonical team-topic set for chat Broadcast. Ordinary users use their own
 * membership snapshot. Church admins use every loaded team in their own
 * organisation, matching public.can_access_team while failing closed if an
 * unexpected cross-organisation directory row ever appears.
 */
export function accessibleChatTeamIds(user: SessionUser, teams: Team[]): string[] {
  const activeOwnOrganisationTeamIds = new Set(
    teams
      .filter(
        (team) =>
          team.organisation_id === user.profile.organisation_id &&
          team.archived_at === null,
      )
      .map((team) => team.id),
  );
  const ids =
    user.orgRole === 'church_admin'
      ? [...activeOwnOrganisationTeamIds]
      : user.memberships
          .map((membership) => membership.team_id)
          .filter((teamId) => activeOwnOrganisationTeamIds.has(teamId));
  return [...new Set(ids)].sort();
}

/**
 * Authoritative per-team unread from a summary. The actively-viewed team is
 * forced to zero (the reader is looking at it), and zero-unread teams are
 * omitted so the map stays sparse.
 */
export function unreadFromSummary(
  entries: TeamChatUnreadEntry[],
  activeTeamId: string | null = null,
): UnreadByTeam {
  const next: UnreadByTeam = {};
  for (const entry of entries) {
    if (entry.team_id === activeTeamId) continue;
    const count = Math.max(0, Math.trunc(entry.unread_count) || 0);
    if (count > 0) next[entry.team_id] = count;
  }
  return next;
}

/**
 * A message arrived over Realtime. Increment its team by exactly one, but only
 * when the message is genuinely new (not already known — so a duplicate event
 * counts once), is from someone else, and belongs to a team that is not being
 * actively viewed. Returns the same reference when nothing changes so React can
 * skip re-renders.
 */
export function applyIncomingMessage(
  prev: UnreadByTeam,
  params: {
    message: Pick<ChatMessage, 'id' | 'team_id' | 'sender_id'>;
    knownMessageIds: ReadonlySet<string>;
    selfProfileId: string | null;
    activeTeamId: string | null;
  },
): UnreadByTeam {
  const { message, knownMessageIds, selfProfileId, activeTeamId } = params;
  if (knownMessageIds.has(message.id)) return prev;
  if (selfProfileId && message.sender_id === selfProfileId) return prev;
  if (message.team_id === activeTeamId) return prev;
  const current = prev[message.team_id] ?? 0;
  return { ...prev, [message.team_id]: current + 1 };
}

/** Clear one team's unread (opening/viewing it). Same reference if already clear. */
export function clearTeamUnread(prev: UnreadByTeam, teamId: string): UnreadByTeam {
  if (!(teamId in prev)) return prev;
  const next = { ...prev };
  delete next[teamId];
  return next;
}

/**
 * Drop unread entries for teams the caller can no longer access (membership
 * removed). Same reference when every current entry is still accessible.
 */
export function pruneUnread(
  prev: UnreadByTeam,
  accessibleTeamIds: ReadonlySet<string>,
): UnreadByTeam {
  const keys = Object.keys(prev);
  if (keys.every((teamId) => accessibleTeamIds.has(teamId))) return prev;
  const next: UnreadByTeam = {};
  for (const teamId of keys) {
    if (accessibleTeamIds.has(teamId)) next[teamId] = prev[teamId];
  }
  return next;
}

/** Total unread across the given teams (defaults to every team in the map). */
export function sumUnread(
  unreadByTeam: UnreadByTeam,
  teamIds?: Iterable<string>,
): number {
  if (!teamIds) {
    let total = 0;
    for (const value of Object.values(unreadByTeam)) total += value;
    return total;
  }
  let total = 0;
  for (const teamId of teamIds) total += unreadByTeam[teamId] ?? 0;
  return total;
}
