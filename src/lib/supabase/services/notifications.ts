/**
 * Notification preferences service - live Supabase slice for
 * notification_preferences.
 *
 * All Supabase reads/writes for notification settings live here so screens
 * and AppDataContext never build queries themselves. RLS remains the
 * authority: preferences are strictly personal (user_id must be the caller's
 * own profile for every command), so there is no admin path and no
 * cross-user access.
 *
 * The table holds at most one row per profile (unique on user_id). A user
 * who has never saved has no row — the app assumes the all-on defaults
 * client-side and only writes a row on their first change (an upsert onto
 * the user_id constraint). The database owns the row id.
 *
 * Push tokens are deliberately NOT handled here yet: registering a device
 * needs expo-notifications plus a development build with an EAS project id
 * (Expo Go cannot receive remote pushes since SDK 53), and this build has
 * neither. See src/lib/notifications/ for the deferral notes.
 *
 * This service needs the grants migration
 * `20260709220528_grant_authenticated_notification_prefs_api_privileges.sql`
 * (pushed and verified 2026-07-09). If the grants are ever missing, the live
 * notification settings screen shows a friendly load-error state; demo mode
 * is unaffected.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { NotificationPreferences } from '../../../types';
import { getSupabase } from '../client';

const LOAD_ERROR =
  "We couldn't load your notification settings right now. Please try again.";
const SAVE_ERROR =
  "We couldn't save your notification settings. Check your connection and try again.";
const PERMISSION_ERROR = 'You do not have permission to change these settings.';
const OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";

interface NotificationPreferencesRow {
  id: string;
  user_id: string;
  announcement_notifications: boolean;
  team_announcement_notifications: boolean;
  chat_notifications: boolean;
  rota_notifications: boolean;
  event_reminders: boolean;
  availability_reminders: boolean;
}

const ROW_COLUMNS =
  'id, user_id, announcement_notifications, team_announcement_notifications, chat_notifications, rota_notifications, event_reminders, availability_reminders' as const;

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
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

const FRIENDLY_MESSAGES = new Set([LOAD_ERROR, SAVE_ERROR, PERMISSION_ERROR, OFFLINE_ERROR]);

interface FailMessages {
  permission: string;
  network: string;
  fallback: string;
}

// Loading has no permission-specific wording: RLS just returns no rows, so a
// permission error on load means missing grants — show the plain load error.
const LOAD_FAIL: FailMessages = {
  permission: LOAD_ERROR,
  network: OFFLINE_ERROR,
  fallback: LOAD_ERROR,
};

const SAVE_FAIL: FailMessages = {
  permission: PERMISSION_ERROR,
  network: SAVE_ERROR,
  fallback: SAVE_ERROR,
};

function fail(operation: string, error: unknown, messages: FailMessages): never {
  console.warn(`[notifications] ${operation} failed`, error);
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isPermissionError(error)) throw new Error(messages.permission);
  if (isNetworkError(error)) throw new Error(messages.network);
  throw new Error(messages.fallback);
}

function requireLiveProfileId(id: string, errorMessage: string): string {
  if (id.startsWith('user-')) {
    console.warn(`[notifications] refusing mock profile id "${id}"`);
    throw new Error(errorMessage);
  }
  return id;
}

/**
 * The caller's saved notification preferences, or null when they have never
 * saved any (the app then assumes the all-on defaults without creating a row).
 */
export async function fetchNotificationPreferences(
  liveProfileId: string,
): Promise<NotificationPreferences | null> {
  const supabase = requireClient();
  try {
    const userId = requireLiveProfileId(liveProfileId, LOAD_ERROR);
    const { data, error } = await supabase
      .from('notification_preferences')
      .select(ROW_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as NotificationPreferencesRow | null) ?? null;
  } catch (error) {
    fail('load', error, LOAD_FAIL);
  }
}

/**
 * Save the caller's notification preferences — an upsert onto the
 * unique(user_id) constraint, so the first save creates the row (database-
 * owned id) and later saves update it. The saved row is returned.
 */
export async function saveNotificationPreferences(
  liveProfileId: string,
  prefs: Omit<NotificationPreferences, 'id' | 'user_id'>,
): Promise<NotificationPreferences> {
  const supabase = requireClient();
  try {
    const userId = requireLiveProfileId(liveProfileId, SAVE_ERROR);
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          announcement_notifications: prefs.announcement_notifications,
          team_announcement_notifications: prefs.team_announcement_notifications,
          chat_notifications: prefs.chat_notifications,
          rota_notifications: prefs.rota_notifications,
          event_reminders: prefs.event_reminders,
          availability_reminders: prefs.availability_reminders,
        },
        { onConflict: 'user_id' },
      )
      .select(ROW_COLUMNS)
      .single();
    if (error) throw error;
    return data as NotificationPreferencesRow;
  } catch (error) {
    fail('save', error, SAVE_FAIL);
  }
}
