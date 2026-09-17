/**
 * Pure dispatch rules for the send-chat-message-push Edge Function.
 *
 * Every push kind (chat messages, announcements, and rota updates) shares
 * one pipeline: resolve the readers of the event, drop the actor, honour
 * each recipient's own notification preference for that kind, look up
 * registered tokens, claim idempotent ledger rows, and send a generic Expo
 * payload.
 *
 * Everything in this module is side-effect free: no Deno globals, no network,
 * no Supabase client. index.ts fetches rows with the service role and hands
 * them here, and the app's Jest suite imports this file directly to pin the
 * request parsing, recipient, preference, dedupe, self-exclusion,
 * cross-organisation, token, ledger-claim, coalescing, and content contracts
 * offline.
 */

export type PushEventType =
  | 'chat_message'
  | 'announcement'
  | 'rota_assignment'
  | 'rota_entry_change';

/** The existing notification_preferences columns each event kind honours. */
export type PreferenceKey =
  | 'chat_notifications'
  | 'announcement_notifications'
  | 'team_announcement_notifications'
  | 'rota_notifications';

export type PushRequest =
  | { kind: 'chat_message'; id: string }
  | { kind: 'announcement'; id: string }
  | { kind: 'rota'; ids: string[] };

/** The profile columns needed to decide whether someone may read an event. */
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

/** One logical event of a request and the profiles it may notify. */
export interface DeliveryEvent {
  eventType: PushEventType;
  eventId: string;
  recipientIds: string[];
  /** The rota entry a rota event belongs to (absent for other kinds). */
  rotaEntryId?: string;
}

/** A ledger row this invocation actually inserted (ON CONFLICT DO NOTHING). */
export interface ClaimedDelivery {
  id: string;
  event_type: string;
  event_id: string;
  recipient_user_id: string;
  push_token_id: string | null;
  status: string;
}

/** Every pending claim for one registered device in one request. */
export interface DeviceDelivery {
  tokenId: string;
  token: string;
  claims: ClaimedDelivery[];
}

/** Routing columns of a rota entry - never its title, date, time, or notes. */
export interface RotaEntryRow {
  id: string;
  organisation_id: string;
  team_id: string;
  details_change_id: string | null;
  details_changed_at: string | null;
}

/** Routing columns of a rota assignment - never its role name. */
export interface RotaAssignmentRow {
  id: string;
  rota_entry_id: string;
  user_id: string;
  created_at: string;
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
    }
  | {
      kind: 'rota';
      teamId: string;
      teamName: string | null;
      /** The rota events newly claimed for the one device being notified. */
      events: { eventType: string; rotaEntryId: string }[];
    };

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Stale or replayed event ids are refused after this age. */
export const EVENT_MAX_AGE_MS = 5 * 60 * 1000;
/** Expo accepts at most 100 messages per request (rate limit 600/s). */
export const EXPO_PUSH_CHUNK_SIZE = 100;
/** PostgREST `in()` filters travel in the query string; keep them bounded. */
export const LOOKUP_CHUNK_SIZE = 100;
/** One rota push request covers at most this many entries of one team. */
export const MAX_ROTA_ENTRIES_PER_REQUEST = 50;

/**
 * Exactly one of { messageId }, { announcementId } (each a UUID), or
 * { rotaEntryIds } (1 to MAX_ROTA_ENTRIES_PER_REQUEST UUIDs, deduplicated).
 * Anything else is a 400 for the caller - never a guess.
 */
export function parsePushRequest(
  body: unknown,
): { request: PushRequest } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid JSON body' };
  }
  const { messageId, announcementId, rotaEntryIds } = body as {
    messageId?: unknown;
    announcementId?: unknown;
    rotaEntryIds?: unknown;
  };
  const provided = [messageId, announcementId, rotaEntryIds].filter(
    (value) => value !== undefined,
  ).length;
  if (provided !== 1) {
    return { error: 'Provide exactly one of messageId, announcementId, or rotaEntryIds' };
  }
  if (messageId !== undefined) {
    if (typeof messageId !== 'string' || !UUID_RE.test(messageId)) {
      return { error: 'messageId must be a UUID' };
    }
    return { request: { kind: 'chat_message', id: messageId } };
  }
  if (announcementId !== undefined) {
    if (typeof announcementId !== 'string' || !UUID_RE.test(announcementId)) {
      return { error: 'announcementId must be a UUID' };
    }
    return { request: { kind: 'announcement', id: announcementId } };
  }
  if (
    !Array.isArray(rotaEntryIds) ||
    rotaEntryIds.length === 0 ||
    rotaEntryIds.length > MAX_ROTA_ENTRIES_PER_REQUEST ||
    rotaEntryIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))
  ) {
    return { error: `rotaEntryIds must be 1 to ${MAX_ROTA_ENTRIES_PER_REQUEST} UUIDs` };
  }
  const ids = [...new Set((rotaEntryIds as string[]).map((id) => id.toLowerCase()))];
  return { request: { kind: 'rota', ids } };
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
 * -> team_announcement_notifications; rota -> rota_notifications. No new
 * keys.
 */
