/** Client-only presentation of existing, active-organisation data. */
import {
  AvailabilityResponse,
  Event,
  EventOccurrence,
  RotaAssignment,
  RotaEntry,
  SessionUser,
  Team,
} from '../../types';
import { EntryPersonStatus, peopleForEntry, upcomingResponsibilities, visibleTeams } from './selectors';

export interface ServingSummary extends EntryPersonStatus {
  entry: RotaEntry;
  team: Team;
}

/** One upcoming date per person, retaining every role and the established
 * first-responded-assignment summary. Admin access does not require membership. */
export function myServing(
  user: SessionUser,
  entries: RotaEntry[],
  assignments: RotaAssignment[],
  teams: Team[],
  responses: AvailabilityResponse[],
): ServingSummary[] {
  const organisationId = user.profile.organisation_id;
  const accessibleTeams = visibleTeams(user, teams.filter((team) => team.organisation_id === organisationId));
  const scopedEntries = entries.filter((entry) => entry.organisation_id === organisationId);
  return upcomingResponsibilities(user, scopedEntries, assignments, accessibleTeams)
    .flatMap(({ entry, team }) => {
      const person = peopleForEntry(entry.id, assignments, responses)
        .find((candidate) => candidate.userId === user.profile.id);
      return person ? [{ ...person, entry, team }] : [];
    })
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date)
      || (a.entry.time ?? '').localeCompare(b.entry.time ?? '')
      || a.entry.id.localeCompare(b.entry.id));
}

export type ScheduleView = 'events' | 'serving';

/** Route input selects presentation only; it never selects a person or church. */
export function scheduleViewFromParam(value: string | string[] | undefined): ScheduleView {
  return value === 'serving' ? 'serving' : 'events';
}

export function scheduleDestination(view: ScheduleView) {
  return { pathname: '/(tabs)/calendar', params: { view } } as const;
}

export function eventDestination(event: Pick<Event, 'id' | 'start_time'>) {
  return {
    pathname: '/events/[id]',
    params: { id: event.id, occurrenceStart: event.start_time },
  } as const;
}

export function servingDestination(serving: Pick<ServingSummary, 'entry' | 'team'>) {
  return {
    pathname: '/teams/[teamId]/rota/[entryId]',
    params: { teamId: serving.team.id, entryId: serving.entry.id },
  } as const;
}

/** Keep Home short and never repeat its focused occurrence in the preview. */
export function homeEventPreview(events: EventOccurrence[], focusedEvent?: EventOccurrence): EventOccurrence[] {
  return events.filter((event) => event.occurrence_id !== focusedEvent?.occurrence_id).slice(0, 2);
}
