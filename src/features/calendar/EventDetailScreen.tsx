import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const confirm = useConfirm();

  const event = data.events.find((e) => e.id === id);

  if (!event) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Event' }} />
        <EmptyState
          icon="calendar-outline"
          title="Event not found"
          message="This event may have been removed."
        />
      </Screen>
    );
  }

  const category = data.categories.find((c) => c.id === event.category_id);
  const cat = category ? categoryColors[category.name] : undefined;
  const team = event.team_id ? data.teams.find((t) => t.id === event.team_id) : undefined;
  const start = new Date(event.start_time);

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete event',
      message: 'Are you sure you want to delete this event?',
    });
    if (ok) {
      data.deleteEvent(event.id);
      router.back();
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
            {formatTime(event.start_time)} – {formatTime(event.end_time)}
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
      </Card>

      <Card>
        <AppText variant="subheading">About this event</AppText>
        <AppText tone="secondary">{event.description}</AppText>
        <AppText variant="small" tone="muted">
          Added by {userName(data.users, event.created_by)}
        </AppText>
      </Card>

      {canManageEvents(user) ? (
        <View style={styles.actions}>
          <Button
            title="Edit Event"
            variant="secondary"
            icon="create-outline"
            onPress={() => router.push({ pathname: '/events/edit', params: { id: event.id } })}
          />
          <Button
            title="Delete Event"
            variant="destructive"
            icon="trash-outline"
            onPress={handleDelete}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
