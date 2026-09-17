/**
 * Push delivery service - best-effort Edge Function trigger for Chat Message
 * Push Delivery V1, Announcement Push Delivery V1, and Rota Push Delivery V1.
 *
 * After a live chat message send, announcement post, or rota save succeeds,
 * the app asks the `send-chat-message-push` Edge Function to notify the
 * people concerned. Only row ids cross the wire — the function re-validates
 * everything server-side (caller is the sender/author or may manage the rota,
 * the change is recent, team/organisation access, recipient
 * preferences/tokens) and its delivery ledger makes duplicate calls harmless,
 * so this trigger is deliberately fire-and-forget:
 *
 *  - it must NEVER block, fail, or undo the write — any problem is a quiet
 *    redacted dev warning, not a user-facing error;
 *  - a missing/undeployed function is expected until the delivery slice is
 *    rolled out and is handled as silently as any other failure;
 *  - there are no retries — the push is a nicety, the row is the truth;
 *  - demo/local mode never gets here (no client, and mock ids are refused).
 *
 * Call these exclusively from the local write-success path. Never call them
 * for rows arriving via realtime/refetch — that would make every *receiver*
 * request delivery too (the server would refuse non-authors, but we don't
 * even ask). Announcement edits never re-notify: only the create path calls.
 */
import { getSupabase } from '../client';

const FUNCTION_NAME = 'send-chat-message-push';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Matches the Edge Function's per-request rota entry limit. */
const MAX_ROTA_ENTRIES_PER_REQUEST = 50;

type PushRequestBody =
  | { messageId: string }
  | { announcementId: string }
  | { rotaEntryIds: string[] };

function invokePushDelivery(label: 'chat' | 'announcement' | 'rota', body: PushRequestBody): void {
  const supabase = getSupabase();
  // Demo mode has no client.
  if (!supabase) return;
  void supabase.functions
    .invoke(FUNCTION_NAME, { body })
    .then(({ error }) => {
      if (error) {
        // Redacted on purpose: name/message only, never tokens or payloads.
        console.warn(`[pushDelivery] ${label} push request failed`, {
          name: error.name,
          message: error.message,
        });
      }
    })
    .catch((error: unknown) => {
      console.warn(
        `[pushDelivery] ${label} push request failed`,
        error instanceof Error ? error.message : 'unknown error',
      );
    });
}

function requestPushDelivery(label: 'chat' | 'announcement', id: string, body: PushRequestBody): void {
  // Mock/local ids never leave the app.
  if (!UUID_RE.test(id)) return;
  invokePushDelivery(label, body);
}

/**
 * Ask the server to push-notify the team about a just-sent chat message.
 * Fire-and-forget: returns immediately, never throws, never surfaces errors.
 */
export function requestChatMessagePushDelivery(messageId: string): void {
  requestPushDelivery('chat', messageId, { messageId });
}

/**
 * Ask the server to push-notify the readers of a just-posted announcement
 * (the organisation for a church-wide one, the team's members for a team
 * one). Fire-and-forget: returns immediately, never throws, never surfaces
 * errors.
 */
export function requestAnnouncementPushDelivery(announcementId: string): void {
  requestPushDelivery('announcement', announcementId, { announcementId });
}

/**
 * Ask the server to push-notify the people on just-saved rota entries of one
 * team. Call it once per logical save — an entry create or edit, a cancel or
 * restore, or every entry of one Plan the Month batch — because the server
 * sends each device at most one notification per request. The server decides
 * what changed (assignments created and entry details changed within the last
 * five minutes) and notifies nobody when nothing did. Fire-and-forget:
 * returns immediately, never throws, never surfaces errors.
 */
export function requestRotaPushDelivery(rotaEntryIds: string[]): void {
  // Mock/local ids never leave the app.
  const ids = [...new Set(rotaEntryIds.filter((id) => UUID_RE.test(id)))];
  for (let start = 0; start < ids.length; start += MAX_ROTA_ENTRIES_PER_REQUEST) {
    invokePushDelivery('rota', {
      rotaEntryIds: ids.slice(start, start + MAX_ROTA_ENTRIES_PER_REQUEST),
    });
  }
}
