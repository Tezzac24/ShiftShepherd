import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../constants/theme';
import { AppText } from './AppText';

interface DateMarkerProps {
  /** Caller formats its existing date source; the marker never parses or shifts it. */
  day: string;
  month: string;
  /** Include full date and time when the marker stands alone. */
  accessibilityLabel: string;
  /** Use inside a row that already announces the full date/time. */
  decorative?: boolean;
}

export function DateMarker({ day, month, accessibilityLabel, decorative = false }: DateMarkerProps) {
  return (
    <View
      style={styles.marker}
      accessible={!decorative}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      aria-hidden={decorative}
    >
      <AppText variant="small" tone="primary" style={styles.month}>{month}</AppText>
      <AppText variant="heading" tone="primary" accessibilityRole="text">{day}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    minWidth: 56, alignSelf: 'flex-start', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft, borderRadius: radius.md,
  },
  month: { fontWeight: '600' },
});
