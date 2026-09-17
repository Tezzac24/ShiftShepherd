/**
 * Pure dispatch rules for the send-chat-message-push Edge Function.
 *
 * Both push event kinds (chat messages and announcements) share one
 * pipeline: resolve the readers of the event, drop the actor, honour each
 * recipient's own notification preference for that kind, look up registered
 * tokens, claim idempotent ledger rows, and send a generic Expo payload.
 *
 * Everything in this module is side-effect free: no Deno globals, no network,
 * no Supabase client. index.ts fetches rows with the service role and hands
 * them here, and the app's Jest suite imports this file directly to pin the
 * request parsing, recipient, preference, dedupe, self-exclusion,
 * cross-organisation, token, ledger-claim, and content contracts offline.
 */

export type PushEventType = 'chat_message' | 'announcement';

/** The existing notification_preferences columns each event kind honours. */
export type PreferenceKey =
  | 'chat_notifications'
  | 'announcement_notifications'
  | 'team_announcement_notifications';

export type PushRequest =
  | { kind: 'chat_message'; id: string }
  | { kind: 'announcement'; id: string };

/** The profile columns needed to decide whether someone may read an announcement. */
export interface RecipientProfileRow {
  id: string;
  organisation_id: string;
  auth_user_id: string | null;
  access_status: string;
}

export interface PreferenceRow {
  user_id: string;
  [key: string]: unknown;
}

export interface TokenRow {
  id: string;
  user_id: string;
  token: string;
}

export interface RegisteredToken {
  id: string;
  token: string;
}

export interface DeliveryAttempt {
  event_type: PushEventType;
  event_id: string;
  recipient_user_id: string;
  push_token_id: string | null;
  status: 'pending' | 'skipped';
  error_code: 'preference_disabled' | 'no_push_token' | null;
}

export interface NotificationContent {
  title: string;
  body: string;
  data: Record<string, string>;
}

export type NotificationEvent =
  | { kind: 'chat_message'; messageId: string; teamId: string; teamName: string | null }
  | {
      kind: 'announcement';
      announcementId: string;
      teamId: string | null;
      teamName: string | null;
      organisationName: string | null;
    };

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Stale or replayed event ids are refused after this age. */
export const EVENT_MAX_AGE_MS = 5 * 60 * 1000;
/** Expo accepts at most 100 messages per request (rate limit 600/s). */
export const EXPO_PUSH_CHUNK_SIZE = 100;
/** PostgREST `in()` filters travel in the query string; keep them bounded. */
export const LOOKUP_CHUNK_SIZE = 100;

/**
 * Exactly one of { messageId } or { announcementId }, each a UUID. Anything
 * else is a 400 for the caller - never a guess.
 */
export function parsePushRequest(
  body: unknown,
): { request: PushRequest } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid JSON body' };
  }
  const { messageId, announcementId } = body as {
    messageId?: unknown;
    announcementId?: unknown;
  };
  const hasMessage = messageId !== undefined;
  const hasAnnouncement = announcementId !== undefined;
  if (hasMessage === hasAnnouncement) {
    return { error: 'Provide exactly one of messageId or announcementId' };
  }
  if (hasMessage) {
    if (typeof messageId !== 'string' || !UUID_RE.test(messageId)) {
      return { error: 'messageId must be a UUID' };
    }
    return { request: { kind: 'chat_message', id: messageId } };
  }
  if (typeof announcementId !== 'string' || !UUID_RE.test(announcementId)) {
    return { error: 'announcementId must be a UUID' };
  }
  return { request: { kind: 'announcement', id: announcementId } };
}

/** True while the event is recent enough to deliver (unparseable dates are stale). */
export function isFreshEvent(
  createdAt: string,
  nowMs: number,
  maxAgeMs: number = EVENT_MAX_AGE_MS,
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return !Number.isNaN(createdAtMs) && nowMs - createdAtMs <= maxAgeMs;
}

/**
 * The existing preference each kind honours: chat -> chat_notifications;
 * church-wide announcement -> announcement_notifications; team announcement
 * -> team_announcement_notifications. No new keys.
 */
export function preferenceKeyFor(
  event: { kind: 'chat_message' } | { kind: 'announcement'; teamId: string | null },
): PreferenceKey {
  if (event.kind === 'chat_message') return 'chat_notifications';
  return event.teamId ? 'team_announcement_notifications' : 'announcement_notifications';
}

