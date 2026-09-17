/**
 * send-chat-message-push — Push Delivery V1 (chat messages, announcements,
 * and rota updates).
 *
 * The app calls this Edge Function best-effort after a live write succeeds,
 * passing exactly one of: { messageId } after a chat message send (Chat
 * Message Push Delivery V1, unchanged), { announcementId } after an
 * announcement is posted (Announcement Push Delivery V1, unchanged), or
 * { rotaEntryIds } after a rota save (Rota Push Delivery V1: one entry save,
 * cancel, or restore, or every entry of one Plan the Month batch). Everything
 * else is validated server-side against the database:
 *
 *  - the caller holds a valid Supabase user JWT (verify_jwt also gates this
 *    at the platform level) and maps to the server-validated active profile
 *    of a multi-organisation account;
 *  - chat: the message exists, the caller is its sender, it is recent (≤ 5
 *    minutes old — stale/replayed ids are refused), and the caller can
 *    access the team (membership or church_admin); recipients are the team's
 *    other members, filtered by their chat_notifications preference;
 *  - announcement: the announcement exists, the caller is its author in the
 *    same organisation, it is recent (same 5-minute window), and for a team
 *    announcement the team is active (archived teams deliver nothing);
 *    recipients mirror the announcements SELECT policy — active, linked
 *    profiles of that organisation, and for a team announcement the team's
 *    members — filtered by announcement_notifications (church-wide) or
 *    team_announcement_notifications (team). The author is never notified,
 *    and each profile is notified at most once.
 *  - rota: every entry exists in the caller's organisation, all belong to one
 *    active (non-archived) team, and the caller may manage that rota (team
 *    leader or church admin, mirroring can_manage_team). Recipients are the
 *    people on those entries who are active, linked, same-organisation
 *    current team members, filtered by rota_notifications: an assignee whose
 *    assignment row is at most 5 minutes old was added to a rota
 *    (rota_assignment), and an assignee already on an entry whose
 *    trigger-maintained change marker (title, date, time, notes, or
 *    cancellation status) is at most 5 minutes old saw that rota change
 *    (rota_entry_change). The caller is never notified.
 *  - a missing notification_preferences row means the app's all-on
 *    defaults, so only an explicit false disables delivery; recipients need
 *    at least one registered push token.
 *
 * Idempotency: every attempt is first claimed as a row in
 * public.push_notification_deliveries via ON CONFLICT DO NOTHING on the
 * (event_type, event_id, recipient_user_id, push_token_id) NULLS NOT
 * DISTINCT unique index. Only rows actually inserted by this invocation are
 * acted on, so duplicate app calls or races can never double-send. Skips
 * (preference off / no token) are logged with a reason; Expo outcomes are
 * written back per token (sent + ticket id, or failed + safe error code).
 * Coalescing: every row newly claimed for one device in one request becomes
 * one notification, so a rota save touching several assignments or dates
 * tells each device once (chat and announcements have one row per device).
 *
 * Privacy: notifications are deliberately generic — "New team message" /
 * "You have a new message in <Team Name>.", "New team announcement" /
 * "A new announcement was posted in <Team Name>.", "New church
 * announcement" / "A new announcement was posted for <Organisation Name>.",
 * "New rota assignment" / "You have been added to the <Team Name> rota.",
 * "Rota updated" / "A date you are on in the <Team Name> rota has changed."
 * — with route-safe ids in data. Message text, announcement title/body, rota
 * titles/dates/times/notes/roles, image details, and author names are never
 * included (never even selected). Push tokens are never logged, never
 * returned, and are scrubbed from any Expo error text before it is stored.
 *
 * The service role key exists only in the Edge Function runtime env (it is
 * required here because this project grants the Data API roles nothing by
 * default); it never ships in the app. No receipts polling, no cron, no
 * queue, no push-sending triggers, no other event types. The pure rules live
 * in ./dispatch.ts so the app's Jest suite can pin them offline.
 */
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  buildEventDeliveryAttempts,
  buildExpoMessages,
  chunk,
  disabledRecipientIds,
  EXPO_PUSH_CHUNK_SIZE,
  groupPendingClaimsByToken,
  groupTokensByUser,
  isFreshEvent,
  LOOKUP_CHUNK_SIZE,
  notificationContentFor,
  parsePushRequest,
  preferenceKeyFor,
  scrubTokens,
  selectAnnouncementRecipientIds,
  selectChatRecipientIds,
  selectRotaEvents,
  uniqueRecipientIds,
  type ClaimedDelivery,
  type DeliveryEvent,
  type NotificationContent,
  type PreferenceKey,
  type PreferenceRow,
  type PushEventType,
  type RecipientProfileRow,
  type RotaAssignmentRow,
  type RotaEntryRow,
  type TokenRow,
} from './dispatch.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const LOG_PREFIX = '[send-chat-message-push]';

