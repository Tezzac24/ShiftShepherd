import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canEditAnnouncement } from '../../lib/permissions';
import { formatRelative, formatUpcoming } from '../../utils/dates';

export default function AnnouncementDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const announcement = data.announcements.find((a) => a.id === id);

  if (!announcement) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Announcement' }} />
        <EmptyState
          icon="megaphone-outline"
          title="Announcement not found"
          message="This announcement may have been removed."
        />
      </Screen>
    );
  }

  const team = announcement.team_id
    ? data.teams.find((t) => t.id === announcement.team_id)
    : undefined;
  const linkedEvent = announcement.linked_event_id
    ? data.events.find((e) => e.id === announcement.linked_event_id)
    : undefined;

  const handleDelete = async () => {
    if (deleting) return;
    const ok = await confirm({
      title: 'Delete announcement',
      message: 'Are you sure you want to delete this announcement?',
    });
    if (!ok) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await data.deleteAnnouncement(announcement.id);
      showToast('Announcement deleted.');
      router.back();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'This announcement could not be deleted. Please try again.',
      );
      setDeleting(false);
    }
  };

  return (
    <Screen contentStyle={styles.contentGrow}>
      <Stack.Screen options={{ title: 'Announcement' }} />
      <Card>
        <View style={styles.badges}>
          {announcement.pinned ? <Badge label="Pinned" tone="accent" /> : null}
          <Badge
            label={team ? `${team.name} team` : 'Church-wide'}
            tone={team ? 'primary' : 'neutral'}
          />
        </View>
        <AppText variant="heading">{announcement.title}</AppText>
        <AppText variant="small" tone="muted">
          Posted by {userName(data.users, announcement.created_by)} ·{' '}
          {formatRelative(announcement.created_at)}
        </AppText>

        {announcement.image_url ? (
          <View style={styles.imagePlaceholder} accessibilityLabel="Announcement image placeholder">
            <Ionicons name="image-outline" size={40} color={colors.textMuted} />
            <AppText variant="small" tone="muted">
              Image (placeholder)
            </AppText>
          </View>
        ) : null}

        <AppText style={styles.body}>{announcement.body}</AppText>
      </Card>

      {linkedEvent ? (
        <Card
          onPress={() =>
            router.push({ pathname: '/events/[id]', params: { id: linkedEvent.id } })
          }
          accessibilityLabel={`Linked event: ${linkedEvent.title}`}
        >
          <View style={styles.linkedRow}>
            <Ionicons name="calendar-outline" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" tone="primary">
                Linked event
              </AppText>
              <AppText variant="bodyBold">{linkedEvent.title}</AppText>
              <AppText variant="small" tone="secondary">
                {formatUpcoming(new Date(linkedEvent.start_time))}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </View>
        </Card>
      ) : null}

      {canEditAnnouncement(user, announcement) ? (
        <View style={styles.actions}>
          {deleteError ? (
            <AppText tone="danger" style={styles.deleteError}>
              {deleteError}
            </AppText>
          ) : null}
          <Button
            title="Edit Announcement"
            variant="secondary"
            icon="create-outline"
            disabled={deleting}
            onPress={() =>
              router.push({ pathname: '/announcements/edit', params: { id: announcement.id } })
            }
          />
          <Button
            title="Delete Announcement"
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
  badges: { flexDirection: 'row', gap: spacing.sm },
  body: { marginTop: spacing.xs },
  imagePlaceholder: {
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Grows so the actions can anchor to the lower part of short screens;
  // on long content they simply follow the content.
  contentGrow: { flexGrow: 1 },
  actions: { gap: spacing.sm, marginTop: 'auto', paddingTop: spacing.md },
  deleteError: { textAlign: 'center' },
});
