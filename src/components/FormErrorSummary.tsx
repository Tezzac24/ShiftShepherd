import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../constants/theme';
import { AppText } from './AppText';

export interface FormErrorItem {
  key: string;
  message: string;
  /** Caller scrolls to the measured field and focuses its ref. */
  onPress?: () => void;
}

/** Render after validation, before fields. Draft and validation stay with the caller. */
export function FormErrorSummary({ errors, title = 'Please check these details' }: {
  errors: readonly FormErrorItem[];
  title?: string;
}) {
  if (!errors.length) return null;
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Ionicons name="alert-circle-outline" size={24} color={colors.danger} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
        <AppText variant="bodyBold" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>
          {title}
        </AppText>
      </View>
      {errors.map((error) => error.onPress ? (
        <Pressable
          key={error.key} accessibilityRole="button" accessibilityLabel={error.message}
          accessibilityHint="Go to this field" onPress={error.onPress}
          style={({ pressed }) => [styles.error, pressed && styles.pressed]}
        >
          <AppText tone="danger" style={styles.text}>{error.message}</AppText>
          <Ionicons name="arrow-forward" size={20} color={colors.danger} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
        </Pressable>
      ) : (
        <AppText key={error.key} tone="danger">{error.message}</AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.dangerSoft, gap: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1 },
  error: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  pressed: { backgroundColor: colors.surface },
});
