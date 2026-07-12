/**
 * send-chat-message-push — Chat Message Push Delivery V1.
 *
 * The app calls this Edge Function best-effort after a chat message send
 * succeeds, passing only { messageId }. Everything else is validated
 * server-side against the database:
 *
 *  - the caller holds a valid Supabase user JWT (verify_jwt also gates this
 *    at the platform level) and maps to a linked profile;
 *  - the message exists, the caller is its sender, it is recent (≤ 5
 *    minutes old — stale/replayed ids are refused), and the caller can
 *    access the team (membership or church_admin);
 *  - recipients are the team's other members, filtered by their
 *    chat_notifications preference (a missing notification_preferences row
 *    means the app's all-on defaults, so it counts as enabled) and by
 *    having at least one registered push token.
 *
 * Idempotency: every attempt is first claimed as a row in
 * public.push_notification_deliveries via ON CONFLICT DO NOTHING on the
 * (event_type, event_id, recipient_user_id, push_token_id) NULLS NOT
 * DISTINCT unique index. Only rows actually inserted by this invocation are
 * acted on, so duplicate app calls or races can never double-send. Skips
 * (preference off / no token) are logged with a reason; Expo outcomes are
 * written back per token (sent + ticket id, or failed + safe error code).
 *
 * Privacy: the notification is deliberately generic — "New team message" /
 * "You have a new message in <Team Name>." with route-safe ids in data.
 * Message text and image details are never included. Push tokens are never
 * logged, never returned, and are scrubbed from any Expo error text before
 * it is stored.
 *
 * The service role key exists only in the Edge Function runtime env (it is
 * required here because this project grants the Data API roles nothing by
 * default); it never ships in the app. No receipts polling, no cron, no
 * triggers, no other event types in this slice.
 */
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts at most 100 messages per request (rate limit 600/s).
const EXPO_PUSH_CHUNK_SIZE = 100;
const MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The app is native-first; CORS only matters for Expo web dev. The JWT (not
// CORS) is the security boundary, so a permissive origin is acceptable here.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
};

interface DeliveryAttempt {
  event_type: 'chat_message';
  event_id: string;
  recipient_user_id: string;
  push_token_id: string | null;
  status: 'pending' | 'skipped';
  error_code: string | null;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Expo push tokens must never appear in stored errors or logs. */
function scrubTokens(text: string): string {
  return text.replace(/Expo(nent)?PushToken\[[^\]]*\]/g, 'ExponentPushToken[redacted]');
}

/** Prefer the legacy env name; fall back to the newer secret-keys dictionary. */
function getServiceRoleKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const dictionary = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (dictionary) {
    try {
      const parsed = JSON.parse(dictionary) as Record<string, string>;
      return parsed.default ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

async function sendExpoChunk(
  messages: Record<string, unknown>[],
): Promise<{ tickets: ExpoPushTicket[] } | { requestError: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Optional Expo "Enhanced Security for Push Notifications" access token.
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });
    const payload = (await response.json().catch(() => null)) as
      | { data?: ExpoPushTicket[]; errors?: { code?: string }[] }
      | null;
    if (!response.ok || !payload || !Array.isArray(payload.data)) {
      const code = payload?.errors?.[0]?.code ?? `http_${response.status}`;
      return { requestError: String(code) };
    }
    return { tickets: payload.data };
  } catch {
    return { requestError: 'network_error' };
  }
}

