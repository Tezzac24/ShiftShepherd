/**
 * Push token service - live Supabase slice for push_tokens (V1: register
 * only).
 *
 * Persists this device's Expo push token for the signed-in profile. All
 * writes go through the `register_push_token` RPC (migration
 * 20260710171200): a narrow SECURITY DEFINER upsert keyed on the globally
 * unique token column, so re-registering refreshes updated_at and a device
 * that changes hands moves to its new owner. The authenticated role has no
 * table-level privileges on push_tokens at all — the RPC is the only write
 * path, and RLS (002, strictly personal) remains the table's authority.
 *
 * Obtaining the token (permissions, device/build checks) lives in
 * src/lib/notifications/ — this service only persists it. Nothing is
 * delivered yet: no Expo Push API call, no Edge Function, no receipts.
 *
 * Push tokens are sensitive-ish device identifiers: this module never logs
 * one, and callers must not surface one in the UI.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { getSupabase } from '../client';

const REGISTER_ERROR =
  "We couldn't register this device for notifications. Please try again.";
const OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";
const SETUP_ERROR =
  'Device registration is not switched on for your church yet. Please try again after the next update.';

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error(OFFLINE_ERROR);
  }
  return supabase;
}

function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  return /fetch|network|timeout/i.test(message);
}

/**
 * The register_push_token function is created by the local-only migration
 * 20260710171200_add_push_token_registration.sql. Until that is pushed (and
 * on any project without it), PostgREST reports the missing function —
 * treated as "not switched on yet", never as a scary raw error.
 */
function isMissingFunctionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e?.code === 'PGRST202' ||
    e?.code === '42883' ||
    /could not find the function|function .* does not exist/i.test(e?.message ?? '')
  );
}

/**
 * Register (or refresh) this device's Expo push token for the signed-in
 * profile. Returns the server-side registration timestamp. The profile id is
 * only used to refuse demo/mock sessions — the database derives the owner
 * from the authenticated user itself.
 */
export async function registerPushToken(
  liveProfileId: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<string> {
  const supabase = requireClient();
  if (liveProfileId.startsWith('user-')) {
    console.warn('[pushTokens] refusing mock profile id');
    throw new Error(REGISTER_ERROR);
  }
  const { data, error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: platform,
  });
  if (error) {
    // Log code/message only — never the arguments.
    console.warn('[pushTokens] register failed', {
      code: (error as { code?: string }).code,
      message: error.message,
    });
    if (isMissingFunctionError(error)) throw new Error(SETUP_ERROR);
    if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
    throw new Error(REGISTER_ERROR);
  }
  return typeof data === 'string' ? data : new Date().toISOString();
}
