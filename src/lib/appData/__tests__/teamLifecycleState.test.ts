import { Team, TeamMembership } from '../../../types';
import { TeamsDirectory, TeamCreationResult } from '../../supabase/services/teams';
import {
  activeMembershipsForProfile,
  applyTeamCreation,
  applyTeamLifecycleTeam,
  publishScopedTeamMutation,
  retainKnownArchivedMemberships,
  sameTeamMutationScope,
} from '../teamLifecycleState';

const PROFILE_ID = '20000000-0000-4000-a000-000000000001';
const OTHER_ID = '20000000-0000-4000-a000-000000000002';

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: '30000000-0000-4000-a000-000000000001',
    organisation_id: '10000000-0000-4000-a000-000000000001',
    name: 'Welcome Team',
    description: '',
    type: 'generic',
    avatar_url: null,
    archived_at: null,
    archived_by: null,
    created_at: '2026-07-15T00:45:13.000Z',
    ...overrides,
  };
}

function membership(userId = PROFILE_ID): TeamMembership {
  return {
    id: `40000000-0000-4000-a000-00000000000${userId === PROFILE_ID ? '1' : '2'}`,
    team_id: team().id,
    user_id: userId,
    role: 'team_leader',
    created_at: '2026-07-15T00:45:13.000Z',
  };
}

function directory(): TeamsDirectory {
  return {
    organisation: null,
    users: [],
    teams: [],
    memberships: [],
    currentOrgRole: 'church_admin',
  };
}

describe('canonical team lifecycle state', () => {
  it('patches a zero-admin create once and never invents creator membership', () => {
    const before = directory();
    const result: TeamCreationResult = { team: team(), initialAdminMembership: null };
    const after = applyTeamCreation(before, result);
    expect(after.teams).toEqual([result.team]);
    expect(after.memberships).toBe(before.memberships);
    expect(after.memberships).toHaveLength(0);

    const repeated = applyTeamCreation(after, result);
    expect(repeated.teams).toHaveLength(1);
  });

  it('adds only the explicitly selected initial admin, including the creator when selected', () => {
    const creatorMembership = membership(PROFILE_ID);
    const withCreator = applyTeamCreation(directory(), {
      team: team(),
      initialAdminMembership: creatorMembership,
    });
    expect(withCreator.memberships).toEqual([creatorMembership]);

    const otherMembership = membership(OTHER_ID);
    const withOther = applyTeamCreation(directory(), {
      team: team(),
      initialAdminMembership: otherMembership,
    });
    expect(withOther.memberships).toEqual([otherMembership]);
    expect(withOther.memberships.some((row) => row.user_id === PROFILE_ID)).toBe(false);
  });

  it('archives metadata without deleting canonical memberships and hides active session access', () => {
    const retainedMembership = membership();
    const before = { ...directory(), teams: [team()], memberships: [retainedMembership] };
    const archived = team({
      archived_at: '2026-07-15T01:00:00.000Z',
      archived_by: PROFILE_ID,
    });
    const after = applyTeamLifecycleTeam(before, archived);
    expect(after.teams).toEqual([archived]);
    expect(after.memberships).toBe(before.memberships);
    expect(activeMembershipsForProfile(after.memberships, after.teams, PROFILE_ID)).toEqual([]);
  });

  it('restores the same id and retained membership without recreating child rows', () => {
    const retainedMembership = membership();
    const archived = team({ archived_at: '2026-07-15T01:00:00.000Z', archived_by: PROFILE_ID });
    const before = { ...directory(), teams: [archived], memberships: [retainedMembership] };
    const restored = team();
    const after = applyTeamLifecycleTeam(before, restored);
    expect(after.teams[0].id).toBe(archived.id);
    expect(after.memberships).toBe(before.memberships);
    expect(activeMembershipsForProfile(after.memberships, after.teams, PROFILE_ID)).toEqual([
      retainedMembership,
    ]);
  });

  it('retains only already-known archived memberships across an admin refresh', () => {
    const retained = membership();
    const archived = team({ archived_at: '2026-07-15T01:00:00.000Z', archived_by: PROFILE_ID });
    const previous = { ...directory(), teams: [archived], memberships: [retained] };
    const incoming = { ...directory(), teams: [archived], memberships: [] };
    expect(retainKnownArchivedMemberships(previous, incoming).memberships).toEqual([retained]);

    const activeIncoming = { ...incoming, teams: [team()] };
    expect(retainKnownArchivedMemberships(previous, activeIncoming)).toBe(activeIncoming);
  });

  it('updates one canonical team in place without duplicating its id', () => {
    const original = team();
    const other = team({ id: '30000000-0000-4000-a000-000000000002', name: 'Care Team' });
    const before = { ...directory(), teams: [original, other] };
    const updated = team({ name: 'Welcome and Hosting' });
    const after = applyTeamLifecycleTeam(before, updated);
    expect(after.teams).toHaveLength(2);
    expect(after.teams.filter((row) => row.id === original.id)).toEqual([updated]);
  });
});

describe('team mutation scope fencing', () => {
  it('rejects Auth account, active profile, and organisation changes', () => {
    const captured = { key: 'auth-a:profile-a:org-a', generation: 7 };
    expect(sameTeamMutationScope(captured, captured)).toBe(true);
    expect(
      sameTeamMutationScope(captured, { key: 'auth-b:profile-a:org-a', generation: 8 }),
    ).toBe(false);
    expect(
      sameTeamMutationScope(captured, { key: 'auth-a:profile-b:org-b', generation: 8 }),
    ).toBe(false);
  });

  it('rejects an A1 to A2 to A1 round trip even when the key matches again', () => {
    const captured = { key: 'auth-a:profile-a:org-a', generation: 3 };
    const returnedToA1 = { key: 'auth-a:profile-a:org-a', generation: 5 };
    expect(sameTeamMutationScope(captured, returnedToA1)).toBe(false);
  });

  it('commits once and queues one quiet refresh for a current result', async () => {
    const result = team();
    const commit = jest.fn();
    const queueRefresh = jest.fn();
    await expect(
      publishScopedTeamMutation({
        request: async () => result,
        isCurrent: () => true,
        commit,
        queueRefresh,
        staleError: () => new Error('stale'),
      }),
    ).resolves.toBe(result);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(result);
    expect(queueRefresh).toHaveBeenCalledTimes(1);
  });

  it('drops a result after an account/profile scope change without patching or refreshing', async () => {
    let current = true;
    let resolveRequest!: (value: Team) => void;
    const request = new Promise<Team>((resolve) => {
      resolveRequest = resolve;
    });
    const commit = jest.fn();
    const queueRefresh = jest.fn();
    const pending = publishScopedTeamMutation({
      request: () => request,
      isCurrent: () => current,
      commit,
      queueRefresh,
      staleError: () => new Error('stale scope'),
    });
    current = false;
    resolveRequest(team());
    await expect(pending).rejects.toThrow('stale scope');
    expect(commit).not.toHaveBeenCalled();
    expect(queueRefresh).not.toHaveBeenCalled();
  });
});
