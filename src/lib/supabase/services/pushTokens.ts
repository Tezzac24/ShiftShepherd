/**
 * Narrow live Supabase service for Expo push-token registration/revocation.
 *
 * Registration atomically moves the globally unique token to the current
 * active profile. Revocation deletes it only when the owning profile belongs
 * to auth.uid(). Neither RPC accepts a caller/profile/organisation id, and
 * this module never logs or surfaces a raw token.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { getSupabase } from '../client';

const REGISTER_ERROR =
  "We couldn't register this device for notifications. Please try again.";
const UNREGISTER_ERROR =
  "We couldn't remove this device's notification registration. Please try again.";
const OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";
const SETUP_ERROR =
  'Device registration is not switched on for your church yet. Please try again after the next update.';

export type PushRegistrationAccessErrorCode =
  | 'ORGANISATION_ACCESS_REMOVED'
  | 'NO_LINKED_PROFILE';

export class PushRegistrationAccessError extends Error {
  constructor(public readonly code: PushRegistrationAccessErrorCode) {
    super('This account does not currently have an active organisation profile.');
    this.name = 'PushRegistrationAccessError';
  }
}

export function isPushRegistrationAccessError(
  error: unknown,
): error is PushRegistrationAccessError {
  const code = (error as { code?: unknown })?.code;
  return (
    error instanceof PushRegistrationAccessError ||
    code === 'ORGANISATION_ACCESS_REMOVED' ||
    code === 'NO_LINKED_PROFILE'
  );
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(OFFLINE_ERROR);
  return supabase;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isNetworkError(error: unknown): boolean {
  return /fetch|network|timeout/i.test(messageOf(error));
}

function isMissingFunctionError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|function .* does not exist/i.test(messageOf(error))
  );
}

function accessErrorCode(error: unknown): PushRegistrationAccessErrorCode | null {
  const message = messageOf(error);
  if (/ORGANISATION_ACCESS_REMOVED/i.test(message)) return 'ORGANISATION_ACCESS_REMOVED';
  if (/NO_LINKED_PROFILE/i.test(message)) return 'NO_LINKED_PROFILE';
  return null;
}

/**
 * Register (or refresh) this device for the signed-in active profile. The
 * profile id is used only to reject demo ids; server ownership comes from the
 * authenticated account.
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
    console.warn('[pushTokens] register failed', {
      code: (error as { code?: string }).code,
    });
    const accessCode = accessErrorCode(error);
    if (accessCode) throw new PushRegistrationAccessError(accessCode);
    if (isMissingFunctionError(error)) throw new Error(SETUP_ERROR);
    if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
    throw new Error(REGISTER_ERROR);
  }
  return typeof data === 'string' ? data : new Date().toISOString();
}

/**
 * Delete this token only when it belongs to a profile owned by auth.uid().
 * The RPC's false result intentionally covers missing, repeated, and
 * differently-owned tokens without revealing which case occurred.
 */
export async function unregisterPushToken(token: string): Promise<boolean> {
  const supabase = requireClient();
  if (!token || token.length > 512) throw new Error(UNREGISTER_ERROR);

  const { data, error } = await supabase.rpc('unregister_push_token', {
    p_token: token,
  });
  if (error) {
    console.warn('[pushTokens] unregister failed', {
      code: (error as { code?: string }).code,
    });
    if (isMissingFunctionError(error)) throw new Error(SETUP_ERROR);
    if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
    throw new Error(UNREGISTER_ERROR);
  }
  if (typeof data !== 'boolean') {
    console.warn('[pushTokens] unregister returned an invalid response');
    throw new Error(UNREGISTER_ERROR);
  }
  return data;
}
