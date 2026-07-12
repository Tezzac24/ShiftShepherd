import { OrganisationMemberSummary, OrganisationRoleName } from '../../types';
import { ORGANISATION_ROLE_OPTIONS } from '../../lib/permissions';

export function organisationRoleLabel(role: OrganisationRoleName | null): string {
  if (!role) return 'No current role';
  return ORGANISATION_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

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

