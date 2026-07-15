import { SessionUser, Team, TeamMembership, UserProfile } from '../../../types';
import {
  archivedTeams,
  eligibleInitialTeamAdmins,
  eligibleTeamProfiles,
  teamMembers,
  visibleTeams,
} from '../selectors';

const TEAM: Team = {
  id: 'team-a',
  organisation_id: 'org-a',
  name: 'Choir',
  description: '',
  type: 'choir',
  avatar_url: null,
  archived_at: null,
  archived_by: null,
  created_at: '2026-07-11T00:00:00Z',
};

function profile(
  id: string,
  fullName: string,
  overrides: Partial<UserProfile> = {},
): UserProfile {
  return {
    id,
    auth_user_id: `auth-${id}`,
    organisation_id: 'org-a',
    full_name: fullName,
    email: `${id}@example.church`,
    phone: null,
    avatar_url: null,
    access_status: 'active',
    access_removed_at: null,
    access_removed_by: null,
    access_removal_reason: null,
    created_at: '2026-07-11T00:00:00Z',
    ...overrides,
  };
}

function membership(
  id: string,
  userId: string,
  overrides: Partial<TeamMembership> = {},
): TeamMembership {
  return {
    id,
    team_id: TEAM.id,
    user_id: userId,
    role: 'member',
    created_at: `2026-07-11T00:00:0${id.length % 9}Z`,
    ...overrides,
  };
}

describe('teamMembers', () => {
  it('deduplicates membership rows, keeps leadership, and sorts names stably', () => {
    const users = [profile('zara', 'Zara Young'), profile('alex', 'Alex Brown')];
    const rows = [
      membership('m-zara', 'zara'),
      membership('m-alex-member', 'alex'),
      membership('m-alex-leader', 'alex', { role: 'team_leader' }),
    ];
    const result = teamMembers(TEAM.id, rows, users);
    expect(result.map(({ profile: person }) => person.full_name)).toEqual([
      'Alex Brown',
      'Zara Young',
    ]);
    expect(result[0]?.membership.role).toBe('team_leader');
  });

  it('ignores memberships whose profile is unavailable', () => {
    expect(teamMembers(TEAM.id, [membership('missing', 'missing')], [])).toEqual([]);
  });
});

describe('eligibleTeamProfiles', () => {
  const alexOne = profile('alex-1', 'Alex Brown', {
    email: 'alex.one@example.church',
    avatar_url: 'profiles/alex-1/photo.jpg',
  });
  const alexTwo = profile('alex-2', 'Alex Brown', { email: 'alex.two@example.church' });
  const zara = profile('zara', 'Zara Young');
  const current = profile('current', 'Current Member');
  const unlinked = profile('unlinked', 'Unlinked Person', { auth_user_id: '' });
  const removed = profile('removed', 'Removed Person', {
    access_status: 'removed',
    access_removed_at: '2026-07-12T00:00:00Z',
    access_removed_by: 'current',
    access_removal_reason: 'admin_removed',
  });
  const external = profile('external', 'External Person', { organisation_id: 'org-b' });
  const users = [zara, current, alexTwo, unlinked, removed, external, alexOne, alexOne];
  const memberships = [membership('current-membership', current.id)];

  it('excludes current, unlinked, removed, cross-organisation, and duplicate profiles', () => {
    const result = eligibleTeamProfiles(TEAM, memberships, users);
    expect(result.map((person) => person.id)).toEqual(['alex-1', 'alex-2', 'zara']);
  });

  it('uses stable alphabetical ordering while keeping same-name profiles distinct', () => {
    const result = eligibleTeamProfiles(TEAM, memberships, users);
    expect(result.slice(0, 2).map((person) => person.email)).toEqual([
      'alex.one@example.church',
      'alex.two@example.church',
    ]);
  });

  it('searches names and email case-insensitively after trimming the query', () => {
    expect(
      eligibleTeamProfiles(TEAM, memberships, users, '  aLeX  ').map((person) => person.id),
    ).toEqual(['alex-1', 'alex-2']);
    expect(
      eligibleTeamProfiles(TEAM, memberships, users, 'TWO@EXAMPLE').map(
        (person) => person.id,
      ),
    ).toEqual(['alex-2']);
  });

  it('treats an empty or whitespace query as browse-all and preserves avatar data', () => {
    const empty = eligibleTeamProfiles(TEAM, memberships, users, '   ');
    expect(empty).toHaveLength(3);
    expect(empty[0]).toEqual(expect.objectContaining({
      full_name: 'Alex Brown',
      avatar_url: 'profiles/alex-1/photo.jpg',
    }));
  });
});

describe('team lifecycle selectors', () => {
  const creator = profile('creator', 'Church Admin');
  const active = profile('active', 'Active Member');
  const removed = profile('removed', 'Removed Member', { access_status: 'removed' });
  const unlinked = profile('unlinked', 'Unlinked Member', { auth_user_id: '' });
  const external = profile('external', 'External Member', { organisation_id: 'org-b' });

  it('offers active linked same-organisation profiles and allows the creator explicitly', () => {
    const result = eligibleInitialTeamAdmins('org-a', [removed, external, active, creator, unlinked]);
    expect(result.map((person) => person.id)).toEqual(['active', 'creator']);
    expect(result.some((person) => person.id === creator.id)).toBe(true);
  });

  it('searches and bounds initial-admin results', () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      profile(`person-${index}`, `Person ${String(index).padStart(2, '0')}`),
    );
    expect(eligibleInitialTeamAdmins('org-a', many, '', 10)).toHaveLength(10);
    expect(
      eligibleInitialTeamAdmins('org-a', [active, creator], 'church admin').map(
        (person) => person.id,
      ),
    ).toEqual(['creator']);
  });

  it('hides archived teams from active views and exposes them only to church admins', () => {
    const archived = {
      ...TEAM,
      id: 'team-archived',
      archived_at: '2026-07-15T00:00:00Z',
      archived_by: creator.id,
    };
    const admin: SessionUser = {
      profile: creator,
      orgRole: 'church_admin',
      memberships: [],
    };
    const member: SessionUser = {
      profile: active,
      orgRole: 'general_member',
      memberships: [membership('retained', active.id, { team_id: archived.id })],
    };
    expect(visibleTeams(admin, [TEAM, archived])).toEqual([TEAM]);
    expect(visibleTeams(member, [TEAM, archived])).toEqual([]);
    expect(archivedTeams(admin, [TEAM, archived])).toEqual([archived]);
    expect(archivedTeams(member, [TEAM, archived])).toEqual([]);
  });
});
