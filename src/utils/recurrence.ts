import { Event, EventOccurrence } from '../types';
import { parseDateKey, toDateKey } from './dates';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MONTHS = 3;
const DEFAULT_LIMIT = 60;

export interface RecurrenceOption<T extends string = string> {
  label: string;
  value: T;
  description: string;
}

export type RepeatType = 'weekly' | 'biweekly' | 'monthly' | 'monthly_weekday';
export type RecurrenceOrdinal = '1' | '2' | '3' | '4' | '-1';
export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface RecurrenceFormValue {
  repeatType: RepeatType;
  ordinal: RecurrenceOrdinal;
  weekday: WeekdayCode;
}

export const REPEAT_TYPE_OPTIONS: RecurrenceOption<RepeatType>[] = [
  {
    label: 'Weekly',
    value: 'weekly',
    description: 'Every week on the event day.',
  },
  {
    label: 'Every 2 weeks',
    value: 'biweekly',
    description: 'Every second week on the event day.',
  },
  {
    label: 'Monthly',
    value: 'monthly',
    description: 'Every month on this date.',
  },
  {
    label: 'Monthly on a weekday pattern',
    value: 'monthly_weekday',
    description: 'For example, first Friday or last Monday.',
  },
];

export const ORDINAL_OPTIONS: RecurrenceOption<RecurrenceOrdinal>[] = [
  { label: 'First', value: '1', description: 'The first matching weekday in the month.' },
  { label: 'Second', value: '2', description: 'The second matching weekday in the month.' },
  { label: 'Third', value: '3', description: 'The third matching weekday in the month.' },
  { label: 'Fourth', value: '4', description: 'The fourth matching weekday in the month.' },
  { label: 'Last', value: '-1', description: 'The last matching weekday in the month.' },
];

export const WEEKDAY_OPTIONS: RecurrenceOption<WeekdayCode>[] = [
  { label: 'Monday', value: 'MO', description: 'Monday' },
  { label: 'Tuesday', value: 'TU', description: 'Tuesday' },
  { label: 'Wednesday', value: 'WE', description: 'Wednesday' },
  { label: 'Thursday', value: 'TH', description: 'Thursday' },
  { label: 'Friday', value: 'FR', description: 'Friday' },
  { label: 'Saturday', value: 'SA', description: 'Saturday' },
  { label: 'Sunday', value: 'SU', description: 'Sunday' },
];

export interface ParsedRule {
  freq: 'WEEKLY' | 'MONTHLY';
  interval: number;
  byday?: {
    ordinal: number;
    weekday: number;
    code: WeekdayCode;
  };
}

const weekdays: Record<WeekdayCode, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const weekdayCodesByIndex: Record<number, WeekdayCode> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
};

const ordinalLabels: Record<RecurrenceOrdinal, string> = {
  '1': 'First',
  '2': 'Second',
  '3': 'Third',
  '4': 'Fourth',
  '-1': 'Last',
};

function ordinalValue(value: number): RecurrenceOrdinal {
  if (value === 2) return '2';
  if (value === 3) return '3';
  if (value === 4) return '4';
  if (value === -1) return '-1';
  return '1';
}

function ordinalForDate(date: Date): RecurrenceOrdinal {
  const occurrenceInMonth = Math.floor((date.getDate() - 1) / 7) + 1;
  if (occurrenceInMonth === 2) return '2';
  if (occurrenceInMonth === 3) return '3';
  if (occurrenceInMonth === 4) return '4';
  if (occurrenceInMonth > 4) return '-1';
  return '1';
}

function weekdayName(code: WeekdayCode): string {
  return WEEKDAY_OPTIONS.find((option) => option.value === code)?.label ?? 'weekday';
}

export function weekdayCodeForDate(date: Date): WeekdayCode {
  return weekdayCodesByIndex[date.getDay()];
}

export function recurrenceWeekdayPatternForDate(
  date: Date,
): Pick<RecurrenceFormValue, 'ordinal' | 'weekday'> {
  return {
    ordinal: ordinalForDate(date),
    weekday: weekdayCodeForDate(date),
  };
}

export function recurrenceRuleFromForm(value: RecurrenceFormValue): string {
  if (value.repeatType === 'weekly') return 'FREQ=WEEKLY;INTERVAL=1';
  if (value.repeatType === 'biweekly') return 'FREQ=WEEKLY;INTERVAL=2';
  if (value.repeatType === 'monthly') return 'FREQ=MONTHLY;INTERVAL=1';
  return `FREQ=MONTHLY;BYDAY=${value.ordinal}${value.weekday}`;
}

export function recurrenceFormValueFromRule(
  rule: string | null,
  startDate = new Date(),
): RecurrenceFormValue {
  const fallbackPattern = recurrenceWeekdayPatternForDate(startDate);
  const parsed = parseRule(rule);

  if (!parsed) {
    return { repeatType: 'weekly', ...fallbackPattern };
  }

  if (parsed.freq === 'WEEKLY') {
    return {
      repeatType: parsed.interval === 2 ? 'biweekly' : 'weekly',
      ...fallbackPattern,
    };
  }

  if (parsed.byday) {
    return {
      repeatType: 'monthly_weekday',
      ordinal: ordinalValue(parsed.byday.ordinal),
      weekday: parsed.byday.code,
    };
  }

  return { repeatType: 'monthly', ...fallbackPattern };
}

export function recurrenceLabelForRule(rule: string | null, startDate = new Date()): string | null {
  const parsed = parseRule(rule);
  if (!parsed) return null;

  const eventWeekday = weekdayName(weekdayCodeForDate(startDate));

  if (parsed.freq === 'WEEKLY') {
    if (parsed.interval === 1) return `Every ${eventWeekday}`;
    if (parsed.interval === 2) return `Every second ${eventWeekday}`;
    return `Every ${parsed.interval} weeks`;
  }

  if (parsed.byday) {
    const ordinal = ordinalLabels[ordinalValue(parsed.byday.ordinal)];
    return `${ordinal} ${weekdayName(parsed.byday.code)} of each month`;
  }

  return 'Monthly';
}

