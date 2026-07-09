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
 * People and teams are live now (step 6), so rows travel with their real
 * UUIDs end-to-end: `created_by` is a live profile id, `team_id` a live team
 * id, and screens resolve names against the live directory. Linked events
 * are live too (step 5): the picker offers live events, so `linked_event_id`
 * is written as-is. Mock ids ('team-…', 'event-…') are refused defensively so
 * demo ids can never leak into the live table.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { Announcement, AnnouncementAudience } from '../../../types';
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
 * The caller's organisation id (needed on inserts). RLS means the caller can
 * always read their own profile row.
 */
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

/** Map a live row into the app's Announcement shape (ids stay live UUIDs). */
function toAppAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    team_id: row.team_id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    pinned: row.pinned,
    image_url: row.image_url,
    linked_event_id: row.linked_event_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Teams are live, so a team id is already a live UUID — refuse mock ids. */
function toDbTeamId(teamId: string | null): string | null {
  if (!teamId) return null;
  if (teamId.startsWith('team-')) {
    // A demo/mock team id must never reach the live foreign key.
    console.warn(`[announcements] refusing mock team id "${teamId}"`);
    throw new Error(SAVE_ERROR);
  }
  return teamId;
}

/**
 * The mutable columns the client may write. `audience` is always derived
 * from `team_id` so the DB check constraint (church ⇔ team_id null) holds;
 * `created_at`/`updated_at` belong to the database (trigger-owned);
 * `team_id`/`linked_event_id` must already be live UUIDs (the live pickers
 * only offer live rows) — mock ids are refused rather than written.
 */
function toDbFields(input: Partial<NewAnnouncementInput>) {
  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.body !== undefined) fields.body = input.body;
  if (input.pinned !== undefined) fields.pinned = input.pinned;
  if (input.image_url !== undefined) fields.image_url = input.image_url;
  if (input.linked_event_id !== undefined) {
    if (input.linked_event_id?.startsWith('event-')) {
      // A demo/mock event id must never reach the live foreign key.
      console.warn(`[announcements] refusing mock event id "${input.linked_event_id}"`);
      throw new Error(SAVE_ERROR);
    }
    fields.linked_event_id = input.linked_event_id;
  }
  if (input.team_id !== undefined) {
    const liveTeamId = toDbTeamId(input.team_id);
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
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as AnnouncementRow[]).map(toAppAnnouncement);
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
    const organisationId = await fetchOrganisationId(supabase, liveProfileId);
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        ...toDbFields({ ...input, team_id: input.team_id ?? null }),
        organisation_id: organisationId,
        created_by: liveProfileId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return toAppAnnouncement(data as AnnouncementRow);
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
    const { data, error } = await supabase
      .from('announcements')
      .update(toDbFields(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    // RLS silently matches zero rows when the caller may not update this
    // announcement (or it was deleted elsewhere) — surface that honestly.
    if (!data) throw new Error(MISSING_ERROR);
    return toAppAnnouncement(data as AnnouncementRow);
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
