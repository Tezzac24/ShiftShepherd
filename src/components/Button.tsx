import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, StyleProp, View, ViewStyle } from 'react-native';

import { radius, spacing, touchTarget, type ThemeColors } from '../../constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const createBackgrounds = (colors: ThemeColors) => ({
  primary: colors.primary,
  secondary: colors.primarySoft,
  destructive: colors.dangerSoft,
  ghost: 'transparent',
});
const createForegrounds = (colors: ThemeColors) => ({
  primary: colors.onPrimary,
  secondary: colors.primary,
  destructive: colors.danger,
  ghost: colors.primary,
});

/** A full-sized target whose label can wrap and grow with system text size. */
export const Button = forwardRef<View, ButtonProps>(function Button({
  title, onPress, variant = 'primary', icon, disabled = false, loading = false,
  style, accessibilityLabel, accessibilityHint, testID,
}, ref) {
  const colors = useThemeColors();
  const backgrounds = useThemedStyles(createBackgrounds);
  const foregrounds = useThemedStyles(createForegrounds);
  const styles = useThemedStyles(createStyles);
  const pressedStyles = useThemedStyles(createPressedStyles);
  const blocked = disabled || loading;
  const labelColor = disabled ? colors.textMuted : foregrounds[variant];

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      aria-disabled={blocked}
      aria-busy={loading}
      testID={testID}
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: backgrounds[variant] },
        disabled && styles.disabled,
        style,
        pressed && !blocked && pressedStyles[variant],
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
      ) : icon ? (
        <Ionicons name={icon} size={22} color={labelColor} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
      ) : null}
      <AppText variant="bodyBold" style={[styles.label, { color: labelColor }]}>
        {title}
      </AppText>
    </Pressable>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  base: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { flexShrink: 1, textAlign: 'center' },
  disabled: { backgroundColor: colors.surfaceRaised },
});

const createPressedStyles = (colors: ThemeColors) => StyleSheet.create({
  primary: { backgroundColor: colors.primaryDark },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.primary },
  destructive: { borderColor: colors.danger },
  ghost: { backgroundColor: colors.primarySoft },
});
