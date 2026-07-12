import { Redirect } from 'expo-router';
import React from 'react';

import { useAuth } from '@/src/lib/auth/AuthContext';

/** Entry point: send users to login or straight into the app. */
export default function Index() {
  const { user, isAuthenticated, accountContext, pendingInvitationToken } = useAuth();
  if (pendingInvitationToken) return <Redirect href="/invite/accept" />;
  if (!isAuthenticated) return <Redirect href="/login" />;
  if (user) return <Redirect href="/(tabs)/home" />;
  if ((accountContext?.organisations.length ?? 0) === 0) {
    return <Redirect href="/no-organisations" />;
  }
  return <Redirect href="/organisations/select" />;
}
