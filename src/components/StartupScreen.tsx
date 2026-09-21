import React from 'react';
import { StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { Screen } from './Screen';
import { StatePanel } from './StatePanel';

/** Truthful loading while session/account scope resolves; never a destination. */
export function StartupScreen({ message = 'Getting things ready...' }: { message?: string }) {
  return (
    <Screen safeTop contentStyle={styles.startup}>
      <AppText variant="display" headingLevel={1} style={styles.center}>Shift Shepherd</AppText>
      <StatePanel kind="loading" title={message} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  startup: { flexGrow: 1, justifyContent: 'center' },
  center: { textAlign: 'center' },
});
