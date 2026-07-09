/**
 * TEMPORARY bridge between the still-local demo slices and the live directory.
 *
 * People and teams are live now (real UUIDs from Supabase), but rotas,
 * availability, songs, song selections, and chat remain demo/local data keyed
 * by mock ids ('team-choir', 'user-sarah'). So that those features keep
 * working in live mode, this module:
 *
 *  - re-keys the local demo collections onto their live counterparts for
 *    display (teams matched by name, people matched by email — the dev seed
 *    mirrors the mock data), so live team/user UUIDs find the demo rota,
 *    songs, and chat that belong to them;
 *  - maps ids back to mock ids when a demo-slice mutation writes to local
 *    state, so the persisted demo snapshot stays keyed by mock ids and demo
 *    mode is never polluted with live UUIDs.
 *
 * Nothing here touches Supabase, and live rows never receive mock ids — this
 * is a display/local-write shim only. Delete it slice by slice as rotas,
 * songs, and chat go live (docs/supabase-integration-plan.md, steps 7–9).
 */
import {
  AvailabilityResponse,
  ChatMessage,
  ChoirSongSelection,
  RotaAssignment,
  RotaEntry,
  Song,
  Team,
  UserProfile,
} from '../../types';
import { mockTeams, mockUsers } from '../mockData';

export interface DemoIdBridge {
  userLocalToLive: Map<string, string>;
  userLiveToLocal: Map<string, string>;
  teamLocalToLive: Map<string, string>;
  teamLiveToLocal: Map<string, string>;
}

/** Match live profiles/teams to their mock counterparts (email/name). */
export function buildDemoIdBridge(liveUsers: UserProfile[], liveTeams: Team[]): DemoIdBridge {
  const bridge: DemoIdBridge = {
    userLocalToLive: new Map(),
    userLiveToLocal: new Map(),
    teamLocalToLive: new Map(),
    teamLiveToLocal: new Map(),
  };
  const liveUserByEmail = new Map(liveUsers.map((u) => [u.email.toLowerCase(), u.id]));
  for (const mock of mockUsers) {
    const liveId = liveUserByEmail.get(mock.email.toLowerCase());
    if (liveId) {
      bridge.userLocalToLive.set(mock.id, liveId);
      bridge.userLiveToLocal.set(liveId, mock.id);
    }
  }
  const liveTeamByName = new Map(liveTeams.map((t) => [t.name.toLowerCase(), t.id]));
  for (const mock of mockTeams) {
    const liveId = liveTeamByName.get(mock.name.toLowerCase());
    if (liveId) {
      bridge.teamLocalToLive.set(mock.id, liveId);
      bridge.teamLiveToLocal.set(liveId, mock.id);
    }
  }
  return bridge;
}

// Unmapped ids pass through unchanged: a live-only team/user simply has no
// demo data, and demo mode (bridge = null) is always a no-op.

export function toLiveUserId(bridge: DemoIdBridge | null, id: string): string {
  return bridge?.userLocalToLive.get(id) ?? id;
}

export function toLocalUserId(bridge: DemoIdBridge | null, id: string): string {
  return bridge?.userLiveToLocal.get(id) ?? id;
}

export function toLiveTeamId(bridge: DemoIdBridge | null, id: string): string {
  return bridge?.teamLocalToLive.get(id) ?? id;
}

export function toLocalTeamId(bridge: DemoIdBridge | null, id: string): string {
  return bridge?.teamLiveToLocal.get(id) ?? id;
}

/** The demo/local collections whose ids need re-keying in live mode. */
export interface DemoCollections {
  rotaEntries: RotaEntry[];
  rotaAssignments: RotaAssignment[];
  availabilityResponses: AvailabilityResponse[];
  songs: Song[];
  songSelections: ChoirSongSelection[];
  chatMessages: ChatMessage[];
  unreadByTeam: Record<string, number>;
}

/** Re-key the demo collections onto live team/profile UUIDs for display. */
export function bridgeDemoCollections(
  collections: DemoCollections,
  bridge: DemoIdBridge,
): DemoCollections {
  return {
    rotaEntries: collections.rotaEntries.map((e) => ({
      ...e,
      team_id: toLiveTeamId(bridge, e.team_id),
      created_by: toLiveUserId(bridge, e.created_by),
      cancelled_by: e.cancelled_by ? toLiveUserId(bridge, e.cancelled_by) : e.cancelled_by,
    })),
    rotaAssignments: collections.rotaAssignments.map((a) => ({
      ...a,
      user_id: toLiveUserId(bridge, a.user_id),
    })),
    availabilityResponses: collections.availabilityResponses.map((r) => ({
      ...r,
      user_id: toLiveUserId(bridge, r.user_id),
    })),
    songs: collections.songs.map((s) => ({
      ...s,
      team_id: toLiveTeamId(bridge, s.team_id),
      added_by: toLiveUserId(bridge, s.added_by),
    })),
    songSelections: collections.songSelections.map((s) => ({
      ...s,
      selected_by: toLiveUserId(bridge, s.selected_by),
    })),
    chatMessages: collections.chatMessages.map((m) => ({
      ...m,
      team_id: toLiveTeamId(bridge, m.team_id),
      sender_id: toLiveUserId(bridge, m.sender_id),
    })),
    unreadByTeam: Object.fromEntries(
      Object.entries(collections.unreadByTeam).map(([teamId, count]) => [
        toLiveTeamId(bridge, teamId),
        count,
      ]),
    ),
  };
}
