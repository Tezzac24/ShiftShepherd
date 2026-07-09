/**
 * Rotas & availability service — the fourth live Supabase feature-data slice.
 *
 * All Supabase reads/writes for rota entries, rota assignments, and
 * availability responses live here so screens and AppDataContext never build
 * queries themselves. The service:
 *
 *  - talks to the live `rota_entries` / `rota_assignments` /
 *    `availability_responses` tables exactly as the dev project has them
 *    (including the status/cancellation columns from migration 005);
 *  - relies on RLS for all real permission enforcement (team members read,
 *    team leaders and church admins manage entries/assignments, the assigned
 *    person upserts only their own availability response) and translates
 *    rejections into friendly plain-English errors;
 *  - needs the grants migration
 *    `20260709154733_grant_authenticated_rota_api_privileges.sql` applied —
 *    until then every call fails with "permission denied" and the app shows
 *    the friendly load-error state;
 *  - never uses service-role keys; anonymous sessions are blocked by RLS.
 *
 * People and teams are live, so `team_id`, `user_id`, `created_by`, and
 * `cancelled_by` travel as real UUIDs end-to-end. Mock ids are refused
 * defensively. Postgres returns `time` as HH:MM:SS; the app renders HH:MM,
 * so times are normalised here.
 *
 * Replacing an entry's assignments is a diffed delete+insert (not a
 * transaction). If the second half fails the list can be left partially
 * changed — the caller re-syncs afterwards, so the UI never drifts from the
 * server. An RPC can make this atomic later if it ever matters in practice.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import {
  AvailabilityResponse,
  AvailabilityStatus,
  RotaAssignment,
  RotaEntry,
} from '../../../types';
import { getSupabase } from '../client';

// Friendly, non-technical messages — shown directly in the UI.
const LOAD_ERROR = 'We couldn’t load the rota right now. Please try again.';
const SAVE_ERROR = 'Your changes could not be saved. Please try again.';
const DELETE_ERROR = 'This rota entry could not be deleted. Please try again.';
const RESPOND_ERROR = 'Your availability could not be saved. Please try again.';
const PERMISSION_ERROR = 'You do not have permission to do that.';
const MISSING_ERROR = 'This rota entry is no longer available. It may have been removed.';
const OFFLINE_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';

/** Fields callers provide to create a rota entry (matches AppDataContext). */
export interface NewRotaEntryInput {
  team_id: string;
  title: string;
  date: string;
  time: string | null;
  notes: string | null;
  created_by: string;
}

export interface NewRotaAssignmentInput {
  user_id: string;
  role_name: string;
}

/** Everything the app renders rotas from, fetched in one pass. */
export interface RotaData {
  /** Rota entries visible to the caller, soonest first. */
  entries: RotaEntry[];
  /** Assignments of those entries. */
  assignments: RotaAssignment[];
  /** Availability responses for those assignments. */
  responses: AvailabilityResponse[];
}

/** A saved entry together with its saved assignments. */
export interface SavedRotaEntry {
  entry: RotaEntry;
  assignments: RotaAssignment[];
}

/** The live `public.rota_entries` row, exactly as the dev database has it. */
interface RotaEntryRow {
  id: string;
  organisation_id: string;
  team_id: string;
  title: string;
  date: string;
  time: string | null;
  notes: string | null;
  status: 'active' | 'cancelled';
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RotaAssignmentRow {
  id: string;
  rota_entry_id: string;
  user_id: string;
  role_name: string;
  created_at: string;
}

interface AvailabilityResponseRow {
  id: string;
  rota_assignment_id: string;
  user_id: string;
  status: AvailabilityStatus;
  note: string | null;
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
  const message =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  return /fetch|network|timeout/i.test(message);
}

const FRIENDLY_MESSAGES = new Set([
  LOAD_ERROR,
  SAVE_ERROR,
  DELETE_ERROR,
  RESPOND_ERROR,
  PERMISSION_ERROR,
  MISSING_ERROR,
  OFFLINE_ERROR,
]);

/** Log the technical error, throw the friendly one. */
function fail(operation: string, error: unknown, fallback: string): never {
  console.warn(`[rotas] ${operation} failed`, error);
  // Errors this module raised deliberately are already user-friendly.
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isPermissionError(error)) throw new Error(PERMISSION_ERROR);
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(fallback);
}

/** Postgres returns time as HH:MM:SS; the app renders HH:MM. */
function toAppTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

