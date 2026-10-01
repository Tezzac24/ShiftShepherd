import { completeAssignments, datesInMonthOnWeekday, matchingRotaEntry, monthDates, plannedDateKey, rotaDraft, teamRotaDates, validateRotaDraft } from '../rotaPresentation';
import { assignments, entry } from './rotaFixtures';

describe('rota presentation boundaries', () => {
  it('requires the owning team and church as well as the entry id', () => {
    expect(matchingRotaEntry([entry], entry.id, entry.team_id, entry.organisation_id)).toBe(entry);
    expect(matchingRotaEntry([entry], entry.id, 'different-team', entry.organisation_id)).toBeUndefined();
    expect(matchingRotaEntry([entry], entry.id, entry.team_id, 'different-church')).toBeUndefined();
  });

  it('keeps cancellations in upcoming and past history, scoped to the team and church', () => {
    const dates = [entry, { ...entry, id: 'old', date: '2026-09-20', status: 'cancelled' as const },
      { ...entry, id: 'cancelled', status: 'cancelled' as const }, { ...entry, id: 'foreign', organisation_id: 'other' }];
    expect(teamRotaDates(dates, entry.team_id, entry.organisation_id, new Date(2026, 9, 1))).toEqual({ upcoming: [entry, dates[2]], past: [dates[1]] });
  });

  it('retains exact time, all person-role pairs, and notes in an edit draft', () => {
    expect(rotaDraft(entry, assignments)).toMatchObject({ time: '09:17', notes: entry.notes,
      assignments: assignments.map(({ user_id, role_name }) => ({ user_id, role_name })) });
  });

  it('allows multiple different roles for a person, including both choir leaders', () => {
    const draft = rotaDraft(entry, assignments);
    expect(validateRotaDraft(draft)).toEqual({});
    expect(completeAssignments([...draft.assignments, { localId: 'new:1', user_id: null, role_name: null }])).toEqual(assignments.map(({ user_id, role_name }) => ({ user_id, role_name })));
  });

  it('keeps assignment row identities when preceding rows are removed, without sending those identities', () => {
    const draft = rotaDraft(entry, assignments);
    expect(new Set(draft.assignments.map(({ localId }) => localId)).size).toBe(assignments.length);
    const retained = draft.assignments.slice(1);
    expect(retained.map(({ localId }) => localId)).toEqual(rotaDraft(entry, assignments.slice(1)).assignments.map(({ localId }) => localId));
    expect(completeAssignments(retained)).toEqual(assignments.slice(1).map(({ user_id, role_name }) => ({ user_id, role_name })));
  });

  it('allows zero people and rejects incomplete pairs', () => {
    const draft = rotaDraft(entry, []);
    expect(validateRotaDraft(draft)).toEqual({});
    expect(validateRotaDraft({ ...draft, assignments: [{ localId: 'new:1', user_id: 'person', role_name: null }] })).toHaveProperty('assignment:0');
    expect(validateRotaDraft({ ...draft, assignments: [{ localId: 'new:1', user_id: null, role_name: 'Choir Member' }] })).toHaveProperty('assignment:0');
  });

  it('rejects duplicate pairs and multiple people in either leader role', () => {
    const draft = rotaDraft(entry, assignments);
    expect(validateRotaDraft({ ...draft, assignments: [...draft.assignments, draft.assignments[0]] })['assignment:3']).toContain('already has this role');
    for (const role_name of ['Praise Leader', 'Worship Leader']) {
      expect(validateRotaDraft({ ...draft, assignments: [...draft.assignments, { localId: 'new:1', user_id: 'other', role_name }] })['assignment:3']).toContain('Only one person');
    }
  });

  it('reveals required title and date before role errors', () => {
    expect(Object.keys(validateRotaDraft({ ...rotaDraft(), assignments: [{ localId: 'new:1', user_id: 'person', role_name: null }] })))
      .toEqual(['title', 'dateKey', 'assignment:0']);
  });
});

describe('monthly date presentation', () => {
  const now = new Date(2026, 9, 15);
  it('includes today and future weekdays, without generating past dates', () => {
    expect(datesInMonthOnWeekday(2026, 9, 4, now).map((date) => date.getDate())).toEqual([15, 22, 29]);
  });
  it('preserves ordered services and rehearsals, with distinct keys on the same date', () => {
    const dates = monthDates('2026-10', true, true, '0', new Set(['2026-10-18']), now);
    expect(dates.map(plannedDateKey)).toEqual(['service:2026-10-18', 'rehearsal:2026-10-18', 'service:2026-10-25', 'rehearsal:2026-10-25']);
    expect(dates.slice(0, 2).every((date) => date.alreadyPlanned)).toBe(true);
  });
  it('supports an empty pattern and a fully passed month', () => {
    expect(monthDates('2026-10', false, false, '6', new Set(), now)).toEqual([]);
    expect(monthDates('2026-09', true, true, '6', new Set(), now)).toEqual([]);
  });
});
