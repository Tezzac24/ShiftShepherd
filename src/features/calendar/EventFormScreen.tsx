import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DateField, TimeField } from '../../components/DateTimeFields';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageEvents } from '../../lib/permissions';
import { iso, parseDateKey, toDateKey } from '../../utils/dates';
import {
  ORDINAL_OPTIONS,
  REPEAT_TYPE_OPTIONS,
  WEEKDAY_OPTIONS,
  recurrenceFormValueFromRule,
  recurrenceLabelForRule,
  recurrenceRuleFromForm,
  recurrenceWeekdayPatternForDate,
} from '../../utils/recurrence';
import type {
  RecurrenceFormValue,
  RecurrenceOrdinal,
  RepeatType,
  WeekdayCode,
} from '../../utils/recurrence';

/** Create/edit event — only for Church Admins and Event Managers. */
export default function EventFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const user = useRequiredUser();
  const data = useAppData();

  const existing = id ? data.events.find((e) => e.id === id) : undefined;
  const editing = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [dateKey, setDateKey] = useState<string | null>(
    existing ? toDateKey(new Date(existing.start_time)) : null,
  );
  const [startTime, setStartTime] = useState<string | null>(
    existing
      ? `${`${new Date(existing.start_time).getHours()}`.padStart(2, '0')}:${`${new Date(existing.start_time).getMinutes()}`.padStart(2, '0')}`
      : null,
  );
  const [endTime, setEndTime] = useState<string | null>(
    existing
      ? `${`${new Date(existing.end_time).getHours()}`.padStart(2, '0')}:${`${new Date(existing.end_time).getMinutes()}`.padStart(2, '0')}`
      : null,
  );
  const [location, setLocation] = useState(existing?.location ?? '');
  const [teamId, setTeamId] = useState<string | null>(existing?.team_id ?? null);
  const [repeats, setRepeats] = useState(existing?.is_recurring ?? false);
  const [recurrence, setRecurrence] = useState<RecurrenceFormValue>(
    recurrenceFormValueFromRule(
      existing?.recurrence_rule ?? null,
      existing ? new Date(existing.start_time) : new Date(),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recurrencePreviewLabel = repeats
    ? recurrenceLabelForRule(
        recurrenceRuleFromForm(recurrence),
        dateKey ? parseDateKey(dateKey) : new Date(),
      )
    : null;

  if (!canManageEvents(user)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Events' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="You do not have permission to do that."
        />
      </Screen>
    );
  }

  const buildTime = (key: string, time: string): string => {
    const d = parseDateKey(key);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return iso(d);
  };

  const updateRepeatType = (repeatType: RepeatType) => {
    setRecurrence((current) => ({
      ...current,
      repeatType,
      ...(repeatType === 'monthly_weekday' && dateKey
        ? recurrenceWeekdayPatternForDate(parseDateKey(dateKey))
        : {}),
    }));
  };

  const handleSave = async () => {
    if (saving) return; // no duplicate submissions
    if (!title.trim() || !categoryId || !dateKey || !startTime || !endTime || !location.trim()) {
      setError('Please fill in the title, category, date, times, and location.');
      return;
    }
    const startTimeIso = buildTime(dateKey, startTime);
    const endTimeIso = buildTime(dateKey, endTime);
    const recurrenceRule = repeats ? recurrenceRuleFromForm(recurrence) : null;
    const record = {
      title: title.trim(),
      description: description.trim(),
      category_id: categoryId,
      start_time: startTimeIso,
      end_time: endTimeIso,
      location: location.trim(),
      team_id: teamId === 'none' ? null : teamId,
      is_recurring: repeats,
      recurrence_rule: repeats ? recurrenceRule : null,
      recurrence_label: repeats
        ? (recurrenceLabelForRule(recurrenceRule, new Date(startTimeIso)) ?? null)
        : null,
      recurrence_end_date: repeats ? (existing?.recurrence_end_date ?? null) : null,
      created_by: existing?.created_by ?? user.profile.id,
    };
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await data.updateEvent(existing.id, record);
      } else {
        await data.addEvent(record);
      }
      router.back();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Your changes could not be saved. Please try again.',
      );
      setSaving(false);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editing ? 'Edit Event' : 'New Event' }} />
      <TextField
        label="Event title"
        placeholder="e.g. Sunday Morning Service"
        value={title}
        onChangeText={setTitle}
      />
      <SelectField
        label="Category"
        value={categoryId}
        options={data.categories.map((c) => ({ label: c.name, value: c.id }))}
        onChange={setCategoryId}
      />
      <DateField label="Date" value={dateKey} onChange={setDateKey} />
      <TimeField label="Start time" value={startTime} onChange={(t) => setStartTime(t)} />
      <TimeField label="End time" value={endTime} onChange={(t) => setEndTime(t)} />
      <Card style={styles.repeatsCard}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Repeats</AppText>
            <AppText variant="small" tone="secondary">
              Turn this on for regular weekly or monthly events.
            </AppText>
          </View>
          <Switch
            value={repeats}
            onValueChange={setRepeats}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Repeats"
          />
        </View>
        {repeats ? (
          <>
            <SelectField
              label="Repeat type"
              value={recurrence.repeatType}
              options={REPEAT_TYPE_OPTIONS}
              onChange={updateRepeatType}
            />
            {recurrence.repeatType === 'monthly_weekday' ? (
              <View style={styles.patternFields}>
                <SelectField
                  label="Week in the month"
                  value={recurrence.ordinal}
                  options={ORDINAL_OPTIONS}
                  onChange={(ordinal: RecurrenceOrdinal) =>
                    setRecurrence((current) => ({ ...current, ordinal }))
                  }
                />
                <SelectField
                  label="Day of the week"
                  value={recurrence.weekday}
                  options={WEEKDAY_OPTIONS}
                  onChange={(weekday: WeekdayCode) =>
                    setRecurrence((current) => ({ ...current, weekday }))
                  }
                />
              </View>
            ) : null}
            {recurrencePreviewLabel ? (
              <AppText variant="small" tone="secondary">
                Pattern: {recurrencePreviewLabel}
              </AppText>
            ) : null}
            <AppText variant="small" tone="muted">
              The calendar shows the next few months of this series. Editing this event updates the
              recurring event series in this demo.
            </AppText>
          </>
        ) : (
          <AppText variant="small" tone="secondary">
            This event happens once.
          </AppText>
        )}
      </Card>
      <TextField
        label="Location"
        placeholder="e.g. Main Hall"
        value={location}
        onChangeText={setLocation}
      />
      <TextField
        label="Description"
        placeholder="What should people know about this event?"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <SelectField
        label="Related team (optional)"
        placeholder="No related team"
        value={teamId ?? 'none'}
        options={[
          { label: 'No related team', value: 'none' },
          ...data.teams.map((t) => ({ label: t.name, value: t.id })),
        ]}
        onChange={(v) => setTeamId(v === 'none' ? null : v)}
      />

      {error ? (
        <AppText tone="danger" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={editing ? 'Save Changes' : 'Create Event'}
          icon="checkmark-outline"
          loading={saving}
          onPress={() => void handleSave()}
        />
        <Button
          title="Cancel"
          variant="secondary"
          disabled={saving}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  repeatsCard: { gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  patternFields: { gap: spacing.md },
  error: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
