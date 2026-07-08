/**
 * Zero-dependency date & time pickers.
 *
 * DateField expands into a simple calendar so month/year context is visible.
 * TimeField stays as a full-screen list of readable 15-minute choices, which
 * is reliable on iOS, Android, and web without native picker differences.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../constants/theme';
import { formatUpcoming, parseDateKey, toDateKey } from '../utils/dates';
import { AppText } from './AppText';
import { SelectField, SelectOption } from './SelectField';

interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD or null */
  value: string | null;
  onChange: (dateKey: string) => void;
  daysAhead?: number;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthDays(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);

  for (let day = 1; day <= daysInMonth; day++) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }

  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export function DateField({ label, value, onChange, daysAhead = 365 }: DateFieldProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const selectedDate = value ? parseDateKey(value) : null;
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => selectedDate ?? today);

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    return d;
  }, [daysAhead, today]);

  const monthDays = buildMonthDays(visibleMonth);
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const selectedLabel = selectedDate ? formatUpcoming(selectedDate) : 'Choose a date';
  const minMonth = startOfMonth(selectedDate && selectedDate < today ? selectedDate : today);
  const maxMonth = startOfMonth(maxDate);
  const canGoPrev = startOfMonth(visibleMonth) > minMonth;
  const canGoNext = startOfMonth(visibleMonth) < maxMonth;

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const isSelectable = (date: Date): boolean => {
    const key = toDateKey(date);
    if (key === value) return true;
    return date >= today && date <= maxDate;
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel}`}
        accessibilityHint="Opens a calendar date picker"
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <View style={styles.fieldValue}>
          <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          <AppText tone={selectedDate ? 'default' : 'muted'}>{selectedLabel}</AppText>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.textMuted}
        />
      </Pressable>

      {open ? (
        <View style={styles.calendarPanel}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              disabled={!canGoPrev}
              onPress={() => moveMonth(-1)}
              style={({ pressed }) => [
                styles.monthButton,
                !canGoPrev && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={canGoPrev ? colors.primary : colors.textMuted}
              />
              <AppText variant="label" tone={canGoPrev ? 'primary' : 'muted'}>
                Previous
              </AppText>
            </Pressable>

            <AppText variant="subheading" style={styles.monthTitle}>
              {monthLabel}
            </AppText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              disabled={!canGoNext}
              onPress={() => moveMonth(1)}
              style={({ pressed }) => [
                styles.monthButton,
                !canGoNext && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="label" tone={canGoNext ? 'primary' : 'muted'}>
                Next
              </AppText>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={canGoNext ? colors.primary : colors.textMuted}
              />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((day) => (
              <AppText key={day} variant="label" tone="muted" style={styles.weekdayLabel}>
                {day}
              </AppText>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {monthDays.map((date, index) => {
              if (!date) return <View key={`empty-${index}`} style={styles.dayCell} />;

              const key = toDateKey(date);
              const selected = selectedDate ? sameDate(date, selectedDate) : false;
              const todayCell = sameDate(date, today);
              const selectable = isSelectable(date);

              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={date.toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  accessibilityState={{ selected, disabled: !selectable }}
                  disabled={!selectable}
                  onPress={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.dayCell,
                    todayCell && styles.todayCell,
                    selected && styles.selectedDay,
                    !selectable && styles.disabledDay,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText
                    variant={selected ? 'bodyBold' : 'body'}
                    tone={selected ? 'inverse' : selectable ? 'default' : 'muted'}
                  >
                    {date.getDate()}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function DateListField({ label, value, onChange, daysAhead = 90 }: DateFieldProps) {
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

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  field: {
    minHeight: touchTarget,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  calendarPanel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthTitle: { flex: 1, textAlign: 'center' },
  monthButton: {
    minHeight: touchTarget,
    minWidth: 92,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { width: '14.285%', textAlign: 'center' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.285%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  selectedDay: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  disabledDay: { opacity: 0.35 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
