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
 * V1 chat supports text plus one optional image attachment. Private Broadcast
 * delivery lives in chatBroadcast.ts. Broadcast events are minimal signals;
 * this service fetches the exact signalled message (team + id constrained)
 * through the existing RLS policy and canonical attachment-aware decoder.
 * list/send stay ordinary RLS-scoped queries and the database remains the
 * source of truth — missed messages are caught up by reconciliation/refetch,
 * never trusted from the socket payload.
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
 * historical migrations through `20260711173139_add_team_chat_read_cursor.sql`,
 * plus the forward private-Broadcast corrective migration. If grants are ever
 * missing, live chat screens show a friendly load/send error. Demo mode is
 * unaffected.
 */
import { SupabaseClient } from '@supabase/supabase-js';

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

function requireUuid(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new Error(LOAD_ERROR);
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

export interface FetchChatMessageByIdInput {
  teamId: string;
  messageId: string;
}

/**
 * Fetch one authoritative message after a validated Broadcast signal. Both the
 * team and message id constrain the query as defense in depth; RLS remains the
 * final access check. Returns null when the row is no longer visible/available.
 * The attachment join is bounded to this one row and uses the same decoder as
 * listChatMessages, so caption/Photo/Message previews remain canonical.
 */
export async function fetchChatMessageById({
  teamId,
  messageId,
}: FetchChatMessageByIdInput): Promise<ChatMessage | null> {
  const liveTeamId = requireUuid(teamId);
  const liveMessageId = requireUuid(messageId);
  const supabase = requireClient();

  try {
    const joined = await supabase
      .from('chat_messages')
      .select(`${CHAT_MESSAGE_COLUMNS}, chat_attachments(${CHAT_ATTACHMENT_COLUMNS})`)
      .eq('team_id', liveTeamId)
      .eq('id', liveMessageId)
      .maybeSingle();
    if (!joined.error) {
      return joined.data ? mapChatMessage(joined.data as ChatMessageRow) : null;
    }
    if (!isAttachmentSetupError(joined.error)) throw joined.error;

    const { data, error } = await supabase
      .from('chat_messages')
      .select(CHAT_MESSAGE_COLUMNS)
      .eq('team_id', liveTeamId)
      .eq('id', liveMessageId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapChatMessage(data as ChatMessageRow) : null;
  } catch (error) {
    fail('fetch by id', error, LIST_FAIL);
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
