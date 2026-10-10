import { makeEntry } from '../../../lib/appData/__tests__/presentationFixtures';
import { AvailabilityStatus } from '../../../types';
import { servingResponseReminder, servingResponseWindow } from '../servingReminder';

const serving = { entry: makeEntry({ date: '2026-09-23', time: '10:15' }), status: 'not_responded' as const };

it('begins exactly 48 hours before the local serving time and stops when it starts', () => {
  expect(servingResponseReminder(serving, new Date(2026, 8, 21, 10, 14, 59))).toBeNull();
  expect(servingResponseReminder(serving, new Date(2026, 8, 21, 10, 15))).toBe('Response needed · Starts in 48 hours');
  expect(servingResponseReminder(serving, new Date(2026, 8, 23, 9, 15))).toBe('Response needed · Starts in 1 hour');
  expect(servingResponseReminder(serving, new Date(2026, 8, 23, 9, 16))).toBe('Response needed · Starts in less than an hour');
  expect(servingResponseReminder(serving, new Date(2026, 8, 23, 10, 15))).toBeNull();
});

it.each<AvailabilityStatus>(['available', 'maybe', 'unavailable'])('clears the reminder after a %s response', (status) => {
  expect(servingResponseReminder({ ...serving, status }, new Date(2026, 8, 22))).toBeNull();
});

it('never warns for a cancelled date', () => {
  expect(servingResponseWindow({ ...serving, entry: { ...serving.entry, status: 'cancelled' } })).toBeNull();
});

it('uses a date-based reminder without inventing a start time and retains it throughout that date', () => {
  const untimed = { ...serving, entry: { ...serving.entry, time: null } };
  expect(servingResponseReminder(untimed, new Date(2026, 8, 20, 23, 59))).toBeNull();
  expect(servingResponseReminder(untimed, new Date(2026, 8, 21))).toBe('Response needed · Your serving date is approaching');
  expect(servingResponseReminder(untimed, new Date(2026, 8, 23, 23, 59))).toBe('Response needed · You’re serving today');
  expect(servingResponseReminder(untimed, new Date(2026, 8, 24))).toBeNull();
});

it.each([{ date: '2026-02-30' }, { date: 'invalid' }, { time: '24:00' }, { time: '10:60' }, { time: '' }])(
  'does not invent urgency from invalid timing: %p', (overrides) => {
    expect(servingResponseWindow({ ...serving, entry: { ...serving.entry, ...overrides } })).toBeNull();
  },
);
