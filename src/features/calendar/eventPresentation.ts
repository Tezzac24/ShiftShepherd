import { Event, Team } from '../../types';
import { iso, parseDateKey, toDateKey } from '../../utils/dates';
import { nextOccurrenceForEvent, RecurrenceFormValue, recurrenceFormValueFromRule } from '../../utils/recurrence';

/** The route identifies a day; current series data owns its displayed time. */
export function eventDetailTimes(event: Event, occurrenceStart?: string) {
  let start = new Date(event.start_time);
  let end = new Date(event.end_time);
  if (event.is_recurring) {
    const fromDay = occurrenceStart ? new Date(occurrenceStart) : new Date();
    if (!Number.isNaN(fromDay.getTime())) {
      fromDay.setHours(0, 0, 0, 0);
      const occurrence = nextOccurrenceForEvent(event, fromDay);
      if (occurrence) { start = new Date(occurrence.start_time); end = new Date(occurrence.end_time); }
    }
  }
  return { start, end };
}

export interface EventDraft {
  title: string; description: string; categoryId: string | null; dateKey: string | null;
  startTime: string | null; endTime: string | null; location: string; teamId: string | null;
  repeats: boolean; recurrence: RecurrenceFormValue;
}
export type EventField = 'title' | 'categoryId' | 'dateKey' | 'startTime' | 'endTime' | 'location' | 'teamId';
export type EventErrors = Partial<Record<EventField, string>>;

const clock = (value: string) => {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
export function eventDraft(event?: Event): EventDraft {
  return { title: event?.title ?? '', description: event?.description ?? '', categoryId: event?.category_id ?? null,
    dateKey: event ? toDateKey(new Date(event.start_time)) : null, startTime: event ? clock(event.start_time) : null,
    endTime: event ? clock(event.end_time) : null, location: event?.location ?? '', teamId: event?.team_id ?? null,
    repeats: event?.is_recurring ?? false,
    recurrence: recurrenceFormValueFromRule(event?.recurrence_rule ?? null, event ? new Date(event.start_time) : new Date()) };
}
export function buildEventTime(dateKey: string, time: string) {
  const date = parseDateKey(dateKey);
  const [hour, minute] = time.split(':').map(Number);
  date.setHours(hour, minute, 0, 0);
  return iso(date);
}

/** Keep unchanged past starts editable; changed starts must still be future. */
export function eventTimeErrors(draft: EventDraft, original?: Event, now = Date.now()): EventErrors {
  if (!draft.dateKey || !draft.startTime || !draft.endTime) return {};
  const start = new Date(buildEventTime(draft.dateKey, draft.startTime)).getTime();
  const end = new Date(buildEventTime(draft.dateKey, draft.endTime)).getTime();
  if (end <= start) return { endTime: 'End time must be after start time.' };
  if ((!original || start !== new Date(original.start_time).getTime()) && start < now) {
    return { startTime: 'Choose a start time that has not already passed.' };
  }
  return {};
}

export function validateEventDraft(draft: EventDraft, original: Event | undefined, activeTeams: Team[], now = Date.now()): EventErrors {
  const errors: EventErrors = {};
  if (!draft.title.trim()) errors.title = 'Add an event title.';
  if (!draft.categoryId) errors.categoryId = 'Choose a category.';
  if (!draft.dateKey) errors.dateKey = 'Choose a date.';
  if (!draft.startTime) errors.startTime = 'Choose a start time.';
  if (!draft.endTime) errors.endTime = 'Choose an end time.';
  if (!draft.location.trim()) errors.location = 'Add a location.';
  if (draft.teamId && draft.teamId !== original?.team_id && !activeTeams.some((team) => team.id === draft.teamId)) {
    errors.teamId = 'Choose an active related team or no related team.';
  }
  return { ...errors, ...eventTimeErrors(draft, original, now) };
}
