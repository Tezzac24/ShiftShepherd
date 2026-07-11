/**
 * Server-authoritative team chat read state — live Supabase slice.
 *
 * Chat Unread State & Session-Wide Messaging Freshness V1. Two narrow RPCs:
 *
 *   - get_team_chat_unread_summary()          → per-accessible-team unread
 *   - mark_team_chat_read(p_team_id, p_msg_id) → forward-only read cursor
 *
 * The caller is always derived server-side from auth.uid(); this service never
 * sends a profile id, user id, read timestamp, role, or organisation. Demo /
 * mock identifiers are rejected before any client is obtained. Personal message
 * content is never logged; only error codes are. Raw Supabase errors are mapped
 * to calm, typed outcomes.
 *
 * Requires migration 20260711173139_add_team_chat_read_cursor.sql. Until it is
 * pushed, fetchTeamChatUnreadSummary reports "unavailable" (null) so unread
 * badges simply hide — chat itself is unaffected — and markTeamChatRead surfaces
 * a calm bookkeeping error that never blocks reading. Demo mode never calls it.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { TeamChatReadCursor, TeamChatUnreadEntry } from '../../../types';
import { getSupabase } from '../client';

export const CHAT_READ_DEMO_ERROR =
  'Unread messages sync when you sign in with your church account.';
export const CHAT_READ_OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";
export const CHAT_READ_MARK_ERROR =
  "We couldn't update your unread messages just now.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MarkTeamChatReadInput {
  teamId: string;
  messageId: string;
}

interface UnreadSummaryRow {
  team_id: string;
  unread_count: number | string;
  latest_message_id: string | null;
  latest_message_created_at: string | null;
  latest_message_sender_id: string | null;
  last_read_message_id: string | null;
  last_read_at: string | null;
}

interface ReadCursorRow {
  team_id: string;
  last_read_message_id: string | null;
  last_read_at: string | null;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(CHAT_READ_OFFLINE_ERROR);
  return supabase;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isMissingFunctionError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = messageOf(error);
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|function .* does not exist/i.test(message)
  );
}

function isValidSummaryRow(row: UnreadSummaryRow | null): row is UnreadSummaryRow {
  return (
    !!row &&
    UUID_PATTERN.test(row.team_id) &&
    Number.isFinite(Number(row.unread_count))
  );
}

/**
 * The caller's authoritative unread summary (one row per accessible team,
 * including zero-unread teams). Returns null when the summary is unavailable —
 * no client, migration not applied yet, or any load failure — so callers keep
 * whatever unread state they already have and simply skip this reconciliation.
 * Never throws and never surfaces an error: unread badges are an enhancement.
 */
export async function fetchTeamChatUnreadSummary(): Promise<
  TeamChatUnreadEntry[] | null
> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_team_chat_unread_summary');
  if (error) {
    console.warn('[chatReadState] unread summary load failed', {
      code: (error as { code?: string })?.code,
    });
    return null;
  }
  const rows = (data ?? []) as UnreadSummaryRow[];
  return rows.filter(isValidSummaryRow).map((row) => ({
    team_id: row.team_id,
    unread_count: Math.max(0, Math.trunc(Number(row.unread_count)) || 0),
    latest_message_id: row.latest_message_id,
    latest_message_created_at: row.latest_message_created_at,
    latest_message_sender_id: row.latest_message_sender_id,
    last_read_message_id: row.last_read_message_id,
    last_read_at: row.last_read_at,
  }));
}

function friendlyMarkError(error: unknown): Error {
  if (error instanceof Error && error.message === CHAT_READ_DEMO_ERROR) return error;
  if (error instanceof Error && error.message === CHAT_READ_OFFLINE_ERROR) return error;
  // Every backend failure (unlinked profile, inaccessible team, message not
  // found, missing function, network, generic) maps to one calm message. The
  // caller treats mark-read as best-effort bookkeeping and never blocks
  // reading on it, so no case needs distinct copy or leaks message existence.
  return new Error(CHAT_READ_MARK_ERROR);
}

/**
 * Advance the caller's read cursor for one team to a specific message. Only the
 * team id and message id are sent; the caller and the cursor timestamp are
 * derived server-side, and the cursor only ever moves forward (idempotent).
 * Rejects demo/mock ids before touching Supabase.
 */
export async function markTeamChatRead(
  input: MarkTeamChatReadInput,
): Promise<TeamChatReadCursor> {
  try {
    if (!UUID_PATTERN.test(input.teamId) || !UUID_PATTERN.test(input.messageId)) {
      throw new Error(CHAT_READ_DEMO_ERROR);
    }
    const { data, error } = await requireClient().rpc('mark_team_chat_read', {
      p_team_id: input.teamId,
      p_message_id: input.messageId,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as ReadCursorRow | null;
    if (!row || row.team_id !== input.teamId) {
      // A no-op forward guard can legitimately return the existing row; fall
      // back to the requested team so callers still get a stable cursor shape.
      return {
        team_id: input.teamId,
        last_read_message_id: row?.last_read_message_id ?? input.messageId,
        last_read_at: row?.last_read_at ?? null,
      };
    }
    return {
      team_id: row.team_id,
      last_read_message_id: row.last_read_message_id,
      last_read_at: row.last_read_at,
    };
  } catch (error) {
    console.warn('[chatReadState] mark read failed', {
      code: (error as { code?: string })?.code,
      missingFunction: isMissingFunctionError(error),
    });
    throw friendlyMarkError(error);
  }
}
