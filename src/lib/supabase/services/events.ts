/**
 * Events service — the second live Supabase feature-data slice.
 *
 * All Supabase reads/writes for events live here so screens and
 * AppDataContext never build queries themselves. The service:
 *
 *  - talks to the live `events` table exactly as it exists in the dev project
 *    (columns: id, organisation_id, title, description, category_id,
 *    start_time, end_time, location, team_id, is_recurring, recurrence_rule,
 *    recurrence_label, recurrence_end_date, created_by, created_at,
 *    updated_at — recurring events stay single base rows; the app expands
 *    occurrences client-side via utils/recurrence);
 *  - relies on RLS for all real permission enforcement (authenticated-only;
 *    org members may read, only church admins and event managers may create/
 *    update/delete, `created_by` must be the caller's profile on insert) and
 *    translates rejections into friendly plain-English errors;
 *  - never uses service-role keys; anonymous sessions are blocked by RLS.
 *
 * People and teams are live now (step 6), so `created_by` and `team_id`
 * travel as real UUIDs end-to-end and screens resolve names against the live
 * directory. Mock team ids ('team-…') are refused defensively.
 *
 * Phase note — the one remaining bridge: event categories are still mocked
 * in the app ('cat-service' …), so live category UUIDs ↔ mock category ids
 * are matched by name at this boundary (the live seed uses the same twelve
 * names). TODO: wire to Supabase — remove once a live categories fetch
 * exists (docs/supabase-integration-plan.md).
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { Event } from '../../../types';
import { mockCategories } from '../../mockData';
import { getSupabase } from '../client';

// Friendly, non-technical messages — shown directly in the UI.
const LOAD_ERROR = 'We couldn’t load events right now. Please try again.';
const SAVE_ERROR = 'Your changes could not be saved. Please try again.';
const DELETE_ERROR = 'This event could not be deleted. Please try again.';
const PERMISSION_ERROR = 'You do not have permission to do that.';
const MISSING_ERROR = 'This event is no longer available. It may have been removed.';
const OFFLINE_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';

/** What callers provide to create an event (matches AppDataContext). */
export type NewEventInput = Omit<Event, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>;

/** The live `public.events` row, exactly as the dev database has it. */
interface EventRow {
  id: string;
  organisation_id: string;
  title: string;
  description: string;
  category_id: string;
  start_time: string;
  end_time: string;
  location: string;
  team_id: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_label: string | null;
  recurrence_end_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Live-UUID ↔ mock-id maps for the still-mocked event categories. */
interface CategoryBridge {
  categoryLiveToApp: Map<string, string>;
  categoryAppToLive: Map<string, string>;
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
  console.warn(`[events] ${operation} failed`, error);
  // Errors this module raised deliberately are already user-friendly.
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isPermissionError(error)) throw new Error(PERMISSION_ERROR);
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(fallback);
}

/**
 * Fetch the category name-bridge for the current session (categories are the
 * one collection still mocked in the app). RLS scopes the query to the
 * caller's organisation.
 */
async function loadCategoryBridge(supabase: SupabaseClient): Promise<CategoryBridge> {
  const { data, error } = await supabase.from('event_categories').select('id, name');
  if (error) throw error;

  const mockCategoryByName = new Map(mockCategories.map((c) => [c.name.toLowerCase(), c.id]));
  const bridge: CategoryBridge = {
    categoryLiveToApp: new Map(),
    categoryAppToLive: new Map(),
  };
  for (const row of data ?? []) {
    const mockId = mockCategoryByName.get(String(row.name).toLowerCase());
    if (mockId) {
      bridge.categoryLiveToApp.set(row.id, mockId);
      bridge.categoryAppToLive.set(mockId, row.id);
    }
  }
  return bridge;
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

/** Map a live row into the app's Event shape (mock category ids where known). */
function toAppEvent(row: EventRow, bridge: CategoryBridge): Event {
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    title: row.title,
    description: row.description,
    // An unbridged category (a live-only name) keeps its UUID — the category
    // badge simply doesn't render for it.
    category_id: bridge.categoryLiveToApp.get(row.category_id) ?? row.category_id,
    start_time: row.start_time,
    end_time: row.end_time,
    location: row.location,
    team_id: row.team_id,
    is_recurring: row.is_recurring,
    recurrence_rule: row.recurrence_rule,
    recurrence_label: row.recurrence_label,
    recurrence_end_date: row.recurrence_end_date,
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
    console.warn(`[events] refusing mock team id "${teamId}"`);
    throw new Error(SAVE_ERROR);
  }
  return teamId;
}

