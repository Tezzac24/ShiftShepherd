import { ORGANISATION_ROLE_OPTIONS } from '../../../lib/permissions';
import { OrganisationMemberSummary } from '../../../types';
import {
  filterOrganisationMembers,
  organisationMemberAccessLabel,
  organisationRoleLabel,
} from '../organisationMembers';

function member(
  profileId: string,
  fullName: string,
  overrides: Partial<OrganisationMemberSummary> = {},
): OrganisationMemberSummary {
  return {
    profile_id: profileId,
    full_name: fullName,
    email: `${profileId}@example.church`,
    avatar_url: null,
    access_status: 'active',
    access_removed_at: null,
    access_removal_reason: null,
    linked: true,
    role: 'general_member',
    team_count: 0,
    pending_invitation_status: null,
    is_current_user: false,
    is_last_church_admin: false,
    ...overrides,
  };
}

describe('organisation role catalog', () => {
  it('contains exactly the four schema roles with one clear baseline and high-privilege admin', () => {
    expect(ORGANISATION_ROLE_OPTIONS.map((option) => option.value)).toEqual([
      'general_member',
      'announcement_manager',
      'event_manager',
      'church_admin',
    ]);
    expect(ORGANISATION_ROLE_OPTIONS.find((option) => option.value === 'general_member'))
      .toEqual(expect.objectContaining({ label: 'Church Member' }));
    expect(ORGANISATION_ROLE_OPTIONS.find((option) => option.value === 'church_admin'))
      .toEqual(expect.objectContaining({ highPrivilege: true }));
  });
});

describe('organisation member presentation helpers', () => {
  const members = [
    member('ruth', 'Ruth Johnson'),
    member('sarah', 'Sarah Williams', { email: 'leader@example.church', role: 'church_admin' }),
    member('former', 'Former Member', { access_status: 'removed', linked: true, role: null }),
    member('unlinked', 'Directory Person', { linked: false }),
  ];

  it('searches name and email case-insensitively after trimming', () => {
    expect(filterOrganisationMembers(members, '  RuTh ')).toEqual([members[0]]);
    expect(filterOrganisationMembers(members, 'LEADER@EXAMPLE')).toEqual([members[1]]);
  });

  it('keeps stable input ordering and browse-all behavior for empty search', () => {
    expect(filterOrganisationMembers(members, '   ')).toBe(members);
  });

  it('labels active, unlinked, and removed access without conflating them', () => {
    expect(organisationMemberAccessLabel(members[0]!)).toBe('Active access');
    expect(organisationMemberAccessLabel(members[2]!)).toBe('Access removed');
    expect(organisationMemberAccessLabel(members[3]!)).toBe('Invitation required');
  });

  it('maps role badges and removed no-role state to plain English', () => {
    expect(organisationRoleLabel('church_admin')).toBe('Church Admin');
    expect(organisationRoleLabel('general_member')).toBe('Church Member');
    expect(organisationRoleLabel(null)).toBe('No current role');
  });
});

