import { SupabaseClient } from '@supabase/supabase-js';

import { AccountContext, UserProfile } from '../../../types';
import { getSupabase } from '../client';

const OFFLINE_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';
const LOAD_ERROR = 'We couldn’t load your account right now. Please try again.';
const SAVE_ERROR = 'We couldn’t save that change right now. Please try again.';
const CREATE_ERROR = 'We couldn’t create your organisation right now. Please try again.';
const SWITCH_ERROR = 'We couldn’t switch organisations right now. Please try again.';

interface AccountContextRow {
  account_auth_user_id: string;
  global_display_name: string | null;
  name_confirmed_at: string | null;
  active_profile_id: string | null;
  profile_id: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  profile_full_name: string | null;
  display_name_override: string | null;
  profile_email: string | null;
  profile_phone: string | null;
  profile_avatar_url: string | null;
  profile_created_at: string | null;
}

interface NameRow {
  account_auth_user_id: string;
  global_display_name: string;
  name_confirmed_at: string;
}

interface OverrideRow {
  profile_id: string;
  full_name: string;
  display_name_override: string | null;
}

export interface CreatedOrganisation {
  organisation_id: string;
  profile_id: string;
  organisation_name: string;
}

function requireClient(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error(OFFLINE_ERROR);
  return client;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function friendly(error: unknown, fallback: string): Error {
  const message = messageOf(error);
  if (/fetch|network|timeout/i.test(message)) return new Error(OFFLINE_ERROR);
  if (/DISPLAY_NAME_REQUIRED|at least 2/i.test(message)) {
    return new Error('Please enter your full name.');
  }
  if (/DISPLAY_NAME_TOO_LONG|100 characters/i.test(message)) {
    return new Error('Please keep your name to 100 characters or fewer.');
  }
  if (/ORGANISATION_NAME_REQUIRED/i.test(message)) {
    return new Error('Please enter your organisation name.');
  }
  if (/ORGANISATION_NAME_TOO_LONG/i.test(message)) {
    return new Error('Please keep the organisation name to 120 characters or fewer.');
  }
  if (/VERIFIED_EMAIL_REQUIRED/i.test(message)) {
    return new Error('Please verify your email address before continuing.');
  }
  if (/ORGANISATION_ALREADY_JOINED/i.test(message)) {
    return new Error('Organisation creation is only available before you join an organisation.');
  }
  return new Error(fallback);
}

function oneRow<T>(data: unknown): T | null {
  return (Array.isArray(data) ? data[0] : data) as T | null;
}

export function mapAccountContext(rows: AccountContextRow[]): AccountContext | null {
  const first = rows[0];
  if (!first?.account_auth_user_id) return null;
  return {
    account: {
      auth_user_id: first.account_auth_user_id,
      global_display_name: first.global_display_name,
      name_confirmed_at: first.name_confirmed_at,
      active_profile_id: first.active_profile_id,
    },
    organisations: rows.flatMap((row) => {
      if (
        !row.profile_id ||
        !row.organisation_id ||
        !row.organisation_name ||
        !row.profile_full_name ||
        !row.profile_email ||
        !row.profile_created_at
      ) {
        return [];
      }
      const profile: UserProfile = {
        id: row.profile_id,
        auth_user_id: row.account_auth_user_id,
        organisation_id: row.organisation_id,
        full_name: row.profile_full_name,
        display_name_override: row.display_name_override,
        email: row.profile_email,
        phone: row.profile_phone,
        avatar_url: row.profile_avatar_url,
        created_at: row.profile_created_at,
      };
      return [{ profile, organisation: { id: row.organisation_id, name: row.organisation_name } }];
    }),
  };
}

export async function fetchAccountContext(): Promise<AccountContext> {
  try {
    const { data, error } = await requireClient().rpc('get_account_context');
    if (error) throw error;
    const context = mapAccountContext((data ?? []) as AccountContextRow[]);
    if (!context) throw new Error(LOAD_ERROR);
    return context;
  } catch (error) {
    console.warn('[accounts] context load failed', { code: (error as { code?: string })?.code });
    throw friendly(error, LOAD_ERROR);
  }
}

export async function setGlobalDisplayName(displayName: string): Promise<NameRow> {
  try {
    const { data, error } = await requireClient().rpc('set_global_display_name', {
      p_display_name: displayName.trim(),
    });
    if (error) throw error;
    const row = oneRow<NameRow>(data);
    if (!row) throw new Error(SAVE_ERROR);
    return row;
  } catch (error) {
    console.warn('[accounts] global name update failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, SAVE_ERROR);
  }
}

export async function setOrganisationDisplayNameOverride(
  displayName: string | null,
): Promise<OverrideRow> {
  try {
    const { data, error } = await requireClient().rpc(
      'set_organisation_display_name_override',
      { p_display_name: displayName?.trim() || null },
    );
    if (error) throw error;
    const row = oneRow<OverrideRow>(data);
    if (!row) throw new Error(SAVE_ERROR);
    return row;
  } catch (error) {
    console.warn('[accounts] organisation name override failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, SAVE_ERROR);
  }
}

export async function setProfileDisplayNames(
  globalDisplayName: string,
  organisationDisplayName: string | null,
): Promise<OverrideRow> {
  try {
    const { data, error } = await requireClient().rpc('set_profile_display_names', {
      p_global_display_name: globalDisplayName.trim(),
      p_organisation_display_name: organisationDisplayName?.trim() || null,
    });
    if (error) throw error;
    const row = oneRow<OverrideRow>(data);
    if (!row) throw new Error(SAVE_ERROR);
    return row;
  } catch (error) {
    console.warn('[accounts] profile display names update failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, SAVE_ERROR);
  }
}

export async function switchActiveProfile(profileId: string): Promise<void> {
  try {
    const { error } = await requireClient().rpc('switch_active_profile', {
      p_profile_id: profileId,
    });
    if (error) throw error;
  } catch (error) {
    console.warn('[accounts] active profile switch failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, SWITCH_ERROR);
  }
}

export async function createOrganisation(name: string): Promise<CreatedOrganisation> {
  try {
    const { data, error } = await requireClient().rpc('create_organisation', {
      p_organisation_name: name.trim(),
    });
    if (error) throw error;
    const row = oneRow<CreatedOrganisation>(data);
    if (!row) throw new Error(CREATE_ERROR);
    return row;
  } catch (error) {
    console.warn('[accounts] organisation creation failed', {
      code: (error as { code?: string })?.code,
    });
    throw friendly(error, CREATE_ERROR);
  }
}
