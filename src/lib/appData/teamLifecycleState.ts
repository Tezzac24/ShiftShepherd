import { Team, TeamMembership } from '../../types';
import { TeamsDirectory, TeamCreationResult } from '../supabase/services/teams';
import { upsertMembership } from './membershipState';

/** Canonical immutable team upsert. A lifecycle transition always retains the id. */
export function upsertTeam(teams: Team[], incoming: Team): Team[] {
  return [...teams.filter((team) => team.id !== incoming.id), incoming].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  );
}

/** Patch one create response into the single canonical directory snapshot. */
export function applyTeamCreation(
  directory: TeamsDirectory,
  result: TeamCreationResult,
): TeamsDirectory {
  return {
    ...directory,
    teams: upsertTeam(directory.teams, result.team),
    memberships: result.initialAdminMembership
      ? upsertMembership(directory.memberships, result.initialAdminMembership)
      : directory.memberships,
  };
}

/** Patch update/archive/restore metadata without touching retained child state. */
export function applyTeamLifecycleTeam(
  directory: TeamsDirectory,
  team: Team,
): TeamsDirectory {
  return { ...directory, teams: upsertTeam(directory.teams, team) };
}

/**
 * A church-admin refresh cannot re-read archived memberships under the active
 * access helper. Retain only rows the current session had already loaded for
 * archived team metadata still returned by RLS; never infer or broaden rows.
 */
export function retainKnownArchivedMemberships(
  previous: TeamsDirectory | null,
  incoming: TeamsDirectory,
): TeamsDirectory {
  if (!previous) return incoming;
  const archivedIds = new Set(
    incoming.teams.filter((team) => team.archived_at !== null).map((team) => team.id),
  );
  if (archivedIds.size === 0) return incoming;
  let memberships = incoming.memberships;
  for (const known of previous.memberships) {
    if (
      archivedIds.has(known.team_id) &&
      !memberships.some(
        (candidate) =>
          candidate.id === known.id ||
          (candidate.team_id === known.team_id && candidate.user_id === known.user_id),
      )
    ) {
      memberships = upsertMembership(memberships, known);
    }
  }
  return memberships === incoming.memberships ? incoming : { ...incoming, memberships };
}

/** Session permissions contain active memberships only; canonical history stays intact. */
export function activeMembershipsForProfile(
  memberships: TeamMembership[],
  teams: Team[],
  profileId: string,
): TeamMembership[] {
  const activeTeamIds = new Set(
    teams.filter((team) => team.archived_at === null).map((team) => team.id),
  );
  return memberships.filter(
    (membership) =>
      membership.user_id === profileId && activeTeamIds.has(membership.team_id),
  );
}

export interface TeamMutationScope {
  key: string;
  generation: number;
}

/**
 * A generation (not key equality alone) prevents A1 -> A2 -> A1 from accepting
 * a late A1 response after the scope left and returned.
 */
export function sameTeamMutationScope(
  captured: TeamMutationScope,
  current: TeamMutationScope,
): boolean {
  return captured.key === current.key && captured.generation === current.generation;
}

/**
 * Publish a remote mutation exactly once only while its captured scope is
 * still current, then request one coalesced quiet directory refresh.
 */
export async function publishScopedTeamMutation<T>({
  request,
  isCurrent,
  commit,
  queueRefresh,
  staleError,
}: {
  request: () => Promise<T>;
  isCurrent: () => boolean;
  commit: (result: T) => void;
  queueRefresh: () => void;
  staleError: () => Error;
}): Promise<T> {
  const result = await request();
  if (!isCurrent()) throw staleError();
  commit(result);
  queueRefresh();
  return result;
}
