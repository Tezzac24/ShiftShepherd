import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AnnouncementCard } from '../../components/AnnouncementCard';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName, visibleAnnouncements } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canCreateAnyAnnouncement } from '../../lib/permissions';

export default function AnnouncementsListScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const data = useAppData();

  const announcements = visibleAnnouncements(user, data.announcements);
  // Live mode only: a first load shows a spinner instead of pretending the
  // list is empty; a failed load offers a retry instead of stale content.
  const loadingFirstTime = data.announcementsLoading && announcements.length === 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Announcements' }} />

      {canCreateAnyAnnouncement(user) ? (
        <Button
          title="New Announcement"
          icon="add-circle-outline"
          onPress={() => router.push('/announcements/edit')}
        />
      ) : null}

      {data.announcementsError ? (
        <View style={styles.errorBox}>
          <AppText tone="danger" style={styles.errorText}>
            {data.announcementsError}
          </AppText>
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshAnnouncements()}
          />
        </View>
      ) : null}

      {loadingFirstTime ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading announcements…</AppText>
        </View>
      ) : announcements.length > 0 ? (
        announcements.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            authorName={userName(data.users, a.created_by)}
            teamName={a.team_id ? data.teams.find((t) => t.id === a.team_id)?.name : undefined}
            onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: a.id } })}
          />
        ))
      ) : data.announcementsError ? null : (
        <EmptyState
          icon="megaphone-outline"
          title="No announcements yet"
          message="There are no announcements yet. Important updates will appear here."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  errorBox: { gap: spacing.sm },
  errorText: { textAlign: 'center' },
});
