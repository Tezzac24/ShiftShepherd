import { AvailabilityResponse, EventOccurrence } from '../../../types';
import { eventDestination, homeEventPreview, myServing, scheduleDestination, scheduleViewFromParam, servingDestination } from '../presentation';
import { makeAssignment, makeEntry, makeEvent, makeTeam, makeUser, profile } from './presentationFixtures';

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21, 12));
});
afterEach(() => jest.useRealTimers());

describe('personal serving presentation', () => {
  it('keeps all roles on one entry and the first responded assignment summary', () => {
    const praise = makeAssignment();
    const worship = makeAssignment({ id: 'assignment-b', role_name: 'Worship Leader' });
    const responses: AvailabilityResponse[] = [
      { id: 'response-a', rota_assignment_id: praise.id, user_id: profile.id, status: 'not_responded', note: null, updated_at: '' },
      { id: 'response-b', rota_assignment_id: worship.id, user_id: profile.id, status: 'maybe', note: 'Checking my travel.', updated_at: '' },
    ];
    const result = myServing(makeUser(), [makeEntry()], [praise, worship], [makeTeam()], responses);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ assignments: [praise, worship], roleSummary: 'Praise Leader & Worship Leader', status: 'maybe', note: 'Checking my travel.' });
    expect(praise.role_name).toBe('Praise Leader');
  });

  it('preserves the first responded role when responses disagree', () => {
    const assignments = [makeAssignment(), makeAssignment({ id: 'assignment-b', role_name: 'Worship Leader' })];
    const responses: AvailabilityResponse[] = assignments.map((assignment, index) => ({
      id: `response-${index}`, rota_assignment_id: assignment.id, user_id: profile.id,
      status: index === 0 ? 'unavailable' : 'available', note: null, updated_at: '',
    }));
    expect(myServing(makeUser(), [makeEntry()], assignments, [makeTeam()], responses)[0].status).toBe('unavailable');
  });

  it('filters other people, cancellations, past dates, missing teams and inaccessible teams', () => {
    const entries = [
      makeEntry(), makeEntry({ id: 'cancelled', status: 'cancelled' }),
      makeEntry({ id: 'past', date: '2026-09-20' }), makeEntry({ id: 'missing', team_id: 'missing-team' }),
      makeEntry({ id: 'inaccessible', team_id: 'other-team' }), makeEntry({ id: 'someone-else' }),
    ];
    const assignments = entries.map((entry) => makeAssignment({ id: entry.id, rota_entry_id: entry.id,
      user_id: entry.id === 'someone-else' ? 'person-b' : profile.id }));
    expect(myServing(makeUser(), entries, assignments, [makeTeam(), makeTeam({ id: 'other-team' })], [])
      .map((item) => item.entry.id)).toEqual(['date-a']);
  });

  it('retains an admin assignment after leaving the active team, without broadening church or archive access', () => {
    const entries = [makeEntry(), makeEntry({ id: 'archived', team_id: 'archived-team' }),
      makeEntry({ id: 'other-church', organisation_id: 'church-b', team_id: 'other-church-team' }),
      makeEntry({ id: 'mismatched-entry', organisation_id: 'church-b' }),
      makeEntry({ id: 'mismatched-team', team_id: 'other-church-team' })];
    const assignments = entries.map((entry) => makeAssignment({ id: entry.id, rota_entry_id: entry.id }));
    const teams = [makeTeam(), makeTeam({ id: 'archived-team', archived_at: '2026-09-20T12:00:00Z' }),
      makeTeam({ id: 'other-church-team', organisation_id: 'church-b' })];
    const result = myServing(makeUser({ orgRole: 'church_admin', memberships: [] }), entries, assignments, teams, []);
    expect(result.map((item) => item.entry.id)).toEqual(['date-a']);
    expect(result[0].status).toBe('not_responded');
    expect(myServing(makeUser({ memberships: [] }), entries, assignments, teams, [])).toEqual([]);
  });

  it('orders dates by day, time and stable entry id while retaining two entries on the same day', () => {
    const entries = [makeEntry({ id: 'evening', time: '19:00' }), makeEntry({ id: 'next-day', date: '2026-09-28' }),
      makeEntry({ id: 'morning-b' }), makeEntry({ id: 'morning-a' })];
    const assignments = entries.map((entry) => makeAssignment({ id: entry.id, rota_entry_id: entry.id }));
    expect(myServing(makeUser(), entries, assignments, [makeTeam()], []).map((item) => item.entry.id))
      .toEqual(['morning-a', 'morning-b', 'evening', 'next-day']);
  });
});

describe('schedule destinations and previews', () => {
  it.each([undefined, 'events', 'all-churches', ['serving'], ['serving', 'events']])('defaults unsupported route input %p to church events', (value) => {
    expect(scheduleViewFromParam(value)).toBe('events');
  });

  it('opens My serving on the retained calendar route', () => {
    expect(scheduleViewFromParam('serving')).toBe('serving');
    expect(scheduleDestination('serving')).toEqual({ pathname: '/(tabs)/calendar', params: { view: 'serving' } });
    expect(scheduleDestination('events').params).toEqual({ view: 'events' });
  });

  it('keeps occurrence and team/date identifiers in their existing detail contracts', () => {
    const event = makeEvent();
    expect(eventDestination(event)).toEqual({ pathname: '/events/[id]', params: { id: event.id, occurrenceStart: event.start_time } });
    expect(servingDestination({ entry: makeEntry(), team: makeTeam() })).toEqual({
      pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: 'team-a', entryId: 'date-a' },
    });
  });

  it('limits Home to two further occurrences without removing the next date of a recurring series', () => {
    const occurrences: EventOccurrence[] = ['first', 'second', 'third', 'fourth'].map((occurrence_id) => ({
      ...makeEvent(), base_event_id: 'event-a', occurrence_id,
    }));
    expect(homeEventPreview(occurrences, occurrences[0]).map((event) => event.occurrence_id)).toEqual(['second', 'third']);
    expect(homeEventPreview(occurrences).map((event) => event.occurrence_id)).toEqual(['first', 'second']);
  });
});
