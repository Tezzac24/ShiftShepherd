import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';

export default function UnavailableRouteScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Page unavailable' }} />
      <StatePanel
        kind="info"
        headingLevel={1}
        title="This page is unavailable"
        message="We couldn't open this page. Continue to return to Shift Shepherd."
        action={{ label: 'Continue', onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
