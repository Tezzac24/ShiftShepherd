import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useAuth } from '../../lib/auth/AuthContext';

export default function OrganisationSelectorScreen() {
  const router = useRouter();
  const { accountContext, switchOrganisation, signOut } = useAuth();
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const organisations = accountContext?.organisations ?? [];

  const select = async (profileId: string) => {
    if (switching) return;
    setSwitching(profileId);
    setError(null);
    try {
      await switchOrganisation(profileId);
      router.replace('/(tabs)/home');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t switch organisations.');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <Screen safeTop>
      <Stack.Screen options={{ title: 'Choose organisation' }} />
      <View style={styles.heading}>
        <AppText variant="heading">Choose an organisation</AppText>
        <AppText tone="secondary">Only one organisation is active at a time.</AppText>
      </View>
      {organisations.length ? organisations.map((entry) => (
        <Card key={entry.profile.id} style={styles.card}>
          <View style={styles.copy}>
            <AppText variant="subheading">{entry.organisation.name}</AppText>
            <AppText tone="secondary">{entry.profile.full_name}</AppText>
          </View>
          <Button
            title={switching === entry.profile.id ? 'Switching…' : 'Open organisation'}
            onPress={() => void select(entry.profile.id)}
            loading={switching === entry.profile.id}
            disabled={switching !== null}
          />
        </Card>
      )) : (
        <EmptyState
          icon="business-outline"
          title="No organisations available"
          message="Return to the no-organisations screen to create one or wait for an invitation."
        />
      )}
      {error ? <AppText tone="danger" accessibilityLiveRegion="polite">{error}</AppText> : null}
      <Button
        title="Sign out"
        variant="ghost"
        onPress={() => void signOut().then(() => router.replace('/login'))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  card: { gap: spacing.md },
  copy: { gap: 2 },
});
