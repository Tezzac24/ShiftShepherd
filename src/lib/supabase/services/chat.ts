/**
 * Team chat service - live Supabase slice for chat_messages.
 *
 * All Supabase reads/writes for chat live here so screens and AppDataContext
 * never build queries themselves. RLS remains the authority:
 *
 *  - team members (and church admins) can read a team's messages;
 *  - only team members/admins can send, and only as themselves
 *    (sender_id must be the caller's own profile).
 *
 * V1 chat is text-only with realtime for the open conversation:
 * `subscribeToTeamChatMessages` streams new-message INSERTs for one team
 * (Realtime authorizes each delivered row against the same RLS SELECT
 * policy), while list/send stay ordinary RLS-scoped queries and the database
 * remains the source of truth — missed messages are always caught up by a
 * refetch, never replayed by the socket. There is no editing or deleting (no
 * RLS policies exist for either), and chat_attachments stays untouched until
 * the Storage slice.
 *
 * This service needs the grants migration
 * `20260709205903_grant_authenticated_chat_api_privileges.sql` and the
 * realtime publication migration
 * `20260710020944_enable_realtime_for_chat_messages.sql` (both pushed and
 * verified). If the grants are ever missing, live chat screens show a
 * friendly load/send error; if the publication entry is missing, realtime
 * reports unhealthy and the screen falls back to manual checking. Demo mode
 * is unaffected either way.
 */
import { REALTIME_SUBSCRIBE_STATES, SupabaseClient } from '@supabase/supabase-js';

import { ChatMessage } from '../../../types';
import { getSupabase } from '../client';

const LOAD_ERROR = "We couldn't load messages right now. Please try again.";
const SEND_ERROR = "We couldn't send that. Check your connection and try again.";
const PERMISSION_ERROR = 'You do not have permission to send messages here.';
const EMPTY_MESSAGE_ERROR = 'Please type a message first.';
const OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";

interface ChatMessageRow {
  id: string;
  organisation_id: string;
  team_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error(OFFLINE_ERROR);
  }
  return supabase;
}

function isPermissionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === '42501' || /row-level security|permission denied/i.test(e?.message ?? '');
}

function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  return /fetch|network|timeout/i.test(message);
}

const FRIENDLY_MESSAGES = new Set([
  LOAD_ERROR,
  SEND_ERROR,
  PERMISSION_ERROR,
  EMPTY_MESSAGE_ERROR,
  OFFLINE_ERROR,
]);

interface FailMessages {
  permission: string;
  network: string;
  fallback: string;
}

// Loading has no permission-specific wording: RLS just returns no rows, so a
// permission error on load means missing grants — show the plain load error.
const LIST_FAIL: FailMessages = {
  permission: LOAD_ERROR,
  network: OFFLINE_ERROR,
  fallback: LOAD_ERROR,
};

const SEND_FAIL: FailMessages = {
  permission: PERMISSION_ERROR,
  network: SEND_ERROR,
  fallback: SEND_ERROR,
};

function fail(operation: string, error: unknown, messages: FailMessages): never {
  console.warn(`[chat] ${operation} failed`, error);
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isPermissionError(error)) throw new Error(messages.permission);
  if (isNetworkError(error)) throw new Error(messages.network);
  throw new Error(messages.fallback);
}

function requireLiveId(id: string, mockPrefixes: string[], what: string): string {
  if (mockPrefixes.some((prefix) => id.startsWith(prefix))) {
    console.warn(`[chat] refusing mock ${what} id "${id}"`);
    throw new Error(SEND_ERROR);
  }
  return id;
}

async function fetchOrganisationId(
  supabase: SupabaseClient,
  liveProfileId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('organisation_id')
    .eq('id', liveProfileId)
    .single();
  if (error) throw error;
  return data.organisation_id as string;
}

/**
 * Every chat message the caller can see (RLS scopes rows to their accessible
 * teams), oldest first — the order conversations are displayed in.
 */
export async function listChatMessages(): Promise<ChatMessage[]> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, organisation_id, team_id, sender_id, body, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ChatMessageRow[];
  } catch (error) {
    fail('list', error, LIST_FAIL);
  }
}

/**
 * Send a text message to a live team as the signed-in profile. The database
 * owns id and created_at; the saved row is returned for immediate display.
 */
export async function sendChatMessage(
  teamId: string,
  body: string,
  liveProfileId: string,
): Promise<ChatMessage> {
  const supabase = requireClient();
  try {
    const trimmed = body.trim();
    if (!trimmed) throw new Error(EMPTY_MESSAGE_ERROR);
    const liveTeamId = requireLiveId(teamId, ['team-'], 'team');
    const senderId = requireLiveId(liveProfileId, ['user-'], 'profile');
    const organisationId = await fetchOrganisationId(supabase, senderId);
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        organisation_id: organisationId,
        team_id: liveTeamId,
        sender_id: senderId,
        body: trimmed,
      })
      .select('id, organisation_id, team_id, sender_id, body, created_at')
      .single();
    if (error) throw error;
    return data as ChatMessageRow;
  } catch (error) {
    fail('send', error, SEND_FAIL);
  }
}

/**
 * Health of the open chat's realtime subscription. 'reconnecting' means the
 * channel dropped and is retrying by itself; 'disconnected' means it never
 * connected (or was closed) — either way the caller should offer a manual
 * check, and a refetch on recovery fills whatever the socket missed.
 */
export type ChatRealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface ChatRealtimeHandlers {
  /** A complete new message for the subscribed team arrived. */
  onMessage: (message: ChatMessage) => void;
  onStatus: (status: ChatRealtimeStatus) => void;
  /** A payload arrived that can't be trusted as-is — refetch the list. */
  onResyncNeeded: () => void;
}

/**
 * Stream new-message INSERTs for one team over Supabase Realtime. Delivery is
 * still RLS-scoped per subscriber (the SELECT policy on chat_messages), so no
 * one receives rows they couldn't query. Returns an unsubscribe function; no
 * handler fires after it runs. Demo mode / mock team ids never connect.
 */
export function subscribeToTeamChatMessages(
  teamId: string,
  handlers: ChatRealtimeHandlers,
): () => void {
  const supabase = getSupabase();
  if (!supabase || teamId.startsWith('team-')) {
    handlers.onStatus('disconnected');
    return () => {};
  }

  let stopped = false;
  let hasConnected = false;

  const channel = supabase
    .channel(`team-chat:${teamId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `team_id=eq.${teamId}` },
      (payload) => {
        if (stopped) return;
        const row = payload.new as Partial<ChatMessageRow>;
        // The server-side filter should guarantee this; drop strays anyway so
        // a misdelivered row can never land in the wrong conversation.
        if (row.team_id !== teamId) return;
        if (row.id && row.organisation_id && row.sender_id && row.created_at && typeof row.body === 'string') {
          handlers.onMessage(row as ChatMessage);
        } else {
          handlers.onResyncNeeded();
        }
      },
    )
    .subscribe((status) => {
      if (stopped) return;
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        hasConnected = true;
        handlers.onStatus('connected');
      } else if (status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) {
        handlers.onStatus('reconnecting');
      } else if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) {
        // The channel retries by itself after a drop; a join that has never
        // succeeded (e.g. realtime unavailable) is plain disconnected.
        handlers.onStatus(hasConnected ? 'reconnecting' : 'disconnected');
      } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
        handlers.onStatus('disconnected');
      }
    });

  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
