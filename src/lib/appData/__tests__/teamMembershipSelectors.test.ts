import { Team, TeamMembership, UserProfile } from '../../../types';
import { eligibleTeamProfiles, teamMembers } from '../selectors';

const TEAM: Team = {
  id: 'team-a',
  organisation_id: 'org-a',
  name: 'Choir',
  description: '',
  type: 'choir',
  avatar_url: null,
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
  const external = profile('external', 'External Person', { organisation_id: 'org-b' });
  const users = [zara, current, alexTwo, unlinked, external, alexOne, alexOne];
  const memberships = [membership('current-membership', current.id)];

  it('excludes current, unlinked, cross-organisation, and duplicate profiles', () => {
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
