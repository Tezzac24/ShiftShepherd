import { Redirect } from 'expo-router';
import React, { useState } from 'react';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { StartupScreen } from '../../components/StartupScreen';
import { useAuth } from '../../lib/auth/AuthContext';

/**
 * The single routing hub. Every authenticated destination is decided here, from
 * auth and account state — screens never navigate imperatively after sign-in,
 * and `Stack.Protected` in the root layout drops whatever no longer applies.
 *
 * The decision order below is also the state model. The important property is
 * that "the account context has not resolved yet" is its own state: it is not
 * allowed to fall through to "this account has no organisations", which is what
 * sent freshly signed-in organisation members to "No organisations yet" while a
 * cold launch (which waits for bootstrap behind the startup gate) got it right.
 */
export default function AuthGateScreen() {
  const {
    user,
    isLoading,
    isAuthenticated,
    authMode,
    accountStatus,
    accountContext,
    pendingInvitationToken,
    refreshAccountContext,
    signOut,
  } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshAccountContext();
    } catch {
      // bootstrapLiveUser has already published the 'error' status; this screen
      // stays put and offers the retry again.
    } finally {
      setRetrying(false);
    }
  };

  // 1. Auth bootstrap unresolved — we do not yet know if there is a session.
  if (isLoading) return <StartupScreen />;

  // 2. A pending invitation outranks every other destination, signed in or not.
  if (pendingInvitationToken) return <Redirect href="/invite/accept" />;

  // 3. Signed out.
  if (!isAuthenticated) return <Redirect href="/login" />;

  // 4. Signed in with a resolved active organisation profile (demo mode included).
  if (user) return <Redirect href="/(tabs)/home" />;

  // 5. Signed in, but the live account context is not resolved. `accountContext`
  //    is still null here — and a null context is NOT an empty one.
  if (authMode === 'supabase' && accountStatus !== 'ready') {
    if (accountStatus === 'error') {
      return (
        <Screen safeTop>
          <EmptyState
            icon="cloud-offline-outline"
            title="We couldn’t load your account"
            message="We reached Shift Shepherd but couldn’t load your organisations. Please check your connection and try again."
          />
          <AppText variant="small" tone="muted">
            You have not been signed out, and nothing about your account has changed.
          </AppText>
          <Button
            title="Try again"
            icon="refresh-outline"
            onPress={() => void retry()}
            loading={retrying}
          />
          <Button
            title="Sign out"
            variant="ghost"
            onPress={() => void signOut().catch(() => undefined)}
          />
        </Screen>
      );
    }
    return <StartupScreen message="Loading your organisation..." />;
  }

  // 6. Resolved, and this account genuinely belongs to no organisation.
  if ((accountContext?.organisations.length ?? 0) === 0) {
    return <Redirect href="/no-organisations" />;
  }

  // 7. Resolved with organisations but no valid active profile — pick one.
  return <Redirect href="/organisations/select" />;
}
