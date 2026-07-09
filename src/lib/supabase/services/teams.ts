/**
 * Teams & people service — the third live Supabase feature-data slice.
 *
 * Read-only by design: the app has no team-management screens yet (creating
 * teams and assigning members happens in the Supabase dashboard), so this
 * service only fetches the "directory" the rest of the app renders from —
 * the caller's organisation, the profiles they may see, their visible teams,
 * and those teams' memberships. RLS scopes every query:
 *
 *  - organisation + profiles + organisation roles: any member of the same
 *    organisation may read them;
 *  - teams: only teams the caller belongs to (church admins see every team);
 *  - team memberships: memberships of accessible teams, plus the caller's own.
 *
 * Migration 006 grants `authenticated` SELECT on all five tables; there are
 * deliberately no insert/update/delete grants here. No service-role keys;
 * anonymous sessions can read nothing.
 *
 * Rows map one-to-one onto the app types (same names, snake_case), so ids
 * stay real database UUIDs end-to-end — no mock-id bridging in live mode.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { Organisation, Team, TeamMembership, TeamRole, TeamType, UserProfile } from '../../../types';
import { getSupabase } from '../client';

// Friendly, non-technical messages — shown directly in the UI.
const LOAD_ERROR = 'We couldn’t load your teams right now. Please try again.';
const OFFLINE_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';

/** Everything the app needs to render people/team context in live mode. */
export interface TeamsDirectory {
  /** The caller's organisation (null only if RLS returns nothing — unlinked). */
  organisation: Organisation | null;
  /** Profiles in the caller's organisation, sorted by name. */
  users: UserProfile[];
  /** Teams the caller may see (their own; admins see all), sorted by name. */
  teams: Team[];
  /** Memberships of the visible teams (plus the caller's own). */
  memberships: TeamMembership[];
}

interface OrganisationRow {
  id: string;
  name: string;
  logo_url: string | null;
  primary_colour: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  organisation_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface TeamRow {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  type: TeamType;
  created_at: string;
}

interface MembershipRow {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  created_at: string;
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

function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  return /fetch|network|timeout/i.test(message);
}

/** Log the technical error, throw the friendly one. */
function fail(operation: string, error: unknown): never {
  console.warn(`[teams] ${operation} failed`, error);
  if (error instanceof Error && (error.message === LOAD_ERROR || error.message === OFFLINE_ERROR)) {
    throw error;
  }
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(LOAD_ERROR);
}

function toAppProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    // Seeded demo profiles may not be linked to an auth user yet.
    auth_user_id: row.auth_user_id ?? '',
    organisation_id: row.organisation_id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    created_at: row.created_at,
  };
}

/**
 * Fetch the live people/teams directory for the signed-in user. RLS does all
 * the filtering; the queries just ask for everything visible.
 */
export async function fetchTeamsDirectory(): Promise<TeamsDirectory> {
  const supabase = requireClient();
  try {
    const [orgRes, profilesRes, teamsRes, membershipsRes] = await Promise.all([
      supabase
        .from('organisations')
        .select('id, name, logo_url, primary_colour, created_at')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, auth_user_id, organisation_id, full_name, email, phone, avatar_url, created_at')
        .order('full_name', { ascending: true }),
      supabase
        .from('teams')
        .select('id, organisation_id, name, description, type, created_at')
        .order('name', { ascending: true }),
      supabase
        .from('team_memberships')
        .select('id, team_id, user_id, role, created_at')
        .order('created_at', { ascending: true }),
    ]);
    if (orgRes.error) throw orgRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (teamsRes.error) throw teamsRes.error;
    if (membershipsRes.error) throw membershipsRes.error;

    return {
      organisation: (orgRes.data as OrganisationRow | null) ?? null,
      users: ((profilesRes.data ?? []) as ProfileRow[]).map(toAppProfile),
      teams: (teamsRes.data ?? []) as TeamRow[],
      memberships: (membershipsRes.data ?? []) as MembershipRow[],
    };
  } catch (error) {
    fail('directory fetch', error);
  }
}