export function preferenceKeyFor(
  event:
    | { kind: 'chat_message' }
    | { kind: 'announcement'; teamId: string | null }
    | { kind: 'rota' },
): PreferenceKey {
  if (event.kind === 'chat_message') return 'chat_notifications';
  if (event.kind === 'rota') return 'rota_notifications';
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
 * Rota updates ("When you are added to a rota or a rota changes") for the
 * entries of one team saved by the caller, who is treated as the actor and
 * is never notified. Only people on the rota are recipients, and only while
 * they are an active, linked profile of the organisation and a current
 * member of the team (church admins who are not team members are not
 * notified, matching the chat and team-announcement convention).
 *
 *  - Added to a rota: one `rota_assignment` event per assignment row created
 *    within the freshness window, for that row's assignee
 *    (event id = rota_assignments.id).
 *  - A rota changed: one `rota_entry_change` event per entry whose
 *    server-maintained change marker (title, date, time, notes, or
 *    cancellation status) is within the freshness window, for the people
 *    whose assignment already existed before that change
 *    (event id = rota_entries.details_change_id). People added by the same
 *    save receive the "added" event instead, so a save never tells anyone
 *    twice.
 *
 * Entries outside the organisation or team are ignored. Assignment-only
 * edits notify only the newly assigned people, and removed assignments or
 * deleted entries notify nobody. Coalescing into one notification per
 * device happens after claiming (see groupPendingClaimsByToken).
 */
export function selectRotaEvents(input: {
  nowMs: number;
  actorId: string;
  organisationId: string;
  teamId: string;
  entries: RotaEntryRow[];
  assignments: RotaAssignmentRow[];
  /** Current members of the team (at least those among the assignees). */
  memberIds: string[];
  profiles: RecipientProfileRow[];
  maxAgeMs?: number;
}): DeliveryEvent[] {
  const maxAgeMs = input.maxAgeMs ?? EVENT_MAX_AGE_MS;
  const members = new Set(input.memberIds);
  const profilesById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const entries = input.entries.filter(
    (entry) => entry.organisation_id === input.organisationId && entry.team_id === input.teamId,
  );
  const entryIds = new Set(entries.map((entry) => entry.id));
  const mayNotify = (userId: string): boolean => {
    const profile = profilesById.get(userId);
    return (
      userId !== input.actorId &&
      members.has(userId) &&
      !!profile &&
      profile.organisation_id === input.organisationId &&
      profile.access_status === 'active' &&
      typeof profile.auth_user_id === 'string' &&
      profile.auth_user_id.length > 0
    );
  };

  const events: DeliveryEvent[] = [];
  for (const assignment of input.assignments) {
    if (!entryIds.has(assignment.rota_entry_id)) continue;
    if (!isFreshEvent(assignment.created_at, input.nowMs, maxAgeMs)) continue;
    if (!mayNotify(assignment.user_id)) continue;
    events.push({
      eventType: 'rota_assignment',
      eventId: assignment.id,
      rotaEntryId: assignment.rota_entry_id,
      recipientIds: [assignment.user_id],
    });
  }

  for (const entry of entries) {
    if (!entry.details_change_id || !entry.details_changed_at) continue;
    if (!isFreshEvent(entry.details_changed_at, input.nowMs, maxAgeMs)) continue;
    const changedAtMs = Date.parse(entry.details_changed_at);
    const alreadyOnRota = input.assignments
      .filter(
        (assignment) =>
          assignment.rota_entry_id === entry.id &&
          Date.parse(assignment.created_at) < changedAtMs &&
          mayNotify(assignment.user_id),
      )
      .map((assignment) => assignment.user_id);
    const recipientIds = uniqueExcluding(alreadyOnRota, input.actorId);
    if (recipientIds.length === 0) continue;
    events.push({
      eventType: 'rota_entry_change',
      eventId: entry.details_change_id,
      rotaEntryId: entry.id,
      recipientIds,
    });
  }
  return events;
}

/** Every profile any event may notify, once each, in first-seen order. */
export function uniqueRecipientIds(events: DeliveryEvent[]): string[] {
  return [...new Set(events.flatMap((event) => event.recipientIds))];
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

/** Ledger rows for every event of a request (a single event for chat and announcements). */
export function buildEventDeliveryAttempts(input: {
  events: DeliveryEvent[];
  disabled: Set<string>;
  tokensByUser: Map<string, RegisteredToken[]>;
}): DeliveryAttempt[] {
  return input.events.flatMap((event) =>
    buildDeliveryAttempts({
      eventType: event.eventType,
      eventId: event.eventId,
      recipientIds: event.recipientIds,
      disabled: input.disabled,
      tokensByUser: input.tokensByUser,
    }),
  );
}

/**
 * The coalescing rule: all pending rows this invocation newly claimed for one
 * registered device become ONE notification to that device, and every row in
 * the group records that notification's outcome. A chat message or
 * announcement is a single event, so each device keeps exactly one claim; a
 * rota save covering several assignments or entries tells each device once.
 * Claims whose token is not in the lookup are left untouched (still pending).
 */
export function groupPendingClaimsByToken(
  claimed: ClaimedDelivery[],
  tokenById: Map<string, string>,
): DeviceDelivery[] {
  const devices = new Map<string, DeviceDelivery>();
  for (const row of claimed) {
    if (row.status !== 'pending' || !row.push_token_id) continue;
    const token = tokenById.get(row.push_token_id);
    if (!token) continue;
    const device = devices.get(row.push_token_id) ?? {
      tokenId: row.push_token_id,
      token,
      claims: [],
    };
    device.claims.push(row);
    devices.set(row.push_token_id, device);
  }
  return [...devices.values()];
}

/**
 * Deliberately generic content with route-safe ids only. Message text,
 * announcement title/body, rota titles/dates/times/notes/roles, images, and
 * author names never appear: a lock screen may be read by anyone, and a
 * recipient opens the app to see the real content under RLS.
 */
export function notificationContentFor(event: NotificationEvent): NotificationContent {
  if (event.kind === 'chat_message') {
    return {
      title: 'New team message',
      body: `You have a new message in ${event.teamName ?? 'your team'}.`,
      data: { type: 'chat_message', teamId: event.teamId, messageId: event.messageId },
    };
  }
  if (event.kind === 'rota') {
    return rotaNotificationContent(event);
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

/**
 * Rota wording for one device: "added" when every newly claimed event added
 * the recipient to a date, "changed" when every one is a change to a date
 * they were already on, and a combined update otherwise. The team name is
 * the only detail; the entry id is included only when exactly one entry is
 * involved.
 */
function rotaNotificationContent(
  event: Extract<NotificationEvent, { kind: 'rota' }>,
): NotificationContent {
  const rota = event.teamName ? `the ${event.teamName} rota` : 'your team rota';
  const entryIds = [...new Set(event.events.map((item) => item.rotaEntryId))];
  const added = event.events.some((item) => item.eventType === 'rota_assignment');
  const changed = event.events.some((item) => item.eventType === 'rota_entry_change');
  const data: Record<string, string> =
    entryIds.length === 1
      ? { type: 'rota', teamId: event.teamId, rotaEntryId: entryIds[0] }
      : { type: 'rota', teamId: event.teamId };
  if (added && !changed) {
    return { title: 'New rota assignment', body: `You have been added to ${rota}.`, data };
  }
  if (changed && !added) {
    return {
      title: 'Rota updated',
      body:
        entryIds.length === 1
          ? `A date you are on in ${rota} has changed.`
          : `Some dates you are on in ${rota} have changed.`,
      data,
    };
  }
  return { title: 'Rota updated', body: `Your dates on ${rota} have been updated.`, data };
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
