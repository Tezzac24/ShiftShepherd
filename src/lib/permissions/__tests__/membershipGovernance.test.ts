import { SessionUser, TeamMembership } from '../../../types';
import {
  canManageTeamRoles,
  demotionLeavesTeamWithoutAdmin,
  leaveTeamState,
  teamMemberRemovalState,
  teamRoleActionFor,
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
      access_status: 'active',
      access_removed_at: null,
      access_removed_by: null,
      access_removal_reason: null,
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

describe('canManageTeamRoles', () => {
  it('allows only an organisation church admin', () => {
    expect(canManageTeamRoles(session('church_admin', []))).toBe(true);
    expect(canManageTeamRoles(session('general_member', []))).toBe(false);
    expect(canManageTeamRoles(session('announcement_manager', []))).toBe(false);
    expect(canManageTeamRoles(session('event_manager', []))).toBe(false);
  });

  it('denies a team leader who is not a church admin', () => {
    const rows = [membership('1', SELF_ID, 'team_leader')];
    expect(canManageTeamRoles(session('general_member', rows))).toBe(false);
  });

  it('allows a church admin regardless of their own team membership', () => {
    expect(
      canManageTeamRoles(session('church_admin', [membership('1', SELF_ID, 'member')])),
    ).toBe(true);
    expect(
      canManageTeamRoles(session('church_admin', [membership('1', SELF_ID, 'team_leader')])),
    ).toBe(true);
  });
});

describe('teamRoleActionFor', () => {
  it('offers the opposite transition for each existing team role', () => {
    expect(teamRoleActionFor(membership('1', 'target', 'member'))).toBe('promote');
    expect(teamRoleActionFor(membership('1', 'target', 'team_leader'))).toBe('demote');
  });
});

describe('demotionLeavesTeamWithoutAdmin', () => {
  it('warns only when the target is the final team admin', () => {
    const finalAdmin = membership('1', 'target', 'team_leader');
    expect(demotionLeavesTeamWithoutAdmin(finalAdmin, [finalAdmin])).toBe(true);
    expect(
      demotionLeavesTeamWithoutAdmin(finalAdmin, [
        finalAdmin,
        membership('2', 'other', 'team_leader'),
      ]),
    ).toBe(false);
  });

  it('never warns for an ordinary member target or other-team admins', () => {
    const target = membership('1', 'target', 'member');
    expect(demotionLeavesTeamWithoutAdmin(target, [target])).toBe(false);
    const finalAdmin = membership('1', 'target', 'team_leader');
    const otherTeamAdmin: TeamMembership = {
      ...membership('2', 'other', 'team_leader'),
      team_id: 'team-b',
    };
    expect(demotionLeavesTeamWithoutAdmin(finalAdmin, [finalAdmin, otherTeamAdmin])).toBe(
      true,
    );
  });
});
