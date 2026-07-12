import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../lib/auth/AuthContext';

export default function NoOrganisationsScreen() {
  const router = useRouter();
  const {
    accountContext,
    authIdentity,
    setGlobalDisplayName,
    refreshAccountContext,
    signOut,
  } = useAuth();
  const [name, setName] = useState(
    accountContext?.account.global_display_name ?? authIdentity?.suggestedName ?? '',
  );
  const [savingName, setSavingName] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasName = !!accountContext?.account.global_display_name;

  const saveName = async () => {
    if (savingName) return;
    setSavingName(true);
    setError(null);
    try {
      await setGlobalDisplayName(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t save your name.');
    } finally {
      setSavingName(false);
    }
  };

  const requestComingSoon = () => {
    const message =
      'Request to join is coming soon. For now, ask a church administrator to send you an invitation.';
    if (Platform.OS === 'web') alert(message);
    else Alert.alert('Coming soon', message);
  };

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      await refreshAccountContext();
    } catch {
      setError('We couldn’t refresh your account. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  // Clearing the session un-guards this route, so the root layout returns to
  // login on its own — only a failed sign-out needs reporting here.
  const leave = async () => {
    try {
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t complete the sign out.');
    }
  };

  return (
    <Screen safeTop keyboard>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <AppText variant="title">SS</AppText>
        </View>
        <AppText variant="title" style={styles.center}>No organisations yet</AppText>
        <AppText tone="secondary" style={styles.center}>
          Your account is ready, but it does not have access to a church organisation yet.
        </AppText>
      </View>

      {!hasName ? (
        <Card style={styles.card}>
          <AppText variant="subheading">First, confirm your name</AppText>
          <AppText tone="secondary">
            This is your default name across Shift Shepherd. You can use a different name in an
            organisation later.
          </AppText>
          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            autoCapitalize="words"
            maxLength={100}
          />
          <Button title="Save my name" onPress={() => void saveName()} loading={savingName} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <AppText variant="subheading">Choose what to do next</AppText>
          <Button
            title="Create an organisation"
            icon="add-circle-outline"
            onPress={() => router.push('/organisations/create')}
          />
          <Button
            title="Request to join — Coming soon"
            variant="secondary"
            icon="mail-outline"
            onPress={requestComingSoon}
            accessibilityHint="Explains how to ask for an invitation; no request is sent"
          />
        </Card>
      )}

      {error ? (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <AppText tone="danger">{error}</AppText>
          <Button title="Try again" variant="ghost" onPress={() => void retry()} loading={retrying} />
        </View>
      ) : null}

      <Button
        title="Sign out"
        variant="ghost"
        icon="log-out-outline"
        onPress={() => void leave()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  center: { textAlign: 'center' },
  card: { gap: spacing.md },
  error: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
});
