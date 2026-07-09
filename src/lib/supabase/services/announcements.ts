/**
 * Announcements service — the first live Supabase feature-data slice.
 *
 * All Supabase reads/writes for announcements live here so screens and
 * AppDataContext never build queries themselves. The service:
 *
 *  - talks to the live `announcements` table exactly as it exists in the dev
 *    project (columns: id, organisation_id, team_id, title, body, audience,
 *    pinned, image_url, linked_event_id, created_by, created_at, updated_at —
 *    note `body`, not "content", and `pinned`, not "priority");
 *  - relies on RLS for all real permission enforcement (authenticated-only;
 *    church announcements need admin/announcement manager, team announcements
 *    need team management, `created_by` must be the caller's profile) and
 *    translates rejections into friendly plain-English errors;
 *  - never uses service-role keys; anonymous sessions are blocked by RLS.
 *
 * Phase note — id bridging: feature data other than announcements is still
 * mocked, so screens know people/teams by mock ids ('user-sarah',
 * 'team-choir'), while the database uses UUIDs. Rows are mapped at this
 * boundary: live profile UUIDs ↔ mock user ids (matched by email) and live
 * team UUIDs ↔ mock team ids (matched by name), mirroring the email bridge in
 * AuthContext. TODO: wire to Supabase — remove the bridge once profiles and
 * teams go live (docs/supabase-integration-plan.md, step 6).
 *
 * Linked events stay local-only for now: mock event ids don't exist in the
 * live database, so writes never send `linked_event_id` and reads keep the
 * raw value (a live event UUID simply doesn't resolve against mock events,
 * so the "linked event" card stays hidden). Wired properly in step 5 (events).
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { Announcement, AnnouncementAudience } from '../../../types';
import { mockTeams, mockUsers } from '../../mockData';
import { getSupabase } from '../client';

// Friendly, non-technical messages — shown directly in the UI.
const LOAD_ERROR = 'We couldn’t load announcements right now. Please try again.';
const SAVE_ERROR = 'Your changes could not be saved. Please try again.';
const DELETE_ERROR = 'This announcement could not be deleted. Please try again.';
const PERMISSION_ERROR = 'You do not have permission to do that.';
const MISSING_ERROR = 'This announcement is no longer available. It may have been removed.';
const OFFLINE_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';

/** What callers provide to create an announcement (matches AppDataContext). */
export type NewAnnouncementInput = Omit<
  Announcement,
  'id' | 'organisation_id' | 'created_at' | 'updated_at'
>;

/** The live `public.announcements` row, exactly as the dev database has it. */
interface AnnouncementRow {
  id: string;
  organisation_id: string;
  team_id: string | null;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned: boolean;
  image_url: string | null;
  linked_event_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Live-UUID ↔ mock-id maps for the still-mocked people and teams. */
interface IdBridge {
  /** The caller's live organisation id (needed on inserts). */
  organisationId: string | null;
  profileLiveToApp: Map<string, string>;
  teamLiveToApp: Map<string, string>;
  teamAppToLive: Map<string, string>;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    // Callers only reach this service in live mode, so this is a programming
    // error — but fail with a calm message rather than crashing.
    throw new Error(OFFLINE_ERROR);
  }
  return supabase;
}

function isPermissionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === '42501' || /row-level security|permission denied/i.test(e?.message ?? '');
}

function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  return /fetch|network|timeout/i.test(message);
}

const FRIENDLY_MESSAGES = new Set([
  LOAD_ERROR,
  SAVE_ERROR,
  DELETE_ERROR,
  PERMISSION_ERROR,
  MISSING_ERROR,
  OFFLINE_ERROR,
]);

/** Log the technical error, throw the friendly one. */
function fail(operation: string, error: unknown, fallback: string): never {
  console.warn(`[announcements] ${operation} failed`, error);
  // Errors this module raised deliberately are already user-friendly.
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isPermissionError(error)) throw new Error(PERMISSION_ERROR);
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(fallback);
}

/**
 * Fetch the id bridge for the current session. RLS scopes both queries to
 * what the caller may see (their org's profiles; their accessible teams),
 * which matches exactly the announcements they can read.
 */
