import { SessionUser, TeamMembership } from '../../../types';
import {
  leaveTeamState,
  teamMemberRemovalState,
} from '../index';

const TEAM_ID = 'team-a';
const SELF_ID = 'profile-self';

function membership(
  id: string,
  userId: string,
  role: TeamMembership['role'],
): TeamMembership {
  return { id, team_id: TEAM_ID, user_id: userId, role, created_at: id };
}

function session(
  orgRole: SessionUser['orgRole'],
  memberships: TeamMembership[],
): SessionUser {
  return {
    profile: {
      id: SELF_ID,
      auth_user_id: 'auth-self',
      organisation_id: 'org-a',
      full_name: 'Current User',
      email: 'current@example.church',
      phone: null,
      avatar_url: null,
      created_at: '',
    },
    orgRole,
    memberships: memberships.filter((item) => item.user_id === SELF_ID),
  };
}

describe('teamMemberRemovalState', () => {
  it('lets a team admin remove an ordinary member', () => {
    const rows = [
      membership('1', SELF_ID, 'team_leader'),
      membership('2', 'ordinary', 'member'),
    ];
    expect(teamMemberRemovalState(session('general_member', rows), rows[1]!, rows)).toBe(
      'removable',
    );
  });

  it('does not protect an ordinary team membership based on organisation role', () => {
    const rows = [
      membership('1', SELF_ID, 'team_leader'),
      membership('2', 'church-admin-target', 'member'),
    ];
    // The target organisation role is intentionally not an input: only the
    // target membership's `member` role controls protection.
    expect(teamMemberRemovalState(session('general_member', rows), rows[1]!, rows)).toBe(
      'removable',
    );
  });

  it('blocks a team admin from removing a peer team admin', () => {
    const rows = [
      membership('1', SELF_ID, 'team_leader'),
      membership('2', 'peer-admin', 'team_leader'),
    ];
    expect(teamMemberRemovalState(session('general_member', rows), rows[1]!, rows)).toBe(
      'peer_team_admin',
    );
  });

  it('lets a church admin remove a non-final team admin', () => {
    const rows = [
      membership('1', 'admin-a', 'team_leader'),
      membership('2', 'admin-b', 'team_leader'),
    ];
    expect(teamMemberRemovalState(session('church_admin', rows), rows[0]!, rows)).toBe(
      'removable',
    );
  });

  it('protects the final team admin and separates self-removal', () => {
    const rows = [membership('1', SELF_ID, 'team_leader')];
    expect(teamMemberRemovalState(session('church_admin', rows), rows[0]!, rows)).toBe(
      'self',
    );
    const otherFinal = [membership('2', 'other-admin', 'team_leader')];
    expect(
      teamMemberRemovalState(session('church_admin', otherFinal), otherFinal[0]!, otherFinal),
    ).toBe('final_team_admin');
  });
});

describe('leaveTeamState', () => {
  it('allows ordinary members and non-final team admins to leave', () => {
    expect(
      leaveTeamState(SELF_ID, TEAM_ID, [membership('1', SELF_ID, 'member')]),
    ).toBe('allowed');
    expect(
      leaveTeamState(SELF_ID, TEAM_ID, [
        membership('1', SELF_ID, 'team_leader'),
        membership('2', 'other-admin', 'team_leader'),
      ]),
    ).toBe('allowed');
  });

  it('blocks the final team admin and ignores non-members', () => {
    expect(
      leaveTeamState(SELF_ID, TEAM_ID, [membership('1', SELF_ID, 'team_leader')]),
    ).toBe('final_team_admin');
    expect(leaveTeamState(SELF_ID, TEAM_ID, [])).toBe('not_member');
  });
});
