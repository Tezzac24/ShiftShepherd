import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { AnnouncementCard } from '../../components/AnnouncementCard';
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

      {announcements.length > 0 ? (
        announcements.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            authorName={userName(data.users, a.created_by)}
            teamName={a.team_id ? data.teams.find((t) => t.id === a.team_id)?.name : undefined}
            onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: a.id } })}
          />
        ))
      ) : (
        <EmptyState
          icon="megaphone-outline"
          title="No announcements yet"
          message="There are no announcements yet. Important updates will appear here."
        />
      )}
    </Screen>
  );
}
