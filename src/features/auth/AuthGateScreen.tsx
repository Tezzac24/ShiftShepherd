import { Redirect } from 'expo-router';
import React, { useState } from 'react';

import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StartupScreen } from '../../components/StartupScreen';
import { useAuth } from '../../lib/auth/AuthContext';
import { AccountIdentity, AccountReadState, AccountSignOut } from './AccountEntrySupport';

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
          <PageHeading eyebrow="Shift Shepherd" title="Your account" />
          <AccountIdentity />
          <AccountReadState error retrying={retrying} onRetry={() => void retry()} />
          <AccountSignOut disabled={retrying} />
        </Screen>
      );
    }
    return <StartupScreen message="Loading your churches…" />;
  }

  // 6. Resolved, and this account genuinely belongs to no organisation.
  if ((accountContext?.organisations.length ?? 0) === 0) {
    return <Redirect href="/no-organisations" />;
  }

  // 7. Resolved with organisations but no valid active profile — pick one.
  return <Redirect href="/organisations/select" />;
}