export function recurrenceLabelForEvent(event: Event): string | null {
  if (!event.is_recurring) return null;
  return (
    recurrenceLabelForRule(event.recurrence_rule, new Date(event.start_time)) ??
    event.recurrence_label
  );
}

export function parseRule(rule: string | null): ParsedRule | null {
  if (!rule) return null;

  const parts = Object.fromEntries(
    rule.split(';').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    }),
  );

  const freq = parts.FREQ;
  if (freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;

  const interval = Math.max(1, Number(parts.INTERVAL ?? '1') || 1);
  const parsed: ParsedRule = { freq, interval };

  if (parts.BYDAY) {
    const match = parts.BYDAY.match(/^(-?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!match) return null;
    const code = match[2] as WeekdayCode;
    parsed.byday = {
      ordinal: match[1] ? Number(match[1]) : 1,
      weekday: weekdays[code],
      code,
    };
  }

  return parsed;
}

function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(
    year,
    month,
    Math.min(date.getDate(), lastDay),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  ordinal: number,
  timeSource: Date,
): Date | null {
  if (ordinal < 0) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    return new Date(
      year,
      month,
      last.getDate() - diff,
      timeSource.getHours(),
      timeSource.getMinutes(),
      timeSource.getSeconds(),
      timeSource.getMilliseconds(),
    );
  }

  const first = new Date(year, month, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  const day = 1 + diff + (ordinal - 1) * 7;
  const candidate = new Date(
    year,
    month,
    day,
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds(),
  );

  return candidate.getMonth() === month ? candidate : null;
}

function eventToOccurrence(event: Event, start: Date): EventOccurrence {
  const baseStart = new Date(event.start_time);
  const baseEnd = new Date(event.end_time);
  const duration = Math.max(0, baseEnd.getTime() - baseStart.getTime());
  const end = new Date(start.getTime() + duration);

  return {
    ...event,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    base_event_id: event.id,
    occurrence_id: `${event.id}:${start.toISOString()}`,
  };
}

function includeOccurrence(
  event: Event,
  start: Date,
  from: Date,
  until: Date,
  output: EventOccurrence[],
) {
  const occurrence = eventToOccurrence(event, start);
  if (new Date(occurrence.end_time) >= from && start <= until) {
    output.push(occurrence);
  }
}

export function expandEventOccurrences(
  events: Event[],
  options: { from?: Date; windowMonths?: number; limit?: number } = {},
): EventOccurrence[] {
  const from = options.from ?? new Date();
  const until = new Date(from);
  until.setMonth(until.getMonth() + (options.windowMonths ?? DEFAULT_WINDOW_MONTHS));
  const limit = options.limit ?? DEFAULT_LIMIT;
  const output: EventOccurrence[] = [];

  for (const event of events) {
    const baseStart = new Date(event.start_time);
    const baseEnd = new Date(event.end_time);

    if (!event.is_recurring) {
      if (baseEnd >= from && baseStart <= until) {
        output.push(eventToOccurrence(event, baseStart));
      }
      continue;
    }

    const parsed = parseRule(event.recurrence_rule);
    if (!parsed) {
      if (baseEnd >= from && baseStart <= until) {
        output.push(eventToOccurrence(event, baseStart));
      }
      continue;
    }

    let seriesUntil = until;
    if (event.recurrence_end_date) {
      const endDate = parseDateKey(event.recurrence_end_date);
      endDate.setHours(23, 59, 59, 999);
      if (endDate < seriesUntil) seriesUntil = endDate;
    }

    if (parsed.freq === 'WEEKLY') {
      const intervalDays = parsed.interval * 7;
      let current = new Date(baseStart);

      if (current < from) {
        const skips = Math.max(
          0,
          Math.floor((from.getTime() - current.getTime()) / (intervalDays * DAY_MS)),
        );
        current.setDate(current.getDate() + skips * intervalDays);
      }

      while (new Date(current.getTime() + (baseEnd.getTime() - baseStart.getTime())) < from) {
        current.setDate(current.getDate() + intervalDays);
      }

      while (current <= seriesUntil && output.length < limit) {
        includeOccurrence(event, current, from, seriesUntil, output);
        current = new Date(current);
        current.setDate(current.getDate() + intervalDays);
      }
    }

    if (parsed.freq === 'MONTHLY') {
      const monthDiff =
        (from.getFullYear() - baseStart.getFullYear()) * 12 +
        (from.getMonth() - baseStart.getMonth());
      let offset = Math.max(0, Math.floor(monthDiff / parsed.interval) * parsed.interval);

      while (output.length < limit) {
        const monthAnchor = addMonthsClamped(baseStart, offset);
        const current = parsed.byday
          ? nthWeekdayOfMonth(
              monthAnchor.getFullYear(),
              monthAnchor.getMonth(),
              parsed.byday.weekday,
              parsed.byday.ordinal,
              baseStart,
            )
          : monthAnchor;

        if (!current || current > seriesUntil) break;

        if (current >= baseStart) {
          includeOccurrence(event, current, from, seriesUntil, output);
        }

        offset += parsed.interval;
      }
    }
  }

  return output
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .slice(0, limit);
}

export function nextOccurrenceForEvent(event: Event, from = new Date()): EventOccurrence | null {
  return expandEventOccurrences([event], { from, limit: 1 })[0] ?? null;
}

export function occurrenceDateKey(event: EventOccurrence): string {
  return toDateKey(new Date(event.start_time));
}
