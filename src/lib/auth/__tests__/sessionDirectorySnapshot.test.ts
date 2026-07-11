import { SessionUser, TeamMembership } from '../../../types';
import { applyDirectorySnapshotToSession } from '../AuthContext';

function session(profileId: string): SessionUser {
  return {
    profile: {
      id: profileId,
      auth_user_id: `auth-${profileId}`,
      organisation_id: 'org-a',
      full_name: 'Original Name',
      email: 'person@example.church',
      phone: null,
      avatar_url: null,
      created_at: '',
    },
    orgRole: 'general_member',
    memberships: [],
    supabaseProfileId: profileId,
  };
}

const membership: TeamMembership = {
  id: 'membership-a',
  team_id: 'team-a',
  user_id: 'profile-a',
  role: 'team_leader',
  created_at: '',
};

describe('applyDirectorySnapshotToSession', () => {
  it('refreshes the current live profile, organisation authority and memberships together', () => {
    const current = session('profile-a');
    const updated = applyDirectorySnapshotToSession(current, 'profile-a', {
      profile: { ...current.profile, full_name: 'Fresh Name' },
      orgRole: 'church_admin',
      memberships: [membership],
    });
    expect(updated).toEqual({
      ...current,
      profile: { ...current.profile, full_name: 'Fresh Name' },
      orgRole: 'church_admin',
      memberships: [membership],
    });
  });

  it('ignores a stale directory response after an account switch', () => {
    const switched = session('profile-b');
    expect(
      applyDirectorySnapshotToSession(switched, 'profile-a', {
        orgRole: 'church_admin',
        memberships: [membership],
      }),
    ).toBe(switched);
  });
});