// The app is native-first; CORS only matters for Expo web dev. The JWT (not
// CORS) is the security boundary, so a permissive origin is acceptable here.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
};

interface CallerProfile {
  id: string;
  organisation_id: string;
}

interface ResolvedEvent {
  eventType: PushEventType;
  eventId: string;
  recipientIds: string[];
  preferenceKey: PreferenceKey;
  /** Display names are fetched lazily — only when something will be sent. */
  content: () => Promise<NotificationContent>;
}

type Resolution = { event: ResolvedEvent } | { response: Response };

/** Everything the shared delivery pipeline needs for one request of any kind. */
interface ResolvedDelivery {
  events: DeliveryEvent[];
  preferenceKey: PreferenceKey;
  /** Content for one device, from the ledger rows newly claimed for it. */
  contentFor: (claims: ClaimedDelivery[]) => Promise<NotificationContent>;
}

type DeliveryResolution = { delivery: ResolvedDelivery } | { response: Response };

/** Rows per page for lookups that an id list alone does not bound. */
const PAGE_SIZE = 500;

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface QueryError {
  code?: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** A database read failed: log the code only and answer generically. */
function serverError(step: string, error: QueryError): Response {
  console.error(`${LOG_PREFIX} ${step} failed`, error.code);
  return jsonResponse(500, { error: 'Could not process this request' });
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

/**
 * Run an `in()` lookup in bounded chunks so a large organisation never
 * produces an over-long PostgREST query string.
 */
async function selectInChunks<T>(
  ids: string[],
  load: (part: string[]) => PromiseLike<{ data: T[] | null; error: QueryError | null }>,
): Promise<{ rows: T[] } | { error: QueryError }> {
  const rows: T[] = [];
  for (const part of chunk(ids, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await load(part);
    if (error) return { error };
    rows.push(...(data ?? []));
  }
  return { rows };
}

/**
 * Read every row of an ordered query in pages (smaller than the Data API's
 * default 1000-row cap), so a large rota is never silently cut off.
 */
async function selectAllPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: QueryError | null }>,
): Promise<{ rows: T[] } | { error: QueryError }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1);
    if (error) return { error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows };
  }
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
    console.warn(`${LOG_PREFIX} could not update delivery row`, {
      code: error.code,
      message: scrubTokens(error.message ?? ''),
    });
  }
}

