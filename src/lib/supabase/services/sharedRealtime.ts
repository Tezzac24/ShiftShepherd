import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

import { SharedRefreshDomain } from '../../appData/liveInvalidation';
import { getSupabase } from '../client';

export const SHARED_TABLE_DOMAINS = {
  announcements: ['announcements'],
  events: ['events'],
  rota_entries: ['rotas'],
  rota_assignments: ['rotas'],
  availability_responses: ['rotas'],
  songs: ['songs'],
  song_links: ['songs'],
  choir_rota_song_selections: ['songs'],
  organisations: ['directory'],
  profiles: ['directory'],
  teams: ['directory'],
  team_memberships: ['directory'],
  organisation_roles: ['directory'],
  user_accounts: ['directory'],
} as const satisfies Record<string, readonly SharedRefreshDomain[]>;

export type SharedRealtimeTable = keyof typeof SHARED_TABLE_DOMAINS;
export const SHARED_REALTIME_TABLES = Object.keys(
  SHARED_TABLE_DOMAINS,
) as SharedRealtimeTable[];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SharedRealtimeHandlers {
  onInvalidate: (domains: readonly SharedRefreshDomain[]) => void;
  onReconnect: () => void;
  onStatus?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
}

/**
 * Subscribe once for a linked live profile. Payload rows are never applied
 * directly: table identity only selects the RLS-scoped loader to invalidate.
 */
export function subscribeToSharedDataChanges(
  profileId: string | null,
  handlers: SharedRealtimeHandlers,
): () => void {
  if (!profileId || !UUID_PATTERN.test(profileId)) return () => {};
  const supabase = getSupabase();
  if (!supabase) return () => {};

  let stopped = false;
  let hadConnectionIssue = false;
  let channel = supabase.channel(`shared-data:${profileId}`);

  for (const table of SHARED_REALTIME_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        if (!stopped) handlers.onInvalidate(SHARED_TABLE_DOMAINS[table]);
      },
    );
  }

  channel.subscribe((status) => {
    if (stopped) return;
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      handlers.onStatus?.('connected');
      if (hadConnectionIssue) {
        hadConnectionIssue = false;
        handlers.onReconnect();
      }
    } else if (
      status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
      status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
    ) {
      hadConnectionIssue = true;
      handlers.onStatus?.('reconnecting');
    } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
      hadConnectionIssue = true;
      handlers.onStatus?.('disconnected');
    }
  });

  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
