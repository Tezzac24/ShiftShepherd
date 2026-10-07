import { OrganisationMemberSummary, OrganisationRoleName, UserProfile } from '../../types';
import { ORGANISATION_ROLE_OPTIONS } from '../../lib/permissions';
import { listOrganisationMembers } from '../../lib/supabase/services/organisationMemberships';

export function organisationRoleLabel(role: OrganisationRoleName | null): string {
  if (!role) return 'No current role';
  return ORGANISATION_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

/** Plain presentation copy; the permission catalog still owns role values. */
export const organisationRoleDescriptions: Record<OrganisationRoleName, string> = {
  general_member: 'Can read church announcements and events, and take part in their teams.',
  announcement_manager: 'Can post and manage church-wide announcements.',
  event_manager: 'Can create and manage church events.',
  church_admin: 'Can manage members, church roles, invitations and teams, plus church announcements and events.',
};

export function filterOrganisationMembers(
  members: OrganisationMemberSummary[],
  query: string,
): OrganisationMemberSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return members;
  return members.filter(
    (member) =>
      member.full_name.toLocaleLowerCase().includes(needle) ||
      member.email.toLocaleLowerCase().includes(needle),
  );
}

export function organisationMemberAccessLabel(member: OrganisationMemberSummary): string {
  if (member.access_status === 'removed') return 'Access removed';
  if (!member.linked) return 'Invitation required';
  return 'Active access';
}

export function canInviteDirectoryMember(member: OrganisationMemberSummary): boolean {
  return !!member.email.trim() && (member.access_status === 'removed' || !member.linked);
}

export function memberSelectionParams(member: OrganisationMemberSummary, organisationId: string) {
  return { targetProfileId: member.profile_id, targetEmail: member.email, targetName: member.full_name, organisationId };
}

/** Route names/emails are search hints only; the exact server-returned ID must match. */
export async function findOrganisationMember({ profileId, emailHint, nameHint, profiles, organisationId }: {
  profileId: string;
  emailHint?: string;
  nameHint?: string;
  profiles: UserProfile[];
  organisationId: string;
}): Promise<OrganisationMemberSummary | null> {
  const known = profiles.find((profile) => profile.id === profileId && profile.organisation_id === organisationId);
  const queries = [...new Set([emailHint?.trim(), known?.email.trim(), nameHint?.trim(), known?.full_name.trim()].filter((value): value is string => !!value))];
  if (!queries.length) queries.push('');
  for (const query of queries) {
    const member = (await listOrganisationMembers(query)).find((candidate) => candidate.profile_id === profileId);
    if (member) return member;
  }
  return null;
}

export function routeValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function retainedTeamMembershipLabel(count: number): string {
  return `${count} team ${count === 1 ? 'membership' : 'memberships'} (includes archived teams)`;
}
