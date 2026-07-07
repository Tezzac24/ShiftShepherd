import { Redirect } from 'expo-router';
import React from 'react';

import { useAuth } from '@/src/lib/auth/AuthContext';

/** Entry point: send users to login or straight into the app. */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? '/(tabs)/home' : '/login'} />;
}
