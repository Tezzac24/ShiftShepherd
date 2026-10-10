import { assignmentsForEntry, rotaEntriesForTeam } from '../../lib/appData/selectors';
import { CHOIR_MEMBER_ROLE, PRAISE_LEADER_ROLE, WORSHIP_LEADER_ROLE } from '../../lib/permissions';
import { RotaAssignment, RotaEntry } from '../../types';
import { toDateKey } from '../../utils/dates';

export function matchingRotaEntry(entries: RotaEntry[], entryId: string | null, teamId: string | null, organisationId: string) {
  return entries.find((entry) => entry.id === entryId && entry.team_id === teamId && entry.organisation_id === organisationId);
}

export function teamRotaDates(entries: RotaEntry[], teamId: string, organisationId: string, today = new Date()) {
  const dateKey = toDateKey(today);
  const scoped = rotaEntriesForTeam(teamId, entries).filter((entry) => entry.organisation_id === organisationId);
  return { upcoming: scoped.filter((entry) => entry.date >= dateKey), past: scoped.filter((entry) => entry.date < dateKey).reverse() };
}

/** Existing choices remain fixed; retained historical roles are added per row. */
export const rotaRoles: Record<string, string[]> = {
  choir: [PRAISE_LEADER_ROLE, WORSHIP_LEADER_ROLE, CHOIR_MEMBER_ROLE, 'Backup Vocal'],
  media: ['Sound', 'Camera', 'Slides', 'Livestream'],
  generic: ['Team Member', 'Front Door', 'Welcome Desk', 'Setup', 'Offering'],
};

export interface DraftAssignment {
  /** Local form identity only; never sent with an assignment payload. */
  localId: string;
  user_id: string | null;
  role_name: string | null;
}
export interface RotaDraft {
  title: string;
  dateKey: string | null;
  time: string | null;
  notes: string;
  assignments: DraftAssignment[];
}
export type RotaField = 'title' | 'dateKey' | `assignment:${number}`;
export type RotaErrors = Partial<Record<RotaField, string>>;

export function rotaDraft(entry?: RotaEntry, assignments: RotaAssignment[] = []): RotaDraft {
  return { title: entry?.title ?? '', dateKey: entry?.date ?? null, time: entry?.time ?? null, notes: entry?.notes ?? '',
    assignments: entry ? assignmentsForEntry(entry.id, assignments).map(({ id, user_id, role_name }) => ({ localId: `saved:${id}`, user_id, role_name }))
      : [{ localId: 'new:0', user_id: null, role_name: null }] };
}

export function completeAssignments(assignments: DraftAssignment[]): { user_id: string; role_name: string }[] {
  return assignments.flatMap(({ user_id, role_name }) => user_id && role_name ? [{ user_id, role_name }] : []);
}

export function validateRotaDraft(draft: RotaDraft): RotaErrors {
  const errors: RotaErrors = {};
  if (!draft.title.trim()) errors.title = 'Add a title for this date.';
  if (!draft.dateKey) errors.dateKey = 'Choose a date.';
  draft.assignments.forEach((assignment, index) => {
    const key: RotaField = `assignment:${index}`;
    if (!!assignment.user_id !== !!assignment.role_name) errors[key] = `Choose both a person and a role for person ${index + 1}.`;
    if (!assignment.user_id || !assignment.role_name) return;
    const previous = draft.assignments.slice(0, index);
    if (previous.some((item) => item.user_id === assignment.user_id && item.role_name === assignment.role_name)) {
      errors[key] = 'This person already has this role. Choose a different role or remove the extra row.';
    } else if ([PRAISE_LEADER_ROLE, WORSHIP_LEADER_ROLE].includes(assignment.role_name)
      && previous.some((item) => item.user_id && item.role_name === assignment.role_name)) {
      errors[key] = `Only one person can be the ${assignment.role_name} for a date.`;
    }
  });
  return errors;
}

export const NO_LEADER = 'none';
export interface PlannedDate { dateKey: string; date: Date; kind: 'service' | 'rehearsal'; alreadyPlanned: boolean }
export interface DateOverride { included?: boolean; praiseId?: string; worshipId?: string }

/** Same current/future weekday dates used by the existing monthly planner. */
export function datesInMonthOnWeekday(year: number, month: number, weekday: number, now = new Date()): Date[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const result: Date[] = [];
  for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
    const date = new Date(year, month, day);
    if (date.getDay() === weekday && date >= today) result.push(date);
  }
  return result;
}

export function plannedDateKey(date: PlannedDate) { return `${date.kind}:${date.dateKey}`; }

export function monthDates(monthKey: string, sundays: boolean, rehearsals: boolean, rehearsalDay: string, existingDates: Set<string>, now = new Date()): PlannedDate[] {
  const [year, month] = monthKey.split('-').map(Number);
  const dates = (weekday: number, kind: PlannedDate['kind']) => datesInMonthOnWeekday(year, month - 1, weekday, now)
    .map((date) => ({ date, dateKey: toDateKey(date), kind, alreadyPlanned: existingDates.has(toDateKey(date)) }));
  return [...(sundays ? dates(0, 'service') : []), ...(rehearsals ? dates(Number(rehearsalDay), 'rehearsal') : [])]
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
