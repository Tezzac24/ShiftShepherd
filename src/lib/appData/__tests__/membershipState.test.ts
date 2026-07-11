import { SessionUser, Team, TeamMembership, UserProfile } from '../../../types';
import {
  membershipsForProfile,
  upsertMembership,
  withoutMembership,
} from '../membershipState';
import { eligibleTeamProfiles, teamMembers, visibleTeams } from '../selectors';

const SELF_ID = 'profile-self';
const OTHER_ID = 'profile-other';
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

function membership(id: string, teamId: string, userId: string): TeamMembership {
  return { id, team_id: teamId, user_id: userId, role: 'member', created_at: id };
}

const teams: Team[] = [TEAM_A, TEAM_B].map((id) => ({
  id,
  organisation_id: 'org-a',
  name: id,
  description: '',
  type: 'generic',
  avatar_url: null,
  created_at: '',
}));

const users: UserProfile[] = [SELF_ID, OTHER_ID].map((id) => ({
  id,
  auth_user_id: `auth-${id}`,
  organisation_id: 'org-a',
  full_name: id,
  email: `${id}@example.church`,
  phone: null,
  avatar_url: null,
  created_at: '',
}));

function session(memberships: TeamMembership[]): SessionUser {
  return { profile: users[0]!, orgRole: 'general_member', memberships };
}

describe('canonical membership patches', () => {
  it('adding the current profile updates My Teams, member count and candidates together', () => {
    const added = membership('m-self-a', TEAM_A, SELF_ID);
    const canonical = upsertMembership([], added);
    const own = membershipsForProfile(canonical, SELF_ID);
    expect(visibleTeams(session(own), teams).map((team) => team.id)).toEqual([TEAM_A]);
    expect(teamMembers(TEAM_A, canonical, users)).toHaveLength(1);
    expect(eligibleTeamProfiles(teams[0]!, canonical, users).map((user) => user.id)).toEqual([
      OTHER_ID,
    ]);
  });

  it('adding or removing another profile does not change current My Teams', () => {
    const own = membership('m-self-a', TEAM_A, SELF_ID);
    const withOther = upsertMembership([own], membership('m-other-a', TEAM_A, OTHER_ID));
    expect(membershipsForProfile(withOther, SELF_ID)).toEqual([own]);
    const withoutOther = withoutMembership(withOther, {
      id: 'm-other-a',
      team_id: TEAM_A,
      user_id: OTHER_ID,
    });
    expect(membershipsForProfile(withoutOther, SELF_ID)).toEqual([own]);
    expect(teamMembers(TEAM_A, withoutOther, users)).toHaveLength(1);
  });

  it('successful leave removes only that team and matches a scoped server refresh', () => {
    const teamA = membership('m-self-a', TEAM_A, SELF_ID);
    const teamB = membership('m-self-b', TEAM_B, SELF_ID);
    const patched = withoutMembership([teamA, teamB], teamA);
    const refreshed = [teamB];
    expect(patched).toEqual(refreshed);
    expect(visibleTeams(session(membershipsForProfile(patched, SELF_ID)), teams).map((team) => team.id))
      .toEqual([TEAM_B]);
  });

  it('deduplicates retry responses without changing unrelated teams', () => {
    const teamA = membership('m-self-a', TEAM_A, SELF_ID);
    const teamB = membership('m-other-b', TEAM_B, OTHER_ID);
    const canonical = upsertMembership([teamA, teamB], { ...teamA, role: 'team_leader' });
    expect(canonical).toHaveLength(2);
    expect(canonical.find((item) => item.team_id === TEAM_A)?.role).toBe('team_leader');
    expect(canonical.find((item) => item.team_id === TEAM_B)).toEqual(teamB);
  });
});
