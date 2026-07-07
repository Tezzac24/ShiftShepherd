import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { DateField, TimeField } from '../../components/DateTimeFields';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageEvents } from '../../lib/permissions';
import { iso, parseDateKey, toDateKey } from '../../utils/dates';

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
  const [error, setError] = useState<string | null>(null);

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

  const handleSave = () => {
    if (!title.trim() || !categoryId || !dateKey || !startTime || !endTime || !location.trim()) {
      setError('Please fill in the title, category, date, times, and location.');
      return;
    }
    const record = {
      title: title.trim(),
      description: description.trim(),
      category_id: categoryId,
      start_time: buildTime(dateKey, startTime),
      end_time: buildTime(dateKey, endTime),
      location: location.trim(),
      team_id: teamId === 'none' ? null : teamId,
      created_by: existing?.created_by ?? user.profile.id,
    };
    if (existing) {
      data.updateEvent(existing.id, record);
    } else {
      data.addEvent(record);
    }
    router.back();
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editing ? 'Edit Event' : 'New Event' }} />
      <TextField label="Event title" placeholder="e.g. Sunday Morning Service" value={title} onChangeText={setTitle} />
      <SelectField
        label="Category"
        value={categoryId}
        options={data.categories.map((c) => ({ label: c.name, value: c.id }))}
        onChange={setCategoryId}
      />
      <DateField label="Date" value={dateKey} onChange={setDateKey} />
      <TimeField label="Start time" value={startTime} onChange={(t) => setStartTime(t)} />
      <TimeField label="End time" value={endTime} onChange={(t) => setEndTime(t)} />
      <TextField label="Location" placeholder="e.g. Main Hall" value={location} onChangeText={setLocation} />
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
        <Button title={editing ? 'Save Changes' : 'Create Event'} icon="checkmark-outline" onPress={handleSave} />
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