async function loadBridge(supabase: SupabaseClient): Promise<IdBridge> {
  const [profilesRes, teamsRes] = await Promise.all([
    supabase.from('profiles').select('id, email, organisation_id'),
    supabase.from('teams').select('id, name'),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const mockUserByEmail = new Map(mockUsers.map((u) => [u.email.toLowerCase(), u.id]));
  const mockTeamByName = new Map(mockTeams.map((t) => [t.name.toLowerCase(), t.id]));

  const bridge: IdBridge = {
    organisationId: profilesRes.data?.[0]?.organisation_id ?? null,
    profileLiveToApp: new Map(),
    teamLiveToApp: new Map(),
    teamAppToLive: new Map(),
  };
  for (const row of profilesRes.data ?? []) {
    const mockId = mockUserByEmail.get(String(row.email).toLowerCase());
    if (mockId) bridge.profileLiveToApp.set(row.id, mockId);
  }
  for (const row of teamsRes.data ?? []) {
    const mockId = mockTeamByName.get(String(row.name).toLowerCase());
    if (mockId) {
      bridge.teamLiveToApp.set(row.id, mockId);
      bridge.teamAppToLive.set(mockId, row.id);
    }
  }
  return bridge;
}

/** Map a live row into the app's Announcement shape (mock ids where known). */
function toAppAnnouncement(row: AnnouncementRow, bridge: IdBridge): Announcement {
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    team_id: row.team_id ? (bridge.teamLiveToApp.get(row.team_id) ?? row.team_id) : null,
    title: row.title,
    body: row.body,
    audience: row.audience,
    pinned: row.pinned,
    image_url: row.image_url,
    // Live event UUIDs don't resolve against the still-mocked events — the
    // linked-event card simply stays hidden until events go live.
    linked_event_id: row.linked_event_id,
    created_by: bridge.profileLiveToApp.get(row.created_by) ?? row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Resolve an app team id to the live team UUID, or fail with a calm message. */
function toLiveTeamId(appTeamId: string | null, bridge: IdBridge): string | null {
  if (!appTeamId) return null;
  const mapped = bridge.teamAppToLive.get(appTeamId);
  if (mapped) return mapped;
  // An unmapped id that isn't a mock id ('team-…') is already a live UUID
  // (e.g. an announcement for a team that exists only in the database).
  if (!appTeamId.startsWith('team-')) return appTeamId;
  console.warn(`[announcements] no live team found for "${appTeamId}"`);
  throw new Error(SAVE_ERROR);
}

/**
 * The mutable columns the client may write. `audience` is always derived
 * from `team_id` so the DB check constraint (church ⇔ team_id null) holds;
 * `created_at`/`updated_at` belong to the database (trigger-owned);
 * `linked_event_id` is deferred until events go live.
 */
function toDbFields(input: Partial<NewAnnouncementInput>, bridge: IdBridge) {
  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.body !== undefined) fields.body = input.body;
  if (input.pinned !== undefined) fields.pinned = input.pinned;
  if (input.image_url !== undefined) fields.image_url = input.image_url;
  if (input.team_id !== undefined) {
    const liveTeamId = toLiveTeamId(input.team_id, bridge);
    fields.team_id = liveTeamId;
    fields.audience = (liveTeamId ? 'team' : 'church') satisfies AnnouncementAudience;
  }
  return fields;
}

/**
 * Announcements visible to the signed-in user. RLS does the filtering:
 * church-wide for org members, team announcements for accessible teams.
 */
export async function listAnnouncements(): Promise<Announcement[]> {
  const supabase = requireClient();
  try {
    const bridge = await loadBridge(supabase);
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as AnnouncementRow[]).map((row) => toAppAnnouncement(row, bridge));
  } catch (error) {
    fail('list', error, LOAD_ERROR);
  }
}

/**
 * Create an announcement as the signed-in user. `liveProfileId` is the real
 * `profiles.id` from the session — RLS requires created_by to match it.
 */
export async function createAnnouncement(
  input: NewAnnouncementInput,
  liveProfileId: string,
): Promise<Announcement> {
  const supabase = requireClient();
  try {
    const bridge = await loadBridge(supabase);
    if (!bridge.organisationId) throw new Error(SAVE_ERROR);
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        ...toDbFields({ ...input, team_id: input.team_id ?? null }, bridge),
        organisation_id: bridge.organisationId,
        created_by: liveProfileId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return toAppAnnouncement(data as AnnouncementRow, bridge);
  } catch (error) {
    fail('create', error, SAVE_ERROR);
  }
}

/** Update an announcement; returns the saved row as the app sees it. */
export async function updateAnnouncement(
  id: string,
  patch: Partial<Announcement>,
): Promise<Announcement> {
  const supabase = requireClient();
  try {
    const bridge = await loadBridge(supabase);
    const { data, error } = await supabase
      .from('announcements')
      .update(toDbFields(patch, bridge))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    // RLS silently matches zero rows when the caller may not update this
    // announcement (or it was deleted elsewhere) — surface that honestly.
    if (!data) throw new Error(MISSING_ERROR);
    return toAppAnnouncement(data as AnnouncementRow, bridge);
  } catch (error) {
    fail('update', error, SAVE_ERROR);
  }
}

/** Delete an announcement (the UI confirms first). */
export async function deleteAnnouncement(id: string): Promise<void> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    // Zero rows deleted = RLS said no, or it was already gone.
    if (!data || data.length === 0) throw new Error(MISSING_ERROR);
  } catch (error) {
    fail('delete', error, DELETE_ERROR);
  }
}
