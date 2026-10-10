import React from 'react';

import { availabilityLabels } from '../../components/Badge';
import { DateMarker } from '../../components/DateMarker';
import { ListRow } from '../../components/ListRow';
import { ServingSummary } from '../../lib/appData/presentation';
import { Event, EventCategory } from '../../types';
import { formatClockTime, formatTime, parseDateKey } from '../../utils/dates';
import { recurrenceLabelForEvent } from '../../utils/recurrence';

export function fullScheduleDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function ScheduleDateMarker({ date, label, decorative = true }: {
  date: Date; label: string; decorative?: boolean;
}) {
  return <DateMarker day={String(date.getDate())} month={date.toLocaleDateString(undefined, { month: 'short' })}
    accessibilityLabel={label} decorative={decorative} />;
}

export function ScheduleEventRow({ event, category, onPress }: {
  event: Event; category?: EventCategory; onPress: () => void;
}) {
  const date = new Date(event.start_time);
  const time = `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`;
  const recurrence = recurrenceLabelForEvent(event);
  const description = [
    `${date.toLocaleDateString(undefined, { weekday: 'short' })} · ${time}`,
    event.location,
    [category?.name, recurrence].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n');
  const label = [event.title, fullScheduleDate(date), time, event.location, category?.name, recurrence].filter(Boolean).join('. ');
  return <ListRow title={event.title} subtitle={description} onPress={onPress}
    leading={<ScheduleDateMarker date={date} label={label} />}
    accessibilityLabel={label} accessibilityHint="Opens the event details" />;
}

export function ServingRow({ serving, onPress }: { serving: ServingSummary; onPress: () => void }) {
  const date = parseDateKey(serving.entry.date);
  const time = serving.entry.time ? formatClockTime(serving.entry.time) : '';
  const response = serving.status === 'not_responded' ? 'Response needed' : `Your response: ${availabilityLabels[serving.status]}`;
  const description = [
    [date.toLocaleDateString(undefined, { weekday: 'long' }), time].filter(Boolean).join(' · '),
    serving.team.name, serving.roleSummary, response,
  ].join('\n');
  const label = [serving.entry.title, fullScheduleDate(date), time, serving.team.name, serving.roleSummary, response].filter(Boolean).join('. ');
  return <ListRow title={serving.entry.title} subtitle={description} onPress={onPress}
    leading={<ScheduleDateMarker date={date} label={label} />}
    accessibilityLabel={label} accessibilityHint="Opens your serving details and availability response" />;
}
