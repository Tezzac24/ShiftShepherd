/** Narrow live-profile editing service. Demo mode never calls this module. */
import { SupabaseClient } from '@supabase/supabase-js';

import { UserProfile } from '../../../types';
import { getSupabase } from '../client';

/**
 * Only full_name is editable. Phone is an identity/contact field reserved for
 * a future verified account flow and is never sent through this service.
 */
export type ProfileEditInput = Pick<UserProfile, 'full_name'>;
export type UpdatedProfileFields = Pick<UserProfile, 'id' | 'full_name' | 'phone'>;

export const PROFILE_NAME_REQUIRED = 'Please enter your full name.';
export const PROFILE_NAME_TOO_LONG = 'Please keep your name to 100 characters or fewer.';
const UPDATE_ERROR = "We couldn't save your profile right now. Please try again.";
const OFFLINE_ERROR = "We couldn't reach the server. Please check your connection and try again.";

interface UpdateOwnProfileRow {
  profile_id: string;
  full_name: string;
  phone: string | null;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(OFFLINE_ERROR);
  return supabase;
}

/** Runtime allow-list: extra/admin-owned properties are ignored even from JS callers. */
export function buildProfileUpdatePayload(input: ProfileEditInput): {
  p_full_name: string;
} {
  const fullName = String(input.full_name ?? '').trim();
  if (fullName.length < 2) throw new Error(PROFILE_NAME_REQUIRED);
  if (fullName.length > 100) throw new Error(PROFILE_NAME_TOO_LONG);
  return { p_full_name: fullName };
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function fail(error: unknown): never {
  const message = messageOf(error);
  console.warn('[profiles] update failed', { code: (error as { code?: string })?.code });
  if (
    error instanceof Error &&
    [PROFILE_NAME_REQUIRED, PROFILE_NAME_TOO_LONG].includes(error.message)
  ) {
    throw error;
  }
  if (/fetch|network|timeout/i.test(message)) throw new Error(OFFLINE_ERROR);
  if (/full name must be at least/i.test(message)) throw new Error(PROFILE_NAME_REQUIRED);
  if (/full name must be 100/i.test(message)) throw new Error(PROFILE_NAME_TOO_LONG);
  throw new Error(UPDATE_ERROR);
}

/** Update only the signed-in linked profile's full_name via the name-only RPC. */
export async function updateOwnProfile(
  liveProfileId: string,
  input: ProfileEditInput,
): Promise<UpdatedProfileFields> {
  try {
    if (liveProfileId.startsWith('user-')) throw new Error(UPDATE_ERROR);
    const payload = buildProfileUpdatePayload(input);
    const { data, error } = await requireClient().rpc('update_own_profile', payload);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as UpdateOwnProfileRow | null;
    if (!row || row.profile_id !== liveProfileId) throw new Error(UPDATE_ERROR);
    return { id: row.profile_id, full_name: row.full_name, phone: row.phone };
  } catch (error) {
    fail(error);
  }
}
