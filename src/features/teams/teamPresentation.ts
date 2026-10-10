import { Href } from 'expo-router';

import { SheetAction } from '../../components/ActionSheet';
import { teamMembers, visibleTeams } from '../../lib/appData/selectors';
import {
  canCreateTeamAnnouncements, canManageTeamLifecycle, canManageTeamMemberships,
  canManageTeamRota, isMemberOfTeam,
} from '../../lib/permissions';
import { SessionUser, Team, TeamMembership, UserProfile } from '../../types';

/** Scope presentation even when a collection contains another church's rows. */
export function teamDirectory(user: SessionUser, teams: Team[], view: 'mine' | 'all') {
  return visibleTeams(user, teams.filter((team) => team.organisation_id === user.profile.organisation_id))
    .filter((team) => view === 'all' || isMemberOfTeam(user, team.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

export function currentTeamMembers(team: Team, memberships: TeamMembership[], profiles: UserProfile[]) {
  return teamMembers(team.id, memberships, profiles.filter((profile) =>
    profile.organisation_id === team.organisation_id && profile.access_status === 'active'));
}

export interface TeamManagementChoice {
  key: string;
  label: string;
  description: string;
  icon: SheetAction['icon'];
  destination: Href;
}

/** Shared destinations for the hub sheet and the retained settings deep link. */
export function teamManagementChoices(user: SessionUser, team: Team, liveMembers: boolean): TeamManagementChoice[] {
  const choices: TeamManagementChoice[] = [];
  const params = { teamId: team.id };
  if (canManageTeamRota(user, team.id)) {
    choices.push({ key: 'date', label: 'Add a date', description: 'Set the date, roles and people', icon: 'add-circle-outline',
      destination: { pathname: '/teams/[teamId]/rota/edit', params } });
    if (team.type === 'choir') choices.push({ key: 'month', label: 'Plan the month', description: 'Plan choir services and rehearsals together', icon: 'calendar-number-outline',
      destination: { pathname: '/teams/[teamId]/rota/plan-month', params } });
  }
  if (canCreateTeamAnnouncements(user, team.id)) choices.push({ key: 'announcement', label: 'Post team announcement', description: `Share an update with ${team.name}`, icon: 'megaphone-outline',
    destination: { pathname: '/announcements/edit', params } });
  if (canManageTeamMemberships(user, team.id)) choices.push({ key: 'members', label: liveMembers ? 'Manage members' : 'Members', description: liveMembers ? 'View people and manage team membership' : 'View the team member list', icon: 'people-outline',
    destination: { pathname: '/teams/[teamId]/settings/members', params } });
  if (canManageTeamLifecycle(user)) choices.push({ key: 'details', label: 'Edit team details', description: 'Name, description, photo or archive', icon: 'create-outline',
    destination: { pathname: '/teams/[teamId]/edit', params } });
  return choices;
}
