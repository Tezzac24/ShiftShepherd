import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { NotificationPreferences } from '../../types';
import { useDevicePushRegistration } from './useDevicePushRegistration';

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

/**
 * Notification settings. In live mode (Supabase Auth with a linked profile)
 * the toggles load from and save to the notification_preferences table —
 * each flip saves straight away, with the switch held on its new value while
 * the save is in flight and reverted (plus a friendly message) if it fails.
 * Demo mode keeps the original instant local toggles.
 *
 * Live mode also shows the "Device notifications" card (Push Token
 * Registration V1): an explicit button that asks for OS permission and
 * registers this device's Expo push token — never on mount, only on tap.
 * Nothing is delivered yet; registering needs a development build (Expo Go
 * cannot receive remote pushes since SDK 53), and unsupported device/build
 * states show calm setup copy instead. Demo mode hides the card entirely
 * and never touches push or Supabase APIs.
 */
export default function NotificationSettingsScreen() {
  const user = useRequiredUser();
  const data = useAppData();
  const showToast = useToast();

  // The toggle being saved right now (live mode only) and the value it is
  // moving to, so the switch reflects the tap immediately but reverts by
  // itself if the save fails (context state never changed).
  const [pendingKey, setPendingKey] = useState<PrefKey | null>(null);
  const [pendingValue, setPendingValue] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const prefsLive = data.notificationPrefsLive;
  const prefs = data.getNotificationPreferences(user.profile.id);
  const saving = pendingKey !== null;

  const { state: deviceState, register: registerDevice } = useDevicePushRegistration();

  const showLoading = prefsLive && data.notificationPrefsLoading;
  const showLoadError =
    prefsLive && !!data.notificationPrefsError && !data.notificationPrefsLoading;

  const handleToggle = (key: PrefKey, value: boolean) => {
    if (!prefsLive) {
      // Demo mode: instant local update, exactly as before.
      void data.updateNotificationPreferences(user.profile.id, { [key]: value });
      return;
    }
    if (saving) return;
    setPendingKey(key);
    setPendingValue(value);
    setSaveError(null);
    void (async () => {
      try {
        await data.updateNotificationPreferences(user.profile.id, { [key]: value });
        showToast('Notification settings saved.');
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "We couldn't save your notification settings. Check your connection and try again.",
        );
      } finally {
        setPendingKey(null);
      }
    })();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <AppText tone="secondary">
        Choose what you would like to be notified about. You can change these at any time.
      </AppText>

      {showLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary" style={styles.centerText}>
            Loading your notification settings…
          </AppText>
        </View>
      ) : showLoadError ? (
        <View style={styles.centerWrap}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load settings"
            message={data.notificationPrefsError ?? ''}
          />
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshNotificationPrefs()}
          />
        </View>
      ) : (
        <>
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
                  value={s.key === pendingKey ? pendingValue : prefs[s.key]}
                  disabled={prefsLive && saving}
                  onValueChange={(v) => handleToggle(s.key, v)}
                  trackColor={{ true: colors.primary, false: colors.borderStrong }}
                  accessibilityLabel={s.title}
                />
              </View>
            ))}
          </Card>

          {prefsLive && saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <AppText variant="small" tone="secondary">
                Saving…
              </AppText>
            </View>
          ) : null}

          {saveError ? (
            <View style={styles.saveErrorBar}>
              <Ionicons name="alert-circle" size={20} color={colors.danger} />
              <AppText variant="small" style={styles.saveErrorText}>
                {saveError}
              </AppText>
            </View>
          ) : null}

          {prefsLive ? (
            <Card style={styles.deviceCard}>
              <AppText variant="bodyBold">Device notifications</AppText>

              {deviceState.kind === 'hydrating' ? (
                <View style={styles.deviceStatusRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <AppText variant="small" tone="secondary" style={styles.deviceStatusText}>
                    Checking this device…
                  </AppText>
                </View>
              ) : deviceState.kind === 'registered' ? (
                <>
                  <View style={styles.deviceStatusRow}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    <AppText style={styles.deviceStatusText}>
                      This device is registered for notifications.
                    </AppText>
                  </View>
                  <AppText variant="small" tone="muted">
                    You’re all set. Notification delivery itself arrives in a later
                    update, and your choices above decide what you’ll hear about.
                  </AppText>
                </>
              ) : deviceState.kind === 'permissionDenied' ? (
                <>
                  <AppText variant="small" tone="secondary">
                    Notifications are switched off for Shift Shepherd in your phone’s
                    settings. Allow them there, then try again.
                  </AppText>
                  <Button
                    title="Try Again"
                    variant="secondary"
                    icon="refresh-outline"
                    onPress={registerDevice}
                  />
                </>
              ) : deviceState.kind === 'unsupportedDevice' ? (
                <AppText variant="small" tone="muted">
                  Device notifications aren’t available here — they work on a real
                  phone or tablet.
                </AppText>
              ) : deviceState.kind === 'needsDevelopmentBuild' ? (
                <AppText variant="small" tone="muted">
                  This preview of the app can’t register for notifications. The
                  installed church app will be able to.
                </AppText>
              ) : deviceState.kind === 'missingProjectId' ? (
                <AppText variant="small" tone="muted">
                  Notifications aren’t fully set up for this version of the app yet.
                  Please check back after the next update.
                </AppText>
              ) : deviceState.kind === 'failed' ? (
                <>
                  <AppText variant="small" style={styles.deviceErrorText}>
                    {deviceState.message}
                  </AppText>
                  <Button
                    title="Try Again"
                    variant="secondary"
                    icon="refresh-outline"
                    onPress={registerDevice}
                  />
                </>
              ) : (
                <>
                  <AppText variant="small" tone="secondary">
                    Register this device so it can receive church notifications once
                    delivery is switched on. Your phone will ask for permission first
                    — nothing is sent without it.
                  </AppText>
                  <Button
                    title={
                      deviceState.kind === 'working'
                        ? 'Setting up…'
                        : 'Enable device notifications'
                    }
                    icon="notifications-outline"
                    loading={deviceState.kind === 'working'}
                    disabled={deviceState.kind === 'working'}
                    onPress={registerDevice}
                  />
                </>
              )}
            </Card>
          ) : null}

          <AppText variant="small" tone="muted" style={styles.note}>
            {prefsLive
              ? 'These settings are saved to your account now. Actual push notifications to this device will be enabled in a later update.'
              : 'This demo simulates notifications with in-app badges. Real push notifications will arrive when the app is connected to Expo Notifications.'}
          </AppText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  deviceCard: { gap: spacing.md },
  deviceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deviceStatusText: { color: colors.success, flex: 1 },
  deviceErrorText: { color: colors.danger },
  note: { textAlign: 'center' },
  centerWrap: { paddingVertical: spacing.xl, gap: spacing.md },
  centerText: { textAlign: 'center' },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  saveErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
  },
  saveErrorText: { color: colors.danger, flex: 1 },
});
