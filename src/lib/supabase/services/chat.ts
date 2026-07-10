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
 * V1 chat supports text plus one optional image attachment. Realtime still
 * streams only the parent chat_messages INSERT; the open-screen hook follows
 * every arrival with a coalesced refetch so attachment metadata catches up.
 * `subscribeToTeamChatMessages` streams new-message INSERTs for one team
 * (Realtime authorizes each delivered row against the same RLS SELECT
 * policy), while list/send stay ordinary RLS-scoped queries and the database
 * remains the source of truth — missed messages are always caught up by a
 * refetch, never replayed by the socket. There is no editing or deleting (no
 * RLS policies exist for either). Attachment Storage/upload/atomic-send logic
 * lives in chatAttachments.ts; this service owns canonical joined reads.
 *
 * Unread tracking rides on `chat_read_states` (one private row per
 * user + team; migration `20260710031212_add_chat_read_states.sql`):
 * `fetchChatReadStates` loads the caller's own rows and `markChatRead`
 * upserts one when a chat is opened. Read state is never shown to other
 * users — this is unread badges, not read receipts.
 *
 * This service needs the grants migration
 * `20260709205903_grant_authenticated_chat_api_privileges.sql` and the
 * realtime publication migration
 * `20260710020944_enable_realtime_for_chat_messages.sql` (both pushed and
 * verified). If the grants are ever missing, live chat screens show a
 * friendly load/send error; if the publication entry is missing, realtime
 * reports unhealthy and the screen falls back to manual checking. Until the
 * chat_read_states migration is pushed, fetchChatReadStates reports
 * "unavailable" and the app simply hides unread badges — messages themselves
 * are unaffected. Demo mode is unaffected either way.
 */
import { REALTIME_SUBSCRIBE_STATES, SupabaseClient } from '@supabase/supabase-js';

import { ChatAttachment, ChatMessage, ChatReadState } from '../../../types';
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
  chat_attachments?: ChatAttachmentRow[] | ChatAttachmentRow | null;
}

interface ChatAttachmentRow {
  id: string;
  message_id: string;
  file_url: string;
  file_type: string;
  file_name: string;
  file_size_bytes: number | null;
  created_at: string;
}

const CHAT_MESSAGE_COLUMNS =
  'id, organisation_id, team_id, sender_id, body, created_at';
const CHAT_ATTACHMENT_COLUMNS =
  'id, message_id, file_url, file_type, file_name, file_size_bytes, created_at';

function mapChatMessage(row: ChatMessageRow): ChatMessage {
  const nested = row.chat_attachments;
  const attachmentRow = Array.isArray(nested) ? nested[0] : nested;
  const attachment: ChatAttachment | null = attachmentRow
    ? {
        id: attachmentRow.id,
        message_id: attachmentRow.message_id,
        file_url: attachmentRow.file_url,
        file_type: attachmentRow.file_type,
        file_name: attachmentRow.file_name,
        file_size_bytes: attachmentRow.file_size_bytes,
        created_at: attachmentRow.created_at,
      }
    : null;
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    team_id: row.team_id,
    sender_id: row.sender_id,
    body: row.body,
    created_at: row.created_at,
    attachment,
  };
}

function isAttachmentSetupError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e?.code === '42501' ||
    e?.code === 'PGRST200' ||
    e?.code === 'PGRST204' ||
    /chat_attachments|file_size_bytes|permission denied/i.test(e?.message ?? '')
  );
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
    const joined = await supabase
      .from('chat_messages')
      .select(`${CHAT_MESSAGE_COLUMNS}, chat_attachments(${CHAT_ATTACHMENT_COLUMNS})`)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (!joined.error) {
      return ((joined.data ?? []) as ChatMessageRow[]).map(mapChatMessage);
    }
    if (!isAttachmentSetupError(joined.error)) throw joined.error;

    // Graceful pre-migration fallback: live text chat stays fully usable when
    // chat_attachments grants/metadata are not available yet.
    console.warn('[chat] attachment join unavailable; loading text messages only', joined.error);
    const { data, error } = await supabase
      .from('chat_messages')
      .select(CHAT_MESSAGE_COLUMNS)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as ChatMessageRow[]).map(mapChatMessage);
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
      .select(CHAT_MESSAGE_COLUMNS)
      .single();
    if (error) throw error;
    return mapChatMessage(data as ChatMessageRow);
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
          handlers.onMessage(mapChatMessage(row as ChatMessageRow));
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

interface ChatReadStateRow {
  id: string;
  user_id: string;
  team_id: string;
  last_read_at: string;
}

const READ_STATE_COLUMNS = 'id, user_id, team_id, last_read_at';

const MARK_READ_ERROR = "We couldn't update your unread messages just now.";

const MARK_READ_FAIL: FailMessages = {
  permission: MARK_READ_ERROR,
  network: MARK_READ_ERROR,
  fallback: MARK_READ_ERROR,
};

/**
 * The caller's own chat read states (RLS hides everyone else's). Returns null
 * when unread tracking is unavailable — no client, the chat_read_states
 * migration not applied yet, or any load failure — so callers hide unread
 * badges instead of surfacing an error; chat itself is unaffected.
 */
export async function fetchChatReadStates(): Promise<ChatReadState[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from('chat_read_states').select(READ_STATE_COLUMNS);
  if (error) {
    console.warn('[chat] read states load failed', error);
    return null;
  }
  return (data ?? []) as ChatReadStateRow[];
}

/**
 * Record that the signed-in profile has read one team's chat up to
 * lastReadAt (the newest visible message's created_at — a DB-owned timestamp,
 * so read state and messages share one clock). Upserts onto
 * unique(user_id, team_id); the saved row is returned. Callers guard against
 * moving last_read_at backwards — the newest known state should win.
 */
export async function markChatRead(
  teamId: string,
  lastReadAt: string,
  liveProfileId: string,
): Promise<ChatReadState> {
  const supabase = requireClient();
  try {
    const liveTeamId = requireLiveId(teamId, ['team-'], 'team');
    const userId = requireLiveId(liveProfileId, ['user-'], 'profile');
    const { data, error } = await supabase
      .from('chat_read_states')
      .upsert(
        { user_id: userId, team_id: liveTeamId, last_read_at: lastReadAt },
        { onConflict: 'user_id,team_id' },
      )
      .select(READ_STATE_COLUMNS)
      .single();
    if (error) throw error;
    return data as ChatReadStateRow;
  } catch (error) {
    fail('mark read', error, MARK_READ_FAIL);
  }
}
