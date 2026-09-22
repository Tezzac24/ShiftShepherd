import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ListGroup } from '../../components/ListGroup';
import { SwitchRow } from '../../components/ListRow';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { NotificationPreferences } from '../../types';
import { useDevicePushRegistration } from './useDevicePushRegistration';

type PrefKey = keyof Omit<NotificationPreferences, 'id' | 'user_id'>;
type Preference = { key: PrefKey; title: string; description: string };

const updates: Preference[] = [
  { key: 'announcement_notifications', title: 'Church announcements', description: 'Updates for the whole church' },
  { key: 'team_announcement_notifications', title: 'Team announcements', description: 'Notices from the teams you belong to' },
  { key: 'chat_notifications', title: 'Chat messages', description: 'New messages in your team chats' },
  { key: 'rota_notifications', title: 'Rota updates', description: 'New assignments and changes to your serving dates' },
];
const reminders: Preference[] = [
  { key: 'event_reminders', title: 'Event reminders', description: 'Before church events' },
  { key: 'availability_reminders', title: 'Availability reminders', description: 'To confirm your serving availability' },
];

/** Presentation only: the current profile owns every preference and the existing
 * registration lifecycle owns opt-in, hydration, rebind and cleanup. */
export default function NotificationSettingsScreen() {
  const user = useRequiredUser();
  const data = useAppData();
  const showToast = useToast();
  const [pendingKey, setPendingKey] = useState<PrefKey | null>(null);
  const [pendingValue, setPendingValue] = useState(false);
  const [saveError, setSaveError] = useState<{ key: PrefKey; message: string } | null>(null);
  const savePending = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const failedChoiceRef = useRef<View>(null);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
  const prefsLive = data.notificationPrefsLive;
  const prefs = data.getNotificationPreferences(user.profile.id);
  const saving = pendingKey !== null;
  const { state: deviceState, register: registerDevice } = useDevicePushRegistration();
  const showLoading = prefsLive && data.notificationPrefsLoading;
  const showLoadError = prefsLive && !!data.notificationPrefsError && !showLoading;

  const handleToggle = (key: PrefKey, value: boolean) => {
    if (!prefsLive) {
      void data.updateNotificationPreferences(user.profile.id, { [key]: value });
      return;
    }
    if (savePending.current || showLoading || showLoadError) return;
    savePending.current = true;
    setPendingKey(key);
    setPendingValue(value);
    setSaveError(null);
    void (async () => {
      try {
        await data.updateNotificationPreferences(user.profile.id, { [key]: value });
        showToast('Notification settings saved.');
      } catch (error) {
        setSaveError({ key, message: error instanceof Error ? error.message : "We couldn't save your notification settings. Check your connection and try again." });
      } finally {
        savePending.current = false;
        setPendingKey(null);
      }
    })();
  };

  const revealFailedChoice = () => {
    const choice = failedChoiceRef.current;
    const scroll = scrollRef.current;
    const content = scroll?.getInnerViewNode();
    if (!choice || !scroll || !content || !viewportHeight.current) return;
    choice.measureLayout(content, (_x, y, _width, height) => {
      if (failedChoiceRef.current !== choice) return;
      const top = Math.max(0, y - spacing.md);
      const bottom = y + height + spacing.md;
      const offset = scrollOffset.current;
      // Reveal just the local feedback. Keep the retry switch in view even if
      // large text makes the switch and message taller than the viewport.
      const nextOffset = y < offset ? top : Math.min(top, bottom - viewportHeight.current);
      if (y < offset || nextOffset > offset) {
        scroll.scrollTo({ y: nextOffset, animated: false });
      }
    });
  };

  const preferenceRows = (settings: Preference[]) => settings.map((setting) => {
    const error = saveError?.key === setting.key ? saveError : null;
    // RN Web begins observing layout only when the view mounts. Keep the
    // handler registered before a failure so added feedback is measured.
    return (
      <View key={setting.key} testID={`notification-preference-${setting.key}`}
        ref={error ? failedChoiceRef : undefined} collapsable={!error}
        onLayout={() => { if (error) revealFailedChoice(); }}>
        <SwitchRow title={setting.title} subtitle={setting.description}
          value={setting.key === pendingKey ? pendingValue : prefs[setting.key]}
          disabled={prefsLive && saving} busy={setting.key === pendingKey}
          onValueChange={(value) => handleToggle(setting.key, value)} />
        {error ? <StatePanel compact kind="error" title={`${setting.title}: change not saved`}
          message={`${error.message} Your previous choice has been restored. Try this switch again.`} /> : null}
      </View>
    );
  });

  return (
    <Screen scrollRef={scrollRef} scrollProps={{
      onLayout: (event) => { viewportHeight.current = event.nativeEvent.layout.height; },
      onScroll: (event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; },
      scrollEventThrottle: 16,
    }}>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <OrganisationHeader />
      <PageHeading title="Notifications" description="Your choices for this church. Each change saves automatically." />

      {showLoading ? <StatePanel kind="loading" title="Loading your notification settings…" />
        : showLoadError ? <StatePanel kind="error" title="Couldn’t load settings" message={data.notificationPrefsError ?? undefined}
          action={{ label: 'Retry settings', onPress: () => void data.refreshNotificationPrefs() }} />
          : <>
            <View style={styles.section}>
              <SectionHeader title="Church and team updates" />
              <ListGroup>{preferenceRows(updates)}</ListGroup>
              {prefsLive && saving ? <View style={styles.status} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={colors.primary} accessible={false} />
                <AppText variant="small" tone="secondary">Saving your choice…</AppText>
              </View> : null}
            </View>

            {prefsLive ? <View style={styles.section}>
              <SectionHeader title="On this device" />
              <Card style={styles.device}>
                {deviceState.kind === 'hydrating' ? <StatePanel compact kind="loading" title="Checking this device…" />
                  : deviceState.kind === 'registered' ? <>
                    <View style={styles.status}>
                      <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} accessible={false} />
                      <AppText variant="bodyBold" style={styles.statusText}>Device registered</AppText>
                    </View>
                    <AppText tone="secondary">This device is registered for your current church. Your choices above decide which announcements, messages and rota updates are allowed.</AppText>
                  </> : deviceState.kind === 'permissionDenied' ? <>
                    <AppText variant="bodyBold">Allow notifications in device settings</AppText>
                    <AppText tone="secondary">Notifications are turned off for Shift Shepherd in your device settings. Allow them there, then try again.</AppText>
                    <Button title="Try again" variant="secondary" icon="refresh-outline" onPress={registerDevice} />
                  </> : deviceState.kind === 'unsupportedDevice' ? <>
                    <AppText variant="bodyBold">Unavailable on this device</AppText>
                    <AppText tone="secondary">Device notifications aren’t available here. Your preferences still save.</AppText>
                  </> : deviceState.kind === 'needsDevelopmentBuild' ? <>
                    <AppText variant="bodyBold">Unavailable in this preview</AppText>
                    <AppText tone="secondary">Use an installed version of Shift Shepherd that supports device notifications. Your preferences still save here.</AppText>
                  </> : deviceState.kind === 'missingProjectId' ? <>
                    <AppText variant="bodyBold">Notifications aren’t set up yet</AppText>
                    <AppText tone="secondary">Device notifications aren’t set up in this version of the app. Your preferences still save.</AppText>
                  </> : deviceState.kind === 'failed' ? <StatePanel compact kind="error" title="Couldn’t enable notifications" message={deviceState.message}
                    action={{ label: 'Try again', onPress: registerDevice }} /> : <>
                    <AppText variant="bodyBold">Device notifications</AppText>
                    <AppText tone="secondary">Allow announcements, team messages and rota updates from your current church on this device. Your device may ask for permission.</AppText>
                    <Button title={deviceState.kind === 'working' ? 'Setting up…' : 'Enable device notifications'} icon="notifications-outline"
                      loading={deviceState.kind === 'working'} disabled={deviceState.kind === 'working'} onPress={registerDevice} />
                  </>}
              </Card>
            </View> : null}

            <View style={styles.section}>
              <SectionHeader title="Reminders" />
              <AppText tone="secondary">Event and availability reminders are not sent yet. You can still save your choices.</AppText>
              <ListGroup>{preferenceRows(reminders)}</ListGroup>
            </View>
            <AppText variant="small" tone="secondary">
              {prefsLive ? 'These preferences belong to your current church profile. Your other churches have their own choices.'
                : 'Demo only: these choices are saved with your example data. This demo sends no device notifications.'}
            </AppText>
          </>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginBottom: spacing.sm },
  device: { gap: spacing.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { flex: 1 },
});
