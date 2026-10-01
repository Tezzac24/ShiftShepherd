/**
 * Zero-dependency date & time pickers.
 *
 * DateField opens a full-width calendar sheet so seven touch targets fit.
 * TimeField stays as a full-screen list of readable 15-minute choices, which
 * is reliable on iOS, Android, and web without native picker differences.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { calendarTouchTarget, colors, radius, spacing, touchTarget } from '../../constants/theme';
import { formatUpcoming, parseDateKey, toDateKey } from '../utils/dates';
import { AppText } from './AppText';
import { ModalSurface } from './ModalSurface';
import { SelectField, SelectOption } from './SelectField';

interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD or null */
  value: string | null;
  onChange: (dateKey: string) => void;
  daysAhead?: number;
  disabled?: boolean;
  error?: string;
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

export function DateField({ label, value, onChange, daysAhead = 365, disabled = false, error }: DateFieldProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const selectedDate = value ? parseDateKey(value) : null;
  const [open, setOpen] = useState(false);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const triggerRef = useRef<View>(null);
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
    if (disabled) return;
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const isSelectable = (date: Date): boolean => {
    if (disabled) return false;
    const key = toDateKey(date);
    if (key === value) return true;
    return date >= today && date <= maxDate;
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : selectedLabel}`}
        accessibilityHint={error ?? 'Opens a calendar date picker'}
        accessibilityState={{ expanded: open && !disabled, disabled }}
        aria-expanded={open && !disabled}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={disabled ? undefined : () => setOpen((current) => !current)}
        style={({ pressed }) => [styles.field, disabled && styles.disabled, error ? { borderColor: colors.danger } : null, pressed && styles.pressed]}
      >
        <View style={styles.fieldValue}>
          <Ionicons name="calendar-outline" size={22} color={colors.primary} accessible={false} />
          <AppText tone={selectedDate ? 'default' : 'muted'} style={styles.valueText}>{selectedLabel}</AppText>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.textMuted}
          accessible={false}
        />
      </Pressable>
      {error ? <AppText variant="small" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</AppText> : null}

      <ModalSurface visible={open && !disabled} title={label} onClose={() => setOpen(false)} returnFocusRef={triggerRef}>
        <View style={styles.calendarPanel}>
          <AppText variant="subheading" headingLevel={2} style={styles.monthTitle} accessibilityLiveRegion="polite">
            {monthLabel}
          </AppText>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              accessibilityState={{ disabled: !canGoPrev }}
              aria-disabled={!canGoPrev}
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
                accessible={false}
              />
              <AppText variant="label" tone={canGoPrev ? 'primary' : 'muted'} style={styles.monthButtonLabel}>
                Previous
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              accessibilityState={{ disabled: !canGoNext }}
              aria-disabled={!canGoNext}
              disabled={!canGoNext}
              onPress={() => moveMonth(1)}
              style={({ pressed }) => [
                styles.monthButton,
                !canGoNext && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="label" tone={canGoNext ? 'primary' : 'muted'} style={styles.monthButtonLabel}>
                Next
              </AppText>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={canGoNext ? colors.primary : colors.textMuted}
                accessible={false}
              />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((day) => (
              <AppText key={day} variant="small" tone="secondary" style={styles.weekdayLabel}>
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
                  aria-pressed={selected}
                  aria-disabled={!selectable}
                  disabled={!selectable}
                  onPress={() => {
                    if (disabled) return;
                    onChange(key);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.dayCell,
                    todayCell && styles.todayCell,
                    selected && styles.selectedDay,
                    pressed && (selected ? styles.selectedDayPressed : styles.pressed),
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
      </ModalSurface>
    </View>
  );
}

export function DateListField({ label, value, onChange, daysAhead = 90, disabled, error }: DateFieldProps) {
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
      disabled={disabled}
      error={error}
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
  disabled?: boolean;
  error?: string;
}

const NO_TIME = '__none__';

export function TimeField({ label, value, onChange, optional, disabled, error }: TimeFieldProps) {
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

  // A saved value may predate the chooser's quarter-hour range. Keep that
  // exact valid time visible and selectable; do not silently round it.
  if (value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && !options.some((option) => option.value === value)) {
    const [hour, minute] = value.split(':').map(Number);
    const retained = new Date();
    retained.setHours(hour, minute, 0, 0);
    const laterTimeIndex = options.findIndex((option) => option.value !== NO_TIME && option.value > value);
    options.splice(laterTimeIndex < 0 ? options.length : laterTimeIndex, 0, {
      value, label: retained.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    });
  }

  return (
    <SelectField
      label={label}
      placeholder="Choose a time…"
      value={value ?? (optional ? NO_TIME : null)}
      options={options}
      onChange={(v) => onChange(v === NO_TIME ? null : v)}
      disabled={disabled}
      error={error}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: {
    minHeight: touchTarget,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  valueText: { flex: 1 },
  calendarPanel: {
    marginHorizontal: -spacing.gutter,
    gap: spacing.md,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
  },
  monthTitle: { textAlign: 'center', paddingHorizontal: spacing.gutter },
  monthButtonLabel: { flexShrink: 1, textAlign: 'center' },
  monthButton: {
    minHeight: touchTarget,
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
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
    minHeight: calendarTouchTarget,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  selectedDay: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  disabled: { backgroundColor: colors.surfaceRaised },
  selectedDayPressed: { backgroundColor: colors.primaryDark },
  pressed: { backgroundColor: colors.surfaceRaised },
});
