import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { NotificationPreferences } from '../../types';

type PrefKey = keyof Omit<NotificationPreferences, 'id' | 'user_id'>;

const settings: { key: PrefKey; title: string; description: string }[] = [
  {
    key: 'announcement_notifications',
    title: 'Church announcements',
    description: 'Important updates for the whole church',
  },
  {
    key: 'team_announcement_notifications',
    title: 'Team announcements',
    description: 'Updates from the teams you belong to',
  },
  {
    key: 'chat_notifications',
    title: 'Chat messages',
    description: 'New messages in your team chats',
  },
  {
    key: 'rota_notifications',
    title: 'Rota updates',
    description: 'When you are added to a rota or a rota changes',
  },
  {
    key: 'event_reminders',
    title: 'Event reminders',
    description: 'Reminders before church events',
  },
  {
    key: 'availability_reminders',
    title: 'Availability reminders',
    description: 'Gentle nudges to confirm if you can make it',
  },
];

export default function NotificationSettingsScreen() {
  const user = useRequiredUser();
  const data = useAppData();

  const prefs = data.getNotificationPreferences(user.profile.id);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <AppText tone="secondary">
        Choose what you would like to be notified about. You can change these at any time.
      </AppText>

      <Card style={styles.card}>
        {settings.map((s) => (
          <View key={s.key} style={styles.row}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">{s.title}</AppText>
              <AppText variant="small" tone="secondary">
                {s.description}
              </AppText>
            </View>
            <Switch
              value={prefs[s.key]}
              onValueChange={(v) =>
                data.updateNotificationPreferences(user.profile.id, { [s.key]: v })
              }
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
              accessibilityLabel={s.title}
            />
          </View>
        ))}
      </Card>

      <AppText variant="small" tone="muted" style={styles.note}>
        This demo simulates notifications with in-app badges. Real push notifications will arrive
        when the app is connected to Expo Notifications.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  note: { textAlign: 'center' },
});
