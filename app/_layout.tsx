import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { colors, spacing } from '@/constants/theme';
import { AppText } from '@/src/components/AppText';
import { ConfirmProvider } from '@/src/components/ConfirmDialog';
import { ToastProvider } from '@/src/components/Toast';
import { AppDataProvider, useAppData } from '@/src/lib/appData/AppDataContext';
import { AuthProvider, useAuth } from '@/src/lib/auth/AuthContext';
import { paperTheme } from '@/src/lib/theme/paperTheme';

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

function RootStack({ hasStarted }: { hasStarted: React.MutableRefObject<boolean> }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { isHydrated } = useAppData();
  const ready = !isLoading && isHydrated;

  React.useEffect(() => {
    if (ready) hasStarted.current = true;
  }, [ready, hasStarted]);

  // Never show a blank screen or flash the wrong route: on first launch, wait
  // until the saved session and demo data have been restored before mounting
  // the router. Only the first launch waits. AppDataProvider is remounted on
  // every account-scope change and reports isHydrated: false again while it
  // re-reads storage; unmounting the navigator there would drop any navigation
  // dispatched across the transition, which React Navigation then reports as
  // "REPLACE ... was not handled by any navigator". hasStarted lives above the
  // remount boundary, so the gate closes exactly once.
  if (!ready && !hasStarted.current) {
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
      <Stack.Screen name="invite/accept" options={{ headerShown: false }} />

      {/* Login is only reachable when signed out */}
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Signed-in account states that deliberately have no active org data. */}
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="no-organisations" options={{ headerShown: false }} />
        <Stack.Screen name="organisations/create" />
        <Stack.Screen name="organisations/select" options={{ headerShown: false }} />
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
        <Stack.Screen name="teams/[teamId]/settings" />
        <Stack.Screen name="teams/[teamId]/settings/members/index" />
        <Stack.Screen name="teams/[teamId]/settings/members/add" />
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
        <Stack.Screen name="organisations/invitations" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Organisation data is keyed by the active profile. A switch remounts the
 * complete provider, synchronously discarding every old row, unread map,
 * signed URL, timer, and subscription before the new organisation renders.
 */
function AccountScopedAppDataProvider({ children }: { children: React.ReactNode }) {
  const { authMode, user } = useAuth();
  const scopeKey =
    authMode === 'supabase'
      ? `live:${user?.supabaseProfileId ?? 'no-organisation'}`
      : 'demo-or-signed-out';
  return <AppDataProvider key={scopeKey}>{children}</AppDataProvider>;
}

export default function RootLayout() {
  // Rendered by Expo Router's own root slot, so this component survives the
  // account-scoped remount below and can carry the one-time startup gate.
  const hasStarted = React.useRef(false);
  return (
    <AuthProvider>
      <AccountScopedAppDataProvider>
        <PaperProvider theme={paperTheme}>
          <ConfirmProvider>
            <ToastProvider>
              <RootStack hasStarted={hasStarted} />
              <StatusBar style="dark" />
            </ToastProvider>
          </ConfirmProvider>
        </PaperProvider>
      </AccountScopedAppDataProvider>
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
