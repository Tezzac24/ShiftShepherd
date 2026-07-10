/**
 * Push delivery service - best-effort Edge Function trigger for Chat Message
 * Push Delivery V1.
 *
 * After a live chat message send succeeds, the app asks the
 * `send-chat-message-push` Edge Function to notify the other team members.
 * Only the message id crosses the wire — the function re-validates
 * everything server-side (caller is the sender, message is recent, team
 * access, recipient preferences/tokens) and its delivery ledger makes
 * duplicate calls harmless, so this trigger is deliberately fire-and-forget:
 *
 *  - it must NEVER block, fail, or undo a message send — any problem is a
 *    quiet redacted dev warning, not a user-facing error;
 *  - a missing/undeployed function is expected until the delivery slice is
 *    rolled out and is handled as silently as any other failure;
 *  - there are no retries — the push is a nicety, the message is the truth;
 *  - demo/local mode never gets here (no client, and mock ids are refused).
 *
 * Call this exclusively from the local send-success path. Never call it for
 * messages arriving via realtime/refetch — that would make every *receiver*
 * request delivery too (the server would refuse non-senders, but we don't
 * even ask).
 */
import { getSupabase } from '../client';

const FUNCTION_NAME = 'send-chat-message-push';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ask the server to push-notify the team about a just-sent chat message.
 * Fire-and-forget: returns immediately, never throws, never surfaces errors.
 */
export function requestChatMessagePushDelivery(messageId: string): void {
  const supabase = getSupabase();
  // Demo mode has no client; mock/local ids never leave the app.
  if (!supabase || !UUID_RE.test(messageId)) return;
  void supabase.functions
    .invoke(FUNCTION_NAME, { body: { messageId } })
    .then(({ error }) => {
      if (error) {
        // Redacted on purpose: name/message only, never tokens or payloads.
        console.warn('[pushDelivery] chat push request failed', {
          name: error.name,
          message: error.message,
        });
      }
    })
    .catch((error: unknown) => {
      console.warn(
        '[pushDelivery] chat push request failed',
        error instanceof Error ? error.message : 'unknown error',
      );
    });
}
