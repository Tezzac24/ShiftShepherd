import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { colors } from '@/constants/theme';
import { AppText } from '@/src/components/AppText';
import { Button } from '@/src/components/Button';
import { ConfirmProvider } from '@/src/components/ConfirmDialog';
import { StartupScreen } from '@/src/components/StartupScreen';
import { ToastProvider } from '@/src/components/Toast';
import { PushRegistrationProvider } from '@/src/features/notifications/useDevicePushRegistration';
import { ChurchEntryPresentationProvider } from '@/src/features/organisations/ChurchEntryPresentation';
import { AppDataProvider, useAppData } from '@/src/lib/appData/AppDataContext';
import { AuthProvider, useAuth } from '@/src/lib/auth/AuthContext';
import { paperTheme } from '@/src/lib/theme/paperTheme';

function RootStack({ hasStarted }: { hasStarted: React.MutableRefObject<boolean> }) {
  const router = useRouter();
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
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: 18 },
        // The header gives route context; the screen content owns its full
        // level-one heading. Keep context text readable without a second h1.
        headerTitle: ({ children }) => (
          <AppText variant="label" style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>
            {children}
          </AppText>
        ),
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        headerBackButtonDisplayMode: 'default',
        // Keep the native back control/gesture whenever there is history. A
        // direct detail link still has a labelled exit through the auth hub,
        // which retains pending-invitation and active-account precedence.
        headerLeft: navigation.canGoBack() ? undefined : () => (
          <Button title="Back" icon="chevron-back" variant="ghost"
            onPress={() => router.replace('/')}
            accessibilityHint="Returns to your current app starting screen" />
        ),
        contentStyle: { backgroundColor: colors.background },
      })}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="invite/accept" options={{ headerShown: false }} />

      {/* Login is only reachable when signed out */}
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Signed-in account states that deliberately have no active org data.
          "No organisations yet" is only true while there is no active profile:
          once one resolves, the guard drops the route and index sends the user
          home rather than stranding them on a stale answer. */}
      <Stack.Protected guard={isAuthenticated && !user}>
        <Stack.Screen name="no-organisations" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="organisations/create" options={{ title: 'Create church' }} />
        <Stack.Screen name="organisations/select" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Everything else requires a signed-in user */}
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="announcements/index" options={{ title: 'Announcements' }} />
        <Stack.Screen name="announcements/[id]" options={{ title: 'Announcement' }} />
        <Stack.Screen name="announcements/edit" options={{ title: 'Announcement' }} />
        <Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
        <Stack.Screen name="events/edit" options={{ title: 'Event' }} />
        <Stack.Screen name="teams/new" options={{ title: 'New team' }} />
        <Stack.Screen name="teams/archived" options={{ title: 'Archived teams' }} />
        <Stack.Screen name="teams/[teamId]/index" options={{ title: 'Team' }} />
        <Stack.Screen name="teams/[teamId]/edit" options={{ title: 'Edit team' }} />
        <Stack.Screen name="teams/[teamId]/settings" options={{ title: 'Manage team' }} />
        <Stack.Screen name="teams/[teamId]/settings/members/index" options={{ title: 'Members' }} />
        <Stack.Screen name="teams/[teamId]/settings/members/add" options={{ title: 'Add member' }} />
        <Stack.Screen name="teams/[teamId]/chat" options={{ title: 'Team chat' }} />
        <Stack.Screen name="teams/[teamId]/rota/index" options={{ title: 'Rota' }} />
        <Stack.Screen name="teams/[teamId]/rota/edit" options={{ title: 'Rota date' }} />
        <Stack.Screen name="teams/[teamId]/rota/plan-month" options={{ title: 'Plan the month' }} />
        <Stack.Screen name="teams/[teamId]/rota/[entryId]/index" options={{ title: 'Serving' }} />
        <Stack.Screen name="teams/[teamId]/rota/[entryId]/select-songs" options={{ title: 'Choose songs' }} />
        <Stack.Screen name="teams/[teamId]/songs/index" options={{ title: 'Songs' }} />
        <Stack.Screen name="teams/[teamId]/songs/[songId]" options={{ title: 'Song' }} />
        <Stack.Screen name="teams/[teamId]/songs/edit" options={{ title: 'Song' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="organisations/invitations" options={{ title: 'Invitations' }} />
        <Stack.Screen name="organisations/members/index" options={{ title: 'Church members' }} />
        <Stack.Screen name="organisations/members/[profileId]" options={{ title: 'Member' }} />
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
      <PushRegistrationProvider>
        <ChurchEntryPresentationProvider>
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
        </ChurchEntryPresentationProvider>
      </PushRegistrationProvider>
    </AuthProvider>
  );
}
