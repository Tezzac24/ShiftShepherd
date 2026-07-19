import { TeamMembership } from '../../../types';
import { upsertMembership } from '../membershipState';
import {
  publishScopedTeamMutation,
  sameTeamMutationScope,
} from '../teamLifecycleState';

const TEAM_ID = 'aaaaaaaa-0000-4000-a000-000000000001';

function membership(
  id: string,
  userId: string,
  role: TeamMembership['role'],
  createdAt = '2026-07-11T00:00:00Z',
): TeamMembership {
  return { id, team_id: TEAM_ID, user_id: userId, role, created_at: createdAt };
}

describe('canonical team role patches', () => {
  it('patches a promotion in place: same id, same created_at, no duplicate row', () => {
    const original = membership('m-1', 'p-1', 'member', '2026-07-11T00:00:00Z');
    const other = membership('m-2', 'p-2', 'team_leader', '2026-07-11T00:00:01Z');
    const promoted = { ...original, role: 'team_leader' as const };
    const next = upsertMembership([original, other], promoted);
    expect(next).toHaveLength(2);
    const patched = next.find((row) => row.id === 'm-1');
    expect(patched).toEqual(
      expect.objectContaining({
        id: 'm-1',
        user_id: 'p-1',
        role: 'team_leader',
        created_at: '2026-07-11T00:00:00Z',
      }),
    );
    expect(next.filter((row) => row.user_id === 'p-1')).toHaveLength(1);
    expect(next.find((row) => row.id === 'm-2')).toEqual(other);
  });

  it('patches the final-leader demotion to a valid zero-leader team', () => {
    const finalLeader = membership('m-1', 'p-1', 'team_leader');
    const ordinary = membership('m-2', 'p-2', 'member');
    const next = upsertMembership(
      [finalLeader, ordinary],
      { ...finalLeader, role: 'member' },
    );
    expect(next).toHaveLength(2);
    expect(next.every((row) => row.role === 'member')).toBe(true);
    // Nobody was auto-promoted, removed, or invented in place of the leader.
    expect(next.map((row) => row.id).sort()).toEqual(['m-1', 'm-2']);
  });

  it('recovers a zero-leader team by promoting an existing membership only', () => {
    const a = membership('m-1', 'p-1', 'member');
    const b = membership('m-2', 'p-2', 'member');
    const next = upsertMembership([a, b], { ...b, role: 'team_leader' });
    expect(next.filter((row) => row.role === 'team_leader')).toEqual([
      expect.objectContaining({ id: 'm-2', user_id: 'p-2' }),
    ]);
    expect(next).toHaveLength(2);
  });
});

describe('team role mutation scope fencing', () => {
  it('rejects an A1 to A2 to A1 round trip even when the key matches again', () => {
    const captured = { key: 'auth-a:profile-a:org-a', generation: 2 };
    expect(
      sameTeamMutationScope(captured, { key: 'auth-a:profile-a:org-a', generation: 4 }),
    ).toBe(false);
    expect(
      sameTeamMutationScope(captured, { key: 'auth-a:profile-a:org-a', generation: 2 }),
    ).toBe(true);
  });

  it('commits one role patch and queues one quiet refresh for a current result', async () => {
    const promoted = membership('m-1', 'p-1', 'team_leader');
    const commit = jest.fn();
    const queueRefresh = jest.fn();
    await expect(
      publishScopedTeamMutation({
        request: async () => promoted,
        isCurrent: () => true,
        commit,
        queueRefresh,
        staleError: () => new Error('stale'),
      }),
    ).resolves.toBe(promoted);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(promoted);
    expect(queueRefresh).toHaveBeenCalledTimes(1);
  });

  it('drops a late role result after the account/profile scope changes', async () => {
    let current = true;
    let resolveRequest!: (value: TeamMembership) => void;
    const request = new Promise<TeamMembership>((resolve) => {
      resolveRequest = resolve;
    });
    const commit = jest.fn();
    const queueRefresh = jest.fn();
    const pending = publishScopedTeamMutation({
      request: () => request,
      isCurrent: () => current,
      commit,
      queueRefresh,
      staleError: () => new Error('stale role result'),
    });
    current = false; // account switch / access removal while in flight
    resolveRequest(membership('m-1', 'p-1', 'team_leader'));
    await expect(pending).rejects.toThrow('stale role result');
    expect(commit).not.toHaveBeenCalled();
    expect(queueRefresh).not.toHaveBeenCalled();
  });

  it('publishes nothing when the role request itself fails', async () => {
    const commit = jest.fn();
    const queueRefresh = jest.fn();
    await expect(
      publishScopedTeamMutation({
        request: async () => {
          throw new Error('Only a church admin can change team roles.');
        },
        isCurrent: () => true,
        commit,
        queueRefresh,
        staleError: () => new Error('stale'),
      }),
    ).rejects.toThrow('Only a church admin can change team roles.');
    expect(commit).not.toHaveBeenCalled();
    expect(queueRefresh).not.toHaveBeenCalled();
  });
});