// --- Chat message: exists, caller is the sender, recent, team accessible ---
async function resolveChatMessage(
  admin: SupabaseClient,
  profile: CallerProfile,
  messageId: string,
): Promise<Resolution> {
  const { data: message, error: messageError } = await admin
    .from('chat_messages')
    .select('id, organisation_id, team_id, sender_id, created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) return { response: serverError('message lookup', messageError) };
  if (!message) return { response: jsonResponse(404, { error: 'Message not found' }) };
  if (message.sender_id !== profile.id) {
    return { response: jsonResponse(403, { error: 'Only the sender can request delivery' }) };
  }
  if (!isFreshEvent(message.created_at as string, Date.now())) {
    return {
      response: jsonResponse(409, { error: 'Message is no longer eligible for push delivery' }),
    };
  }

  const { data: senderMembership, error: senderMembershipError } = await admin
    .from('team_memberships')
    .select('id')
    .eq('team_id', message.team_id)
    .eq('user_id', profile.id)
    .maybeSingle();
  if (senderMembershipError) {
    return { response: serverError('sender membership lookup', senderMembershipError) };
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
    if (adminRoleError) return { response: serverError('role lookup', adminRoleError) };
    if (!adminRole) return { response: jsonResponse(403, { error: 'No access to this team' }) };
  }

  const { data: memberships, error: membershipsError } = await admin
    .from('team_memberships')
    .select('user_id')
    .eq('team_id', message.team_id)
    .neq('user_id', profile.id);
  if (membershipsError) return { response: serverError('memberships lookup', membershipsError) };

  const teamId = message.team_id as string;
  return {
    event: {
      eventType: 'chat_message',
      eventId: message.id as string,
      recipientIds: selectChatRecipientIds({
        senderId: profile.id,
        memberIds: (memberships ?? []).map((row) => row.user_id as string),
      }),
      preferenceKey: preferenceKeyFor({ kind: 'chat_message' }),
      content: async () => {
        const { data: team } = await admin
          .from('teams')
          .select('name')
          .eq('id', teamId)
          .maybeSingle();
        return notificationContentFor({
          kind: 'chat_message',
          messageId: message.id as string,
          teamId,
          teamName: (team?.name as string | undefined) ?? null,
        });
      },
    },
  };
}

// --- Announcement: exists, caller is the author, recent, readers resolved ---
async function resolveAnnouncement(
  admin: SupabaseClient,
  profile: CallerProfile,
  announcementId: string,
): Promise<Resolution> {
  // Only routing/eligibility columns: title, body, and image_url are never
  // read here, so they can never reach a notification payload.
  const { data: announcement, error: announcementError } = await admin
    .from('announcements')
    .select('id, organisation_id, team_id, created_by, created_at')
    .eq('id', announcementId)
    .maybeSingle();
  if (announcementError) {
    return { response: serverError('announcement lookup', announcementError) };
  }
  if (!announcement) {
    return { response: jsonResponse(404, { error: 'Announcement not found' }) };
  }
  if (
    announcement.created_by !== profile.id ||
    announcement.organisation_id !== profile.organisation_id
  ) {
    return { response: jsonResponse(403, { error: 'Only the author can request delivery' }) };
  }
  if (!isFreshEvent(announcement.created_at as string, Date.now())) {
    return {
      response: jsonResponse(409, {
        error: 'Announcement is no longer eligible for push delivery',
      }),
    };
  }

  const organisationId = announcement.organisation_id as string;
  const teamId = (announcement.team_id as string | null) ?? null;
  let teamName: string | null = null;
  let memberIds: string[] | null = null;
  let profileRows: RecipientProfileRow[];

  if (teamId) {
    // Team announcements reach the team's members only, and archived teams
    // have no active readers (the access helpers fail closed for them).
    const { data: team, error: teamError } = await admin
      .from('teams')
      .select('id, name, archived_at')
      .eq('id', teamId)
      .eq('organisation_id', organisationId)
      .maybeSingle();
    if (teamError) return { response: serverError('team lookup', teamError) };
    if (!team || team.archived_at) {
      return {
        response: jsonResponse(409, { error: 'This team is not available for push delivery' }),
      };
    }
    teamName = (team.name as string | undefined) ?? null;

    const { data: memberships, error: membershipsError } = await admin
      .from('team_memberships')
      .select('user_id')
      .eq('team_id', teamId);
    if (membershipsError) {
      return { response: serverError('memberships lookup', membershipsError) };
    }
    memberIds = [...new Set((memberships ?? []).map((row) => row.user_id as string))];

    const loaded = await selectInChunks<RecipientProfileRow>(memberIds, (part) =>
      admin
        .from('profiles')
        .select('id, organisation_id, auth_user_id, access_status')
        .in('id', part),
    );
    if ('error' in loaded) return { response: serverError('profiles lookup', loaded.error) };
    profileRows = loaded.rows;
  } else {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, organisation_id, auth_user_id, access_status')
      .eq('organisation_id', organisationId)
      .eq('access_status', 'active')
      .not('auth_user_id', 'is', null);
    if (profilesError) return { response: serverError('profiles lookup', profilesError) };
    profileRows = (profiles ?? []) as RecipientProfileRow[];
  }

  return {
    event: {
      eventType: 'announcement',
      eventId: announcement.id as string,
      recipientIds: selectAnnouncementRecipientIds({
        organisationId,
        authorId: profile.id,
        profiles: profileRows,
        memberIds,
      }),
      preferenceKey: preferenceKeyFor({ kind: 'announcement', teamId }),
      content: async () => {
        let organisationName: string | null = null;
        if (!teamId) {
          const { data: organisation } = await admin
            .from('organisations')
            .select('name')
            .eq('id', organisationId)
            .maybeSingle();
          organisationName = (organisation?.name as string | undefined) ?? null;
        }
        return notificationContentFor({
          kind: 'announcement',
          announcementId: announcement.id as string,
          teamId,
          teamName,
          organisationName,
        });
      },
    },
  };
}

/**
 * A chat message or announcement is one event with the same content for
 * every device; its display names are loaded once, only if something sends.
 */
function singleEventDelivery(event: ResolvedEvent): ResolvedDelivery {
  let content: Promise<NotificationContent> | null = null;
  return {
    events: [
      { eventType: event.eventType, eventId: event.eventId, recipientIds: event.recipientIds },
    ],
    preferenceKey: event.preferenceKey,
    contentFor: () => {
      content ??= event.content();
      return content;
    },
  };
}

// --- Rota: one team's entries, caller manages that rota, events resolved ---
async function resolveRota(
  admin: SupabaseClient,
  profile: CallerProfile,
  entryIds: string[],
): Promise<DeliveryResolution> {
  // Only routing columns: titles, dates, times, notes, and role names are
  // never read here, so they can never reach a notification payload.
  const { data: entryRows, error: entriesError } = await admin
    .from('rota_entries')
    .select('id, organisation_id, team_id, details_change_id, details_changed_at')
    .in('id', entryIds);
  if (entriesError) return { response: serverError('rota entries lookup', entriesError) };
  const entries = (entryRows ?? []) as RotaEntryRow[];
  if (entries.length !== entryIds.length) {
    return { response: jsonResponse(404, { error: 'Rota entry not found' }) };
  }
  if (entries.some((entry) => entry.organisation_id !== profile.organisation_id)) {
    return { response: jsonResponse(403, { error: 'No access to this rota' }) };
  }
  if (new Set(entries.map((entry) => entry.team_id)).size !== 1) {
    return { response: jsonResponse(400, { error: 'Rota entries must belong to one team' }) };
  }
  const organisationId = profile.organisation_id;
  const teamId = entries[0].team_id;

  // Archived teams have no active rota readers or managers.
  const { data: team, error: teamError } = await admin
    .from('teams')
    .select('id, name, archived_at')
    .eq('id', teamId)
    .eq('organisation_id', organisationId)
    .maybeSingle();
  if (teamError) return { response: serverError('team lookup', teamError) };
  if (!team || team.archived_at) {
    return {
      response: jsonResponse(409, { error: 'This team is not available for push delivery' }),
    };
  }

  // Only someone who may manage this rota (the team's leader or a church
  // admin of its organisation, mirroring can_manage_team) can ask.
  const { data: leadership, error: leadershipError } = await admin
    .from('team_memberships')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', profile.id)
    .eq('role', 'team_leader')
    .maybeSingle();
  if (leadershipError) return { response: serverError('leader lookup', leadershipError) };
  if (!leadership) {
    const { data: adminRole, error: adminRoleError } = await admin
      .from('organisation_roles')
      .select('id')
      .eq('organisation_id', organisationId)
      .eq('user_id', profile.id)
      .eq('role', 'church_admin')
      .maybeSingle();
    if (adminRoleError) return { response: serverError('role lookup', adminRoleError) };
    if (!adminRole) {
      return { response: jsonResponse(403, { error: 'Only rota managers can request delivery' }) };
    }
  }

  // Routing columns only (never role_name), every page.
  const assignments = await selectAllPages<RotaAssignmentRow>((from, to) =>
    admin
      .from('rota_assignments')
      .select('id, rota_entry_id, user_id, created_at')
      .in('rota_entry_id', entryIds)
      .order('id', { ascending: true })
      .range(from, to),
  );
  if ('error' in assignments) {
    return { response: serverError('assignments lookup', assignments.error) };
  }
  const assigneeIds = [...new Set(assignments.rows.map((row) => row.user_id))];

  const profiles = await selectInChunks<RecipientProfileRow>(assigneeIds, (part) =>
    admin
      .from('profiles')
      .select('id, organisation_id, auth_user_id, access_status')
      .in('id', part),
  );
  if ('error' in profiles) return { response: serverError('profiles lookup', profiles.error) };

  const members = await selectInChunks<{ user_id: string }>(assigneeIds, (part) =>
    admin.from('team_memberships').select('user_id').eq('team_id', teamId).in('user_id', part),
  );
  if ('error' in members) return { response: serverError('memberships lookup', members.error) };

  const events = selectRotaEvents({
    nowMs: Date.now(),
    actorId: profile.id,
    organisationId,
    teamId,
    entries,
    assignments: assignments.rows,
    memberIds: members.rows.map((row) => row.user_id),
    profiles: profiles.rows,
  });
  const entryByEvent = new Map<string, string>();
  for (const event of events) {
    if (event.rotaEntryId) entryByEvent.set(`${event.eventType}:${event.eventId}`, event.rotaEntryId);
  }
  const teamName = (team.name as string | undefined) ?? null;

  return {
    delivery: {
      events,
      preferenceKey: preferenceKeyFor({ kind: 'rota' }),
      contentFor: (claims) =>
        Promise.resolve(
          notificationContentFor({
            kind: 'rota',
            teamId,
            teamName,
            events: claims.flatMap((claim) => {
              const rotaEntryId = entryByEvent.get(`${claim.event_type}:${claim.event_id}`);
              return rotaEntryId ? [{ eventType: claim.event_type, rotaEntryId }] : [];
            }),
          }),
        ),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }
  const parsed = parsePushRequest(body);
  if ('error' in parsed) {
    return jsonResponse(400, { error: parsed.error });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${LOG_PREFIX} missing runtime configuration`);
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
  if (accountError) return serverError('account lookup', accountError);
  const { data: profile, error: profileError } = account?.active_profile_id
    ? await admin
        .from('profiles')
        .select('id, organisation_id')
        .eq('id', account.active_profile_id)
        .eq('auth_user_id', userData.user.id)
        .maybeSingle()
    : { data: null, error: null };
  if (profileError) return serverError('profile lookup', profileError);
  if (!profile) {
    return jsonResponse(403, { error: 'No linked profile' });
  }
  const caller: CallerProfile = {
    id: profile.id as string,
    organisation_id: profile.organisation_id as string,
  };

  // --- Event: kind-specific validation and readership --------------------
  const request = parsed.request;
  let resolution: DeliveryResolution;
  if (request.kind === 'rota') {
    resolution = await resolveRota(admin, caller, request.ids);
  } else {
    const single =
      request.kind === 'chat_message'
        ? await resolveChatMessage(admin, caller, request.id)
        : await resolveAnnouncement(admin, caller, request.id);
    resolution = 'response' in single ? single : { delivery: singleEventDelivery(single.event) };
  }
  if ('response' in resolution) return resolution.response;
  const { events, preferenceKey, contentFor } = resolution.delivery;
  const recipientIds = uniqueRecipientIds(events);
  if (recipientIds.length === 0) {
    return jsonResponse(200, { sent: 0, skipped: 0, failed: 0 });
  }

  // --- Recipients: preference-filtered, token-resolved -------------------
  const preferences = await selectInChunks<PreferenceRow>(recipientIds, (part) =>
    admin
      .from('notification_preferences')
      .select(`user_id, ${preferenceKey}`)
      .in('user_id', part),
  );
  if ('error' in preferences) return serverError('preferences lookup', preferences.error);
  const disabled = disabledRecipientIds(preferences.rows, preferenceKey);
  const enabledIds = recipientIds.filter((id) => !disabled.has(id));

  const tokens = await selectInChunks<TokenRow>(enabledIds, (part) =>
    admin.from('push_tokens').select('id, user_id, token').in('user_id', part),
  );
  if ('error' in tokens) return serverError('token lookup', tokens.error);
  const tokensByUser = groupTokensByUser(tokens.rows);

  // --- Claim idempotent delivery rows ------------------------------------
  const attempts = buildEventDeliveryAttempts({ events, disabled, tokensByUser });

  // ON CONFLICT DO NOTHING against the idempotency index: only rows this
  // invocation actually inserted come back, so duplicates send nothing.
  const { data: claimedRows, error: claimError } = await admin
    .from('push_notification_deliveries')
    .upsert(attempts, {
      onConflict: 'event_type,event_id,recipient_user_id,push_token_id',
      ignoreDuplicates: true,
    })
    .select('id, event_type, event_id, recipient_user_id, push_token_id, status');
  if (claimError) return serverError('delivery claim', claimError);
  const claimed = (claimedRows ?? []) as ClaimedDelivery[];
  const skipped = claimed.filter((row) => row.status === 'skipped').length;

  const tokenById = new Map<string, string>();
  for (const list of tokensByUser.values()) {
    for (const token of list) tokenById.set(token.id, token.token);
  }
  // One notification per device per request (one claim each for chat and
  // announcements; a rota save's claims for a device are coalesced).
  const devices = groupPendingClaimsByToken(claimed, tokenById);

  if (devices.length === 0) {
    return jsonResponse(200, { sent: 0, skipped, failed: 0 });
  }

  // --- Send via Expo and record outcomes ---------------------------------
  let sent = 0;
  let failed = 0;
  for (const part of chunk(devices, EXPO_PUSH_CHUNK_SIZE)) {
    const contents = await Promise.all(part.map((device) => contentFor(device.claims)));
    const result = await sendExpoChunk(
      part.flatMap((device, index) => buildExpoMessages([device.token], contents[index])),
    );

    if ('requestError' in result) {
      const claims = part.flatMap((device) => device.claims);
      failed += claims.length;
      console.warn(`${LOG_PREFIX} Expo request failed`, {
        code: result.requestError,
        messages: part.length,
      });
      await Promise.all(
        claims.map((claim) =>
          markDelivery(admin, claim.id, {
            status: 'failed',
            error_code: 'expo_request_failed',
            error_message: scrubTokens(result.requestError),
          }),
        ),
      );
      continue;
    }

    // Tickets come back in the same order as the messages in the request;
    // every claim coalesced into a device's message shares its outcome.
    await Promise.all(
      part.flatMap((device, index) => {
        const ticket = result.tickets[index];
        if (ticket && ticket.status === 'ok') {
          sent += device.claims.length;
          return device.claims.map((claim) =>
            markDelivery(admin, claim.id, {
              status: 'sent',
              expo_ticket_id: ticket.id ?? null,
              sent_at: new Date().toISOString(),
            }),
          );
        }
        failed += device.claims.length;
        return device.claims.map((claim) =>
          markDelivery(admin, claim.id, {
            status: 'failed',
            error_code: ticket?.details?.error ?? 'unknown_ticket',
            error_message: scrubTokens(ticket?.message ?? 'No ticket returned'),
          }),
        );
      }),
    );
  }

  return jsonResponse(200, { sent, skipped, failed });
});
