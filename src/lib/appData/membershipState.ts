import { TeamMembership } from '../../types';

/** Canonical immutable upsert, deduped by row id and team/profile identity. */
export function upsertMembership(
  memberships: TeamMembership[],
  incoming: TeamMembership,
): TeamMembership[] {
  return [
    ...memberships.filter(
      (candidate) =>
        candidate.id !== incoming.id &&
        !(
          candidate.team_id === incoming.team_id &&
          candidate.user_id === incoming.user_id
        ),
    ),
    incoming,
  ].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

/** Remove one canonical membership by id and defensive team/profile identity. */
export function withoutMembership(
  memberships: TeamMembership[],
  removed: Pick<TeamMembership, 'id' | 'team_id' | 'user_id'>,
): TeamMembership[] {
  return memberships.filter(
    (membership) =>
      membership.id !== removed.id &&
      !(
        membership.team_id === removed.team_id &&
        membership.user_id === removed.user_id
      ),
  );
}

export function membershipsForProfile(
  memberships: TeamMembership[],
  profileId: string,
): TeamMembership[] {
  return memberships.filter((membership) => membership.user_id === profileId);
}