/** Resolve an app category id to the live category UUID. */
function toLiveCategoryId(appCategoryId: string, bridge: CategoryBridge): string {
  const mapped = bridge.categoryAppToLive.get(appCategoryId);
  if (mapped) return mapped;
  // An unmapped id that isn't a mock id ('cat-…') is already a live UUID.
  if (!appCategoryId.startsWith('cat-')) return appCategoryId;
  console.warn(`[events] no live category found for "${appCategoryId}"`);
  throw new Error(SAVE_ERROR);
}

/**
 * The mutable columns the client may write. `created_by` belongs to the
 * insert (RLS requires the caller's own profile id) and is never patched;
 * `created_at`/`updated_at` belong to the database (trigger-owned). The DB
 * check constraints keep recurrence honest (recurring rows need a rule and a
 * label; non-recurring rows must have all recurrence fields null) — the form
 * already builds inputs that way.
 */
function toDbFields(input: Partial<NewEventInput>, bridge: CategoryBridge) {
  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.description !== undefined) fields.description = input.description;
  if (input.category_id !== undefined) {
    fields.category_id = toLiveCategoryId(input.category_id, bridge);
  }
  if (input.start_time !== undefined) fields.start_time = input.start_time;
  if (input.end_time !== undefined) fields.end_time = input.end_time;
  if (input.location !== undefined) fields.location = input.location;
  if (input.team_id !== undefined) fields.team_id = toDbTeamId(input.team_id);
  if (input.is_recurring !== undefined) fields.is_recurring = input.is_recurring;
  if (input.recurrence_rule !== undefined) fields.recurrence_rule = input.recurrence_rule;
  if (input.recurrence_label !== undefined) fields.recurrence_label = input.recurrence_label;
  if (input.recurrence_end_date !== undefined) {
    fields.recurrence_end_date = input.recurrence_end_date;
  }
  return fields;
}

/**
 * Events visible to the signed-in user, soonest first. RLS does the
 * filtering (org members only). Recurring rows come back as base series
 * rows; the app expands occurrences before rendering.
 */
export async function listEvents(): Promise<Event[]> {
  const supabase = requireClient();
  try {
    const bridge = await loadCategoryBridge(supabase);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('start_time', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as EventRow[]).map((row) => toAppEvent(row, bridge));
  } catch (error) {
    fail('list', error, LOAD_ERROR);
  }
}

/**
 * Create an event as the signed-in user. `liveProfileId` is the real
 * `profiles.id` from the session — RLS requires created_by to match it.
 */
export async function createEvent(input: NewEventInput, liveProfileId: string): Promise<Event> {
  const supabase = requireClient();
  try {
    const [bridge, organisationId] = await Promise.all([
      loadCategoryBridge(supabase),
      fetchOrganisationId(supabase, liveProfileId),
    ]);
    const { data, error } = await supabase
      .from('events')
      .insert({
        ...toDbFields(input, bridge),
        organisation_id: organisationId,
        created_by: liveProfileId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return toAppEvent(data as EventRow, bridge);
  } catch (error) {
    fail('create', error, SAVE_ERROR);
  }
}

/** Update an event; returns the saved row as the app sees it. */
export async function updateEvent(id: string, patch: Partial<Event>): Promise<Event> {
  const supabase = requireClient();
  try {
    const bridge = await loadCategoryBridge(supabase);
    const { data, error } = await supabase
      .from('events')
      .update(toDbFields(patch, bridge))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    // RLS silently matches zero rows when the caller may not update this
    // event (or it was deleted elsewhere) — surface that honestly.
    if (!data) throw new Error(MISSING_ERROR);
    return toAppEvent(data as EventRow, bridge);
  } catch (error) {
    fail('update', error, SAVE_ERROR);
  }
}

/** Delete an event (the UI confirms first). */
export async function deleteEvent(id: string): Promise<void> {
  const supabase = requireClient();
  try {
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id');
    if (error) throw error;
    // Zero rows deleted = RLS said no, or it was already gone.
    if (!data || data.length === 0) throw new Error(MISSING_ERROR);
  } catch (error) {
    fail('delete', error, DELETE_ERROR);
  }
}
