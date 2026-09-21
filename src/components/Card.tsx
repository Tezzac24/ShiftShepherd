import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'quiet';
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Card({
  children, onPress, style, tone = 'surface', disabled = false, testID,
  accessibilityLabel, accessibilityHint,
}: CardProps) {
  const cardStyle = [styles.card, tone === 'quiet' && styles.quiet, style];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        disabled={disabled}
        testID={testID}
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => [cardStyle, styles.interactive, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View testID={testID} style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quiet: { backgroundColor: colors.surfaceRaised, borderColor: colors.surfaceRaised },
  interactive: { minHeight: touchTarget },
  pressed: { backgroundColor: colors.primarySoft },
});
