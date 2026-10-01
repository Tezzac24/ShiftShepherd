import { currentAndUpcomingEvents, visibleAnnouncements } from '../../lib/appData/selectors';
import { canCreateChurchAnnouncements, canCreateTeamAnnouncements, canViewTeam } from '../../lib/permissions';
import { Announcement, Event, SessionUser, Team } from '../../types';
import { formatTime, formatUpcoming } from '../../utils/dates';
import { recurrenceLabelForEvent } from '../../utils/recurrence';

export const CHURCH_AUDIENCE = 'church';

/** Query parameters select from accessible data; they never grant access. */
export function announcementTeam(user: SessionUser, teams: Team[], teamId: unknown) {
  return typeof teamId === 'string' ? teams.find((team) => team.id === teamId &&
    team.organisation_id === user.profile.organisation_id && team.archived_at === null && canViewTeam(user, team.id)) : undefined;
}

export function accessibleAnnouncements(user: SessionUser, announcements: Announcement[], archivedTeams: Team[] = []) {
  const archivedIds = new Set(archivedTeams.map((team) => team.id));
  return visibleAnnouncements(user, announcements.filter((notice) => notice.organisation_id === user.profile.organisation_id &&
    (!notice.team_id || !archivedIds.has(notice.team_id))));
}

export function announcementAudienceOptions(user: SessionUser, teams: Team[]) {
  return [
    ...(canCreateChurchAnnouncements(user)
      ? [{ label: 'Whole church', value: CHURCH_AUDIENCE, description: 'Visible to your church' }] : []),
    ...teams.filter((team) => team.organisation_id === user.profile.organisation_id && team.archived_at === null &&
      canCreateTeamAnnouncements(user, team.id)).map((team) => ({
      label: team.name, value: team.id, description: 'Team announcement',
    })),
  ];
}

/** Preserve an existing link even when the chooser's current read cannot resolve it. */
export function announcementEventOptions(events: Event[], organisationId: string, selectedId: string | null) {
  const scoped = events.filter((event) => event.organisation_id === organisationId);
  const upcoming = currentAndUpcomingEvents(scoped);
  const retained = selectedId && !upcoming.some((event) => event.id === selectedId)
    ? scoped.find((event) => event.id === selectedId) : undefined;
  const eventContext = (event: Event) => [formatUpcoming(new Date(event.start_time)), formatTime(event.start_time), recurrenceLabelForEvent(event)].filter(Boolean).join(' · ');
  return [
    { label: 'No linked event', value: 'none' },
    ...(selectedId && !upcoming.some((event) => event.id === selectedId)
      ? [{ label: retained ? `${retained.title} (finished)` : 'Current linked event (details unavailable)', value: selectedId, description: retained ? eventContext(retained) : undefined }] : []),
    ...upcoming.map((event) => ({ label: event.title, value: event.id, description: eventContext(event) })),
  ];
}

/** Readiness refreshes keep a draft; actual posting-role changes discard old work. */
export function announcementAuthorityKey(user: SessionUser) {
  return [user.orgRole, ...user.memberships.filter((membership) => membership.role === 'team_leader')
    .map((membership) => membership.team_id).sort()].join(':');
}
