import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../constants/theme';
import { AppText } from './AppText';

/**
 * Calm full-screen loader for the two moments the app has nothing truthful to
 * show yet: restoring a saved session, and resolving the signed-in account's
 * organisation context. It is deliberately a *state*, never a destination —
 * routing waits for it rather than guessing.
 */
export function StartupScreen({ message = 'Getting things ready...' }: { message?: string }) {
  return (
    <View style={styles.startup}>
      <AppText variant="title">Shift Shepherd</AppText>
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText tone="secondary">{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
});