function uniqueExcluding(ids: string[], excludedId: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (id === excludedId || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** Chat: the team's other members, deduped, never the sender. */
export function selectChatRecipientIds(input: {
  senderId: string;
  memberIds: string[];
}): string[] {
  return uniqueExcluding(input.memberIds, input.senderId);
}

/**
 * Announcement readership, mirroring the announcements SELECT policy: an
 * active, linked profile of the announcement's organisation (only such a
 * profile can be someone's current profile under RLS), and for a team
 * announcement additionally a member of that team. The author is never a
 * recipient, and each profile appears at most once however it was reached.
 * Removed profiles hold no tokens anyway; excluding them here keeps the
 * ledger honest too.
 */
export function selectAnnouncementRecipientIds(input: {
  organisationId: string;
  authorId: string;
  profiles: RecipientProfileRow[];
  /** null for a church-wide announcement; the team's member ids otherwise. */
  memberIds: string[] | null;
}): string[] {
  const members = input.memberIds === null ? null : new Set(input.memberIds);
  const eligible = input.profiles
    .filter(
      (profile) =>
        profile.organisation_id === input.organisationId &&
        profile.access_status === 'active' &&
        typeof profile.auth_user_id === 'string' &&
        profile.auth_user_id.length > 0 &&
        (members === null || members.has(profile.id)),
    )
    .map((profile) => profile.id);
  return uniqueExcluding(eligible, input.authorId);
}

/**
 * A missing notification_preferences row means the app's all-on defaults,
 * so only an explicit `false` for the event's key disables delivery.
 */
export function disabledRecipientIds(rows: PreferenceRow[], key: PreferenceKey): Set<string> {
  const disabled = new Set<string>();
  for (const row of rows) {
    if (row[key] === false) disabled.add(row.user_id);
  }
  return disabled;
}

export function groupTokensByUser(rows: TokenRow[]): Map<string, RegisteredToken[]> {
  const byUser = new Map<string, RegisteredToken[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({ id: row.id, token: row.token });
    byUser.set(row.user_id, list);
  }
  return byUser;
}

/**
 * One ledger row per recipient outcome: a logged skip (preference off / no
 * token) or one pending attempt per registered token. These are claimed
 * with ON CONFLICT DO NOTHING against the NULLS NOT DISTINCT idempotency
 * index, so a retried request can never double-send.
 */
export function buildDeliveryAttempts(input: {
  eventType: PushEventType;
  eventId: string;
  recipientIds: string[];
  disabled: Set<string>;
  tokensByUser: Map<string, RegisteredToken[]>;
}): DeliveryAttempt[] {
  const attempts: DeliveryAttempt[] = [];
  for (const recipientId of input.recipientIds) {
    if (input.disabled.has(recipientId)) {
      attempts.push({
        event_type: input.eventType,
        event_id: input.eventId,
        recipient_user_id: recipientId,
        push_token_id: null,
        status: 'skipped',
        error_code: 'preference_disabled',
      });
      continue;
    }
    const tokens = input.tokensByUser.get(recipientId) ?? [];
    if (tokens.length === 0) {
      attempts.push({
        event_type: input.eventType,
        event_id: input.eventId,
        recipient_user_id: recipientId,
        push_token_id: null,
        status: 'skipped',
        error_code: 'no_push_token',
      });
      continue;
    }
    for (const token of tokens) {
      attempts.push({
        event_type: input.eventType,
        event_id: input.eventId,
        recipient_user_id: recipientId,
        push_token_id: token.id,
        status: 'pending',
        error_code: null,
      });
    }
  }
  return attempts;
}

/**
 * Deliberately generic content with route-safe ids only. Message text,
 * announcement title/body, images, and author names never appear: a lock
 * screen may be read by anyone, and a recipient opens the app to see the
 * real content under RLS.
 */
export function notificationContentFor(event: NotificationEvent): NotificationContent {
  if (event.kind === 'chat_message') {
    return {
      title: 'New team message',
      body: `You have a new message in ${event.teamName ?? 'your team'}.`,
      data: { type: 'chat_message', teamId: event.teamId, messageId: event.messageId },
    };
  }
  if (event.teamId) {
    return {
      title: 'New team announcement',
      body: `A new announcement was posted in ${event.teamName ?? 'your team'}.`,
      data: { type: 'announcement', announcementId: event.announcementId, teamId: event.teamId },
    };
  }
  return {
    title: 'New church announcement',
    body: `A new announcement was posted for ${event.organisationName ?? 'your church'}.`,
    data: { type: 'announcement', announcementId: event.announcementId },
  };
}

export function buildExpoMessages(
  tokens: string[],
  content: NotificationContent,
): Record<string, unknown>[] {
  return tokens.map((token) => ({
    to: token,
    title: content.title,
    body: content.body,
    data: content.data,
    sound: 'default',
    // Matches the Android channel the app creates; ignored on iOS.
    channelId: 'default',
  }));
}

/** Expo push tokens must never appear in stored errors or logs. */
export function scrubTokens(text: string): string {
  return text.replace(/Expo(nent)?PushToken\[[^\]]*\]/g, 'ExponentPushToken[redacted]');
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
