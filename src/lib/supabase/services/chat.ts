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
 * streams only the parent chat_messages INSERT; consumers follow arrivals with
 * a coalesced refetch so attachment metadata catches up.
 * `subscribeToSessionChatMessages` opens ONE session-scoped channel per linked
 * profile that streams every accessible new-message INSERT (Realtime authorizes
 * each delivered row against the same RLS SELECT policy) plus the caller's own
 * read-state changes for cross-device reconciliation. list/send stay ordinary
 * RLS-scoped queries and the database remains the source of truth — missed
 * messages are always caught up by a refetch, never replayed by the socket.
 * There is no editing or deleting (no RLS policies exist for either).
 * Attachment Storage/upload/atomic-send logic lives in chatAttachments.ts; this
 * service owns canonical joined reads.
 *
 * Server-authoritative unread state lives in chatReadState.ts (the
 * get_team_chat_unread_summary / mark_team_chat_read RPCs). This service no
 * longer writes read state directly.
 *
 * This service needs the grants migration
 * `20260709205903_grant_authenticated_chat_api_privileges.sql` and the realtime
 * publication migrations `20260710020944_enable_realtime_for_chat_messages.sql`
 * and `20260711173139_add_team_chat_read_cursor.sql` (chat_read_states). If the
 * grants are ever missing, live chat screens show a friendly load/send error;
 * if a publication entry is missing, realtime reports unhealthy and the app
 * falls back to reconciliation catch-up. Demo mode is unaffected either way.
 */
import { REALTIME_SUBSCRIBE_STATES, SupabaseClient } from '@supabase/supabase-js';

import { ChatAttachment, ChatMessage } from '../../../types';
import { getSupabase } from '../client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export interface SessionChatHandlers {
  /** A complete new accessible message arrived (any team the caller can see). */
  onMessage: (message: ChatMessage) => void;
  /** The caller's own read state changed (this or another device). */
  onReadStateChanged: () => void;
  /** The channel recovered after a drop — do an authoritative catch-up. */
  onReconnect: () => void;
  onStatus: (status: ChatRealtimeStatus) => void;
}

/**
 * One session-scoped chat channel for a linked live profile. It streams every
 * accessible chat_messages INSERT (no team filter — Realtime authorizes each
 * delivered row against the chat_messages SELECT policy, so the caller only
 * receives messages for teams they can access) plus the caller's own
 * chat_read_states INSERT/UPDATE (owner-scoped SELECT policy), so a read on one
 * device reconciles the same profile's other devices.
 *
 * Returns an unsubscribe function; no handler fires after it runs. Demo mode /
 * mock or missing profile ids never connect. onReconnect fires only after a
 * genuine drop-and-recover, never on the first subscribe.
 */
export function subscribeToSessionChatMessages(
  profileId: string,
  handlers: SessionChatHandlers,
): () => void {
  const supabase = getSupabase();
  if (!supabase || !UUID_PATTERN.test(profileId)) {
    handlers.onStatus('disconnected');
    return () => {};
  }

  let stopped = false;
  let hadConnectionIssue = false;

  const channel = supabase
    .channel(`chat-session:${profileId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (payload) => {
        if (stopped) return;
        const row = payload.new as Partial<ChatMessageRow>;
        if (
          row.id &&
          row.team_id &&
          row.organisation_id &&
          row.sender_id &&
          row.created_at &&
          typeof row.body === 'string'
        ) {
          handlers.onMessage(mapChatMessage(row as ChatMessageRow));
        }
        // A malformed payload is ignored on the fast path; the next
        // reconciliation still corrects previews and counts authoritatively.
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_read_states' },
      () => {
        if (!stopped) handlers.onReadStateChanged();
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_read_states' },
      () => {
        if (!stopped) handlers.onReadStateChanged();
      },
    )
    .subscribe((status) => {
      if (stopped) return;
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        handlers.onStatus('connected');
        if (hadConnectionIssue) {
          hadConnectionIssue = false;
          handlers.onReconnect();
        }
      } else if (
        status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
      ) {
        hadConnectionIssue = true;
        handlers.onStatus('reconnecting');
      } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
        hadConnectionIssue = true;
        handlers.onStatus('disconnected');
      }
    });

  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