function toAppEntry(row: RotaEntryRow): RotaEntry {
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    team_id: row.team_id,
    title: row.title,
    date: row.date,
    time: toAppTime(row.time),
    notes: row.notes,
    status: row.status,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Assignment and response rows map one-to-one onto the app types already.

/** People and teams are live, so ids are already live UUIDs — refuse mock ids. */
function requireLiveId(id: string, mockPrefixes: string[], what: string): string {
  if (mockPrefixes.some((prefix) => id.startsWith(prefix))) {
    // A demo/mock id must never reach a live foreign key.
    console.warn(`[rotas] refusing mock ${what} id "${id}"`);
    throw new Error(SAVE_ERROR);
  }
  return id;
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

/**
 * Everything rota the signed-in user may see, in one parallel fetch. RLS does
 * the filtering (team members only; church admins see every team's rota).
 */
export async function fetchRotaData(): Promise<RotaData> {
  const supabase = requireClient();
  try {
    const [entriesRes, assignmentsRes, responsesRes] = await Promise.all([
      supabase
        .from('rota_entries')
        .select('*')
        .order('date', { ascending: true })
        .order('time', { ascending: true }),
      supabase
        .from('rota_assignments')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
      supabase.from('availability_responses').select('*'),
    ]);
    if (entriesRes.error) throw entriesRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;
    if (responsesRes.error) throw responsesRes.error;
    return {
      entries: ((entriesRes.data ?? []) as RotaEntryRow[]).map(toAppEntry),
      assignments: (assignmentsRes.data ?? []) as RotaAssignmentRow[],
      responses: (responsesRes.data ?? []) as AvailabilityResponseRow[],
    };
  } catch (error) {
    fail('list', error, LOAD_ERROR);
  }
}

/**
 * Create a rota entry (plus its assignments) as the signed-in user.
 * `liveProfileId` is the real `profiles.id` from the session — RLS requires
 * created_by to match it. If the assignments insert fails, the just-created
 * entry is removed again (best effort) so no half-made entry lingers.
 */
export async function createRotaEntry(
  input: NewRotaEntryInput,
  assignments: NewRotaAssignmentInput[],
  liveProfileId: string,
): Promise<SavedRotaEntry> {
  const supabase = requireClient();
  try {
    const organisationId = await fetchOrganisationId(supabase, liveProfileId);
    const { data: entryRow, error: entryError } = await supabase
      .from('rota_entries')
      .insert({
        organisation_id: organisationId,
        team_id: requireLiveId(input.team_id, ['team-'], 'team'),
        title: input.title,
        date: input.date,
        time: input.time,
        notes: input.notes,
        created_by: liveProfileId,
      })
      .select('*')
      .single();
    if (entryError) throw entryError;
    const entry = toAppEntry(entryRow as RotaEntryRow);

    if (assignments.length === 0) return { entry, assignments: [] };
    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from('rota_assignments')
      .insert(
        assignments.map((a) => ({
          rota_entry_id: entry.id,
          user_id: requireLiveId(a.user_id, ['user-'], 'user'),
          role_name: a.role_name,
        })),
      )
      .select('*');
    if (assignmentsError) {
      await supabase.from('rota_entries').delete().eq('id', entry.id);
      throw assignmentsError;
    }
    return { entry, assignments: (assignmentRows ?? []) as RotaAssignmentRow[] };
  } catch (error) {
    fail('create', error, SAVE_ERROR);
  }
}

/**
 * The mutable entry columns the client may write. `created_by` belongs to the
 * insert and is never patched; timestamps and the cancellation columns are
 * owned by the DB / the cancel+restore calls below.
 */
function toDbEntryFields(patch: Partial<RotaEntry>) {
  const fields: Record<string, unknown> = {};
  if (patch.team_id !== undefined) {
    fields.team_id = requireLiveId(patch.team_id, ['team-'], 'team');
  }
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.date !== undefined) fields.date = patch.date;
  if (patch.time !== undefined) fields.time = patch.time;
  if (patch.notes !== undefined) fields.notes = patch.notes;
  return fields;
}

/**
 * Update a rota entry and (optionally) replace its assignment list. The
 * replacement diffs by person+role: unchanged assignments keep their rows
 * (and so their availability responses), removed ones are deleted (responses
 * cascade away), new ones are inserted.
 */
export async function updateRotaEntry(
  id: string,
  patch: Partial<RotaEntry>,
  assignments?: NewRotaAssignmentInput[],
): Promise<SavedRotaEntry> {
  const supabase = requireClient();
  try {
    const fields = toDbEntryFields(patch);
    let entry: RotaEntry;
    if (Object.keys(fields).length > 0) {
      const { data, error } = await supabase
        .from('rota_entries')
        .update(fields)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      // RLS silently matches zero rows when the caller may not update this
      // entry (or it was deleted elsewhere) — surface that honestly.
      if (!data) throw new Error(MISSING_ERROR);
      entry = toAppEntry(data as RotaEntryRow);
    } else {
      const { data, error } = await supabase
        .from('rota_entries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(MISSING_ERROR);
      entry = toAppEntry(data as RotaEntryRow);
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('rota_assignments')
      .select('*')
      .eq('rota_entry_id', id)
      .order('created_at', { ascending: true });
    if (existingError) throw existingError;
    const existing = (existingRows ?? []) as RotaAssignmentRow[];
    if (!assignments) return { entry, assignments: existing };

    // Keep ids stable where person+role match, so responses survive edits.
    const wantedKeys = new Set(assignments.map((a) => `${a.user_id}|${a.role_name}`));
    const kept = existing.filter((a) => wantedKeys.has(`${a.user_id}|${a.role_name}`));
    const keptKeys = new Set(kept.map((a) => `${a.user_id}|${a.role_name}`));
    const removedIds = existing
      .filter((a) => !wantedKeys.has(`${a.user_id}|${a.role_name}`))
      .map((a) => a.id);
    const added = assignments.filter((a) => !keptKeys.has(`${a.user_id}|${a.role_name}`));

    if (removedIds.length > 0) {
      const { error } = await supabase.from('rota_assignments').delete().in('id', removedIds);
      if (error) throw error;
    }
    let insertedRows: RotaAssignmentRow[] = [];
    if (added.length > 0) {
      const { data, error } = await supabase
        .from('rota_assignments')
        .insert(
          added.map((a) => ({
            rota_entry_id: id,
            user_id: requireLiveId(a.user_id, ['user-'], 'user'),
            role_name: a.role_name,
          })),
        )
        .select('*');
      if (error) throw error;
      insertedRows = (data ?? []) as RotaAssignmentRow[];
    }
    return { entry, assignments: [...kept, ...insertedRows] };
  } catch (error) {
    fail('update', error, SAVE_ERROR);
  }
}

/**
 * Mark an entry cancelled (kept visible with a "Cancelled" badge) — a plain
 * update covered by the leaders-manage-rota policy. `cancelled_at` is set
 * here because the check constraint requires it alongside the status.
 */
export async function cancelRotaEntry(
  id: string,
  liveProfileId: string,
  reason: string | null,
): Promise<RotaEntry> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase
      .from('rota_entries')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: liveProfileId,
        cancellation_reason: reason,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(MISSING_ERROR);
    return toAppEntry(data as RotaEntryRow);
  } catch (error) {
    fail('cancel', error, SAVE_ERROR);
  }
}

/** Undo a cancellation (e.g. after a mis-tap or a change of plans). */
export async function restoreRotaEntry(id: string): Promise<RotaEntry> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase
      .from('rota_entries')
      .update({
        status: 'active',
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(MISSING_ERROR);
    return toAppEntry(data as RotaEntryRow);
  } catch (error) {
    fail('restore', error, SAVE_ERROR);
  }
}

/** Delete a rota entry (the UI confirms first); assignments/responses cascade. */
export async function deleteRotaEntry(id: string): Promise<void> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase.from('rota_entries').delete().eq('id', id).select('id');
    if (error) throw error;
    // Zero rows deleted = RLS said no, or it was already gone.
    if (!data || data.length === 0) throw new Error(MISSING_ERROR);
  } catch (error) {
    fail('delete', error, DELETE_ERROR);
  }
}

/**
 * Save the signed-in user's availability for one of their assignments — an
 * upsert onto the `unique(rota_assignment_id)` constraint, so responding and
 * changing a response are the same call. The note is always optional. RLS
 * only allows this for the person the assignment belongs to.
 */
export async function submitAvailability(
  assignmentId: string,
  liveProfileId: string,
  status: AvailabilityStatus,
  note: string | null,
): Promise<AvailabilityResponse> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase
      .from('availability_responses')
      .upsert(
        {
          rota_assignment_id: requireLiveId(assignmentId, ['ra-'], 'assignment'),
          user_id: liveProfileId,
          status,
          note,
        },
        { onConflict: 'rota_assignment_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    return data as AvailabilityResponseRow;
  } catch (error) {
    fail('respond', error, RESPOND_ERROR);
  }
}
