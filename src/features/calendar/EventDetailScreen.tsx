import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { categoryColors, colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageEvents } from '../../lib/permissions';
import { formatFullDate, formatTime } from '../../utils/dates';
import { recurrenceLabelForEvent } from '../../utils/recurrence';

export default function EventDetailScreen() {
  const router = useRouter();
  const { id, occurrenceStart } = useLocalSearchParams<{ id: string; occurrenceStart?: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const event = data.events.find((e) => e.id === id);

  if (!event) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Event' }} />
        {data.eventsLoading ? (
          // Live mode: the events list may still be on its way from the server.
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <AppText tone="secondary">Loading event…</AppText>
          </View>
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="Event not found"
            message="This event may have been removed."
          />
        )}
      </Screen>
    );
  }

  const category = data.categories.find((c) => c.id === event.category_id);
  const cat = category ? categoryColors[category.name] : undefined;
  const team = event.team_id ? data.teams.find((t) => t.id === event.team_id) : undefined;
  const start = occurrenceStart ? new Date(occurrenceStart) : new Date(event.start_time);
  const baseStart = new Date(event.start_time);
  const baseEnd = new Date(event.end_time);
  const duration = Math.max(0, baseEnd.getTime() - baseStart.getTime());
  const end = occurrenceStart ? new Date(start.getTime() + duration) : baseEnd;
  const recurrenceLabel = recurrenceLabelForEvent(event);

  const handleDelete = async () => {
    if (deleting) return;
    const ok = await confirm({
      title: 'Delete event',
      message: 'Are you sure you want to delete this event?',
    });
    if (!ok) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await data.deleteEvent(event.id);
      router.back();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'This event could not be deleted. Please try again.',
      );
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Event' }} />
      <Card>
        {category ? <Badge label={category.name} bg={cat?.bg} fg={cat?.fg} /> : null}
        <AppText variant="heading">{event.title}</AppText>

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
          <AppText tone="secondary">{formatFullDate(start)}</AppText>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
          <AppText tone="secondary">
            {formatTime(start.toISOString())} - {formatTime(end.toISOString())}
          </AppText>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
          <AppText tone="secondary">{event.location}</AppText>
        </View>
        {team ? (
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={20} color={colors.textSecondary} />
            <AppText tone="secondary">Related team: {team.name}</AppText>
          </View>
        ) : null}
        {recurrenceLabel ? (
          <View style={styles.metaRow}>
            <Ionicons name="repeat-outline" size={20} color={colors.textSecondary} />
            <AppText tone="secondary">{recurrenceLabel}</AppText>
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText variant="subheading">About this event</AppText>
        <AppText tone="secondary">{event.description}</AppText>
        <AppText variant="small" tone="muted">
          Added by {userName(data.users, event.created_by)}
        </AppText>
        {event.is_recurring ? (
          <AppText variant="small" tone="muted">
            Editing or deleting this event changes the recurring event series in this demo.
          </AppText>
        ) : null}
      </Card>

      {canManageEvents(user) ? (
        <View style={styles.actions}>
          {deleteError ? (
            <AppText tone="danger" style={styles.deleteError}>
              {deleteError}
            </AppText>
          ) : null}
          <Button
            title="Edit Event"
            variant="secondary"
            icon="create-outline"
            disabled={deleting}
            onPress={() => router.push({ pathname: '/events/edit', params: { id: event.id } })}
          />
          <Button
            title="Delete Event"
            variant="destructive"
            icon="trash-outline"
            loading={deleting}
            onPress={() => void handleDelete()}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  loadingBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  deleteError: { textAlign: 'center' },
});
