import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { AppText } from '@/src/components/AppText';
import { ConfirmProvider } from '@/src/components/ConfirmDialog';
import { AppDataProvider, useAppData } from '@/src/lib/appData/AppDataContext';
import { AuthProvider, useAuth } from '@/src/lib/auth/AuthContext';

/** Calm full-screen loader shown while saved data/session is restored. */
function StartupScreen() {
  return (
    <View style={styles.startup}>
      <AppText variant="title">Shift Shepherd</AppText>
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText tone="secondary">Getting things ready...</AppText>
    </View>
  );
}

function RootStack() {
  const { user, isLoading } = useAuth();
  const { isHydrated } = useAppData();

  // Never show a blank screen or flash the wrong route: wait until the saved
  // session and demo data have been restored before mounting the router.
  if (isLoading || !isHydrated) {
    return <StartupScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />

      {/* Login is only reachable when signed out */}
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Everything else requires a signed-in user */}
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="announcements/index" />
        <Stack.Screen name="announcements/[id]" />
        <Stack.Screen name="announcements/edit" />
        <Stack.Screen name="events/[id]" />
        <Stack.Screen name="events/edit" />
        <Stack.Screen name="teams/[teamId]/index" />
        <Stack.Screen name="teams/[teamId]/chat" />
        <Stack.Screen name="teams/[teamId]/rota/index" />
        <Stack.Screen name="teams/[teamId]/rota/edit" />
        <Stack.Screen name="teams/[teamId]/rota/plan-month" />
        <Stack.Screen name="teams/[teamId]/rota/[entryId]/index" />
        <Stack.Screen name="teams/[teamId]/rota/[entryId]/select-songs" />
        <Stack.Screen name="teams/[teamId]/songs/index" />
        <Stack.Screen name="teams/[teamId]/songs/[songId]" />
        <Stack.Screen name="teams/[teamId]/songs/edit" />
        <Stack.Screen name="settings/notifications" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <ConfirmProvider>
          <RootStack />
          <StatusBar style="dark" />
        </ConfirmProvider>
      </AppDataProvider>
    </AuthProvider>
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
