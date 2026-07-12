import { SessionUser } from '../../../types';
import { canManageTeamAvatar, canManageTeamMemberships } from '..';

const TEAM_ID = 'team-a';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    profile: {
      id: 'profile-a',
      auth_user_id: 'auth-a',
      organisation_id: 'org-a',
      full_name: 'Alex Member',
      email: 'alex@example.com',
      phone: null,
      avatar_url: null,
      access_status: 'active',
      access_removed_at: null,
      access_removed_by: null,
      access_removal_reason: null,
      created_at: '2026-07-11T00:00:00Z',
    },
    orgRole: 'general_member',
    memberships: [],
    ...overrides,
  };
}

describe('canManageTeamAvatar', () => {
  it('allows a church admin', () => {
    expect(canManageTeamAvatar(user({ orgRole: 'church_admin' }), TEAM_ID)).toBe(true);
  });

  it('allows the target team leader', () => {
    expect(
      canManageTeamAvatar(
        user({
          memberships: [
            { id: 'm1', team_id: TEAM_ID, user_id: 'profile-a', role: 'team_leader', created_at: '' },
          ],
        }),
        TEAM_ID,
      ),
    ).toBe(true);
  });

  it('denies an ordinary member and a leader of another team', () => {
    const memberships: SessionUser['memberships'] = [
      { id: 'm1', team_id: TEAM_ID, user_id: 'profile-a', role: 'member', created_at: '' },
      { id: 'm2', team_id: 'team-b', user_id: 'profile-a', role: 'team_leader', created_at: '' },
    ];
    expect(canManageTeamAvatar(user({ memberships }), TEAM_ID)).toBe(false);
  });
});

describe('canManageTeamMemberships', () => {
  it('allows church admins and the target team leader', () => {
    expect(canManageTeamMemberships(user({ orgRole: 'church_admin' }), TEAM_ID)).toBe(true);
    expect(
      canManageTeamMemberships(
        user({
          memberships: [
            {
              id: 'm1',
              team_id: TEAM_ID,
              user_id: 'profile-a',
              role: 'team_leader',
              created_at: '',
            },
          ],
        }),
        TEAM_ID,
      ),
    ).toBe(true);
  });

  it('denies ordinary members and leaders of another team', () => {
    expect(
      canManageTeamMemberships(
        user({
          memberships: [
            {
              id: 'm1',
              team_id: TEAM_ID,
              user_id: 'profile-a',
              role: 'member',
              created_at: '',
            },
            {
              id: 'm2',
              team_id: 'team-b',
              user_id: 'profile-a',
              role: 'team_leader',
              created_at: '',
            },
          ],
        }),
        TEAM_ID,
      ),
    ).toBe(false);
  });
});