async function markDelivery(
  admin: SupabaseClient,
  deliveryId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from('push_notification_deliveries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', deliveryId);
  if (error) {
    // The push outcome is already decided; a ledger write failure is only
    // worth a calm log line (the row stays 'pending').
    console.warn('[send-chat-message-push] could not update delivery row', {
      code: error.code,
      message: scrubTokens(error.message ?? ''),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let messageId: unknown;
  try {
    ({ messageId } = (await req.json()) as { messageId?: unknown });
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }
  if (typeof messageId !== 'string' || !UUID_RE.test(messageId)) {
    return jsonResponse(400, { error: 'messageId must be a UUID' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[send-chat-message-push] missing runtime configuration');
    return jsonResponse(500, { error: 'Server configuration error' });
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return jsonResponse(401, { error: 'Not signed in' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Caller: valid auth user with a linked profile --------------------
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: 'Not signed in' });
  }

  // Multi-organisation accounts may own several profiles. Resolve exactly the
  // server-validated active profile; never select an arbitrary auth_user_id row.
  const { data: account, error: accountError } = await admin
    .from('user_accounts')
    .select('active_profile_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (accountError) {
    console.error('[send-chat-message-push] account lookup failed', accountError.code);
    return jsonResponse(500, { error: 'Could not process this request' });
  }
  const { data: profile, error: profileError } = account?.active_profile_id
    ? await admin
        .from('profiles')
        .select('id, organisation_id')
        .eq('id', account.active_profile_id)
        .eq('auth_user_id', userData.user.id)
        .maybeSingle()
    : { data: null, error: null };
  if (profileError) {
    console.error('[send-chat-message-push] profile lookup failed', profileError.code);
    return jsonResponse(500, { error: 'Could not process this request' });
  }
  if (!profile) {
    return jsonResponse(403, { error: 'No linked profile' });
  }

  // --- Message: exists, caller is the sender, recent, team accessible ---
  const { data: message, error: messageError } = await admin
    .from('chat_messages')
    .select('id, organisation_id, team_id, sender_id, created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) {
    console.error('[send-chat-message-push] message lookup failed', messageError.code);
    return jsonResponse(500, { error: 'Could not process this request' });
  }
  if (!message) {
    return jsonResponse(404, { error: 'Message not found' });
  }
  if (message.sender_id !== profile.id) {
    return jsonResponse(403, { error: 'Only the sender can request delivery' });
  }
  const createdAtMs = Date.parse(message.created_at);
  if (Number.isNaN(createdAtMs) || Date.now() - createdAtMs > MESSAGE_MAX_AGE_MS) {
    return jsonResponse(409, { error: 'Message is no longer eligible for push delivery' });
  }

  const { data: senderMembership, error: senderMembershipError } = await admin
    .from('team_memberships')
    .select('id')
    .eq('team_id', message.team_id)
    .eq('user_id', profile.id)
    .maybeSingle();
  if (senderMembershipError) {
    console.error('[send-chat-message-push] sender membership lookup failed', senderMembershipError.code);
    return jsonResponse(500, { error: 'Could not process this request' });
  }
  if (!senderMembership) {
    // Church admins may post in any of their organisation's team chats.
    const { data: adminRole, error: adminRoleError } = await admin
      .from('organisation_roles')
      .select('id')
      .eq('organisation_id', message.organisation_id)
      .eq('user_id', profile.id)
      .eq('role', 'church_admin')
      .maybeSingle();
    if (adminRoleError) {
      console.error('[send-chat-message-push] role lookup failed', adminRoleError.code);
      return jsonResponse(500, { error: 'Could not process this request' });
    }
    if (!adminRole) {
      return jsonResponse(403, { error: 'No access to this team' });
    }
  }

  // --- Recipients: other team members, preference-filtered --------------
  const { data: memberships, error: membershipsError } = await admin
    .from('team_memberships')
    .select('user_id')
    .eq('team_id', message.team_id)
    .neq('user_id', profile.id);
  if (membershipsError) {
    console.error('[send-chat-message-push] memberships lookup failed', membershipsError.code);
    return jsonResponse(500, { error: 'Could not process this request' });
  }
  const recipientIds = [
    ...new Set<string>((memberships ?? []).map((m) => m.user_id as string)),
  ];
  if (recipientIds.length === 0) {
    return jsonResponse(200, { sent: 0, skipped: 0, failed: 0 });
  }

  // A missing notification_preferences row means the app's all-on defaults,
  // so only an explicit chat_notifications = false disables chat push.
  const { data: prefRows, error: prefError } = await admin
    .from('notification_preferences')
    .select('user_id, chat_notifications')
    .in('user_id', recipientIds);
  if (prefError) {
    console.error('[send-chat-message-push] preferences lookup failed', prefError.code);
    return jsonResponse(500, { error: 'Could not process this request' });
  }
  const disabled = new Set<string>(
    (prefRows ?? [])
      .filter((row) => row.chat_notifications === false)
      .map((row) => row.user_id as string),
  );
  const enabledIds = recipientIds.filter((id) => !disabled.has(id));

  const tokensByUser = new Map<string, { id: string; token: string }[]>();
  if (enabledIds.length > 0) {
    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('id, user_id, token')
      .in('user_id', enabledIds);
    if (tokenError) {
      console.error('[send-chat-message-push] token lookup failed', tokenError.code);
      return jsonResponse(500, { error: 'Could not process this request' });
    }
    for (const row of tokenRows ?? []) {
      const list = tokensByUser.get(row.user_id as string) ?? [];
      list.push({ id: row.id as string, token: row.token as string });
      tokensByUser.set(row.user_id as string, list);
    }
  }

  // --- Claim idempotent delivery rows ------------------------------------
  const attempts: DeliveryAttempt[] = [];
  for (const recipientId of recipientIds) {
    if (disabled.has(recipientId)) {
      attempts.push({
        event_type: 'chat_message',
        event_id: message.id,
        recipient_user_id: recipientId,
        push_token_id: null,
        status: 'skipped',
        error_code: 'preference_disabled',
      });
      continue;
    }
    const tokens = tokensByUser.get(recipientId) ?? [];
    if (tokens.length === 0) {
      attempts.push({
        event_type: 'chat_message',
        event_id: message.id,
        recipient_user_id: recipientId,
        push_token_id: null,
        status: 'skipped',
        error_code: 'no_push_token',
      });
      continue;
    }
    for (const token of tokens) {
      attempts.push({
        event_type: 'chat_message',
        event_id: message.id,
        recipient_user_id: recipientId,
        push_token_id: token.id,
        status: 'pending',
        error_code: null,
      });
    }
  }

  // ON CONFLICT DO NOTHING against the idempotency index: only rows this
  // invocation actually inserted come back, so duplicates send nothing.
  const { data: claimedRows, error: claimError } = await admin
    .from('push_notification_deliveries')
    .upsert(attempts, {
      onConflict: 'event_type,event_id,recipient_user_id,push_token_id',
      ignoreDuplicates: true,
    })
    .select('id, recipient_user_id, push_token_id, status');
  if (claimError) {
    console.error('[send-chat-message-push] delivery claim failed', claimError.code);
    return jsonResponse(500, { error: 'Could not process this request' });
  }
  const claimed = claimedRows ?? [];
  const skipped = claimed.filter((row) => row.status === 'skipped').length;

  const tokenById = new Map<string, string>();
  for (const list of tokensByUser.values()) {
    for (const token of list) tokenById.set(token.id, token.token);
  }
  const pendingClaims = claimed
    .filter((row) => row.status === 'pending' && row.push_token_id)
    .map((row) => ({
      deliveryId: row.id as string,
      token: tokenById.get(row.push_token_id as string),
    }))
    .filter((claim): claim is { deliveryId: string; token: string } => !!claim.token);

  if (pendingClaims.length === 0) {
    return jsonResponse(200, { sent: 0, skipped, failed: 0 });
  }

  // --- Send via Expo and record outcomes ---------------------------------
  const { data: team } = await admin
    .from('teams')
    .select('name')
    .eq('id', message.team_id)
    .maybeSingle();
  const teamName = (team?.name as string | undefined) ?? 'your team';

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < pendingClaims.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = pendingClaims.slice(i, i + EXPO_PUSH_CHUNK_SIZE);
    const result = await sendExpoChunk(
      chunk.map((claim) => ({
        to: claim.token,
        title: 'New team message',
        body: `You have a new message in ${teamName}.`,
        data: { type: 'chat_message', teamId: message.team_id, messageId: message.id },
        sound: 'default',
        // Matches the Android channel the app creates; ignored on iOS.
        channelId: 'default',
      })),
    );

    if ('requestError' in result) {
      failed += chunk.length;
      console.warn('[send-chat-message-push] Expo request failed', {
        code: result.requestError,
        messages: chunk.length,
      });
      await Promise.all(
        chunk.map((claim) =>
          markDelivery(admin, claim.deliveryId, {
            status: 'failed',
            error_code: 'expo_request_failed',
            error_message: scrubTokens(result.requestError),
          }),
        ),
      );
      continue;
    }

    // Tickets come back in the same order as the messages in the request.
    await Promise.all(
      chunk.map((claim, index) => {
        const ticket = result.tickets[index];
        if (ticket && ticket.status === 'ok') {
          sent += 1;
          return markDelivery(admin, claim.deliveryId, {
            status: 'sent',
            expo_ticket_id: ticket.id ?? null,
            sent_at: new Date().toISOString(),
          });
        }
        failed += 1;
        return markDelivery(admin, claim.deliveryId, {
          status: 'failed',
          error_code: ticket?.details?.error ?? 'unknown_ticket',
          error_message: scrubTokens(ticket?.message ?? 'No ticket returned'),
        });
      }),
    );
  }

  return jsonResponse(200, { sent, skipped, failed });
});
