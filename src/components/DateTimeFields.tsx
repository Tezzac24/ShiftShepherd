/**
 * Zero-dependency date & time pickers built on SelectField-style modals.
 * A scrolling list of upcoming days / times keeps the interaction obvious
 * for less technical users and works identically on iOS, Android, and web.
 */
import React from 'react';

import { formatUpcoming, parseDateKey, toDateKey } from '../utils/dates';
import { SelectField, SelectOption } from './SelectField';

interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD or null */
  value: string | null;
  onChange: (dateKey: string) => void;
  daysAhead?: number;
}

export function DateField({ label, value, onChange, daysAhead = 90 }: DateFieldProps) {
  const options: SelectOption[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  // If editing an entry whose date is in the past, keep it choosable.
  if (value) {
    const existing = parseDateKey(value);
    if (existing < start) {
      options.push({ value, label: formatUpcoming(existing) });
    }
  }

  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    options.push({ value: toDateKey(d), label: formatUpcoming(d) });
  }

  return (
    <SelectField
      label={label}
      placeholder="Choose a date…"
      value={value}
      options={options}
      onChange={onChange}
    />
  );
}

interface TimeFieldProps {
  label: string;
  /** "HH:MM" or null */
  value: string | null;
  onChange: (time: string | null) => void;
  /** Adds a "No set time" choice. */
  optional?: boolean;
}

const NO_TIME = '__none__';

export function TimeField({ label, value, onChange, optional }: TimeFieldProps) {
  const options: SelectOption[] = [];
  if (optional) options.push({ value: NO_TIME, label: 'No set time' });
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      const hh = `${h}`.padStart(2, '0');
      const mm = `${m}`.padStart(2, '0');
      const d = new Date();
      d.setHours(h, m, 0, 0);
      options.push({
        value: `${hh}:${mm}`,
        label: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      });
    }
  }

  return (
    <SelectField
      label={label}
      placeholder="Choose a time…"
      value={value ?? (optional ? null : value)}
      options={options}
      onChange={(v) => onChange(v === NO_TIME ? null : v)}
    />
  );
}
