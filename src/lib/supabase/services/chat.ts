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
 * V1 chat is deliberately text-only with no realtime: messages are fetched on
 * sign-in, when a chat screen opens, after each send, and on manual refresh.
 * There is no editing or deleting (no RLS policies exist for either), and
 * chat_attachments stays untouched until the Storage slice.
 *
 * This service needs the grants migration
 * `20260709205903_grant_authenticated_chat_api_privileges.sql` applied.
 * Until then, live chat screens show a friendly load/send error; demo mode is
 * unaffected.
 */
import { SupabaseClient } from '@supabase/supabase-js';

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
