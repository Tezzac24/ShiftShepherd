import React, { forwardRef } from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

import { type, type ThemeColors } from '../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';

type Variant = keyof typeof type;
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'accent' | 'danger' | 'success' | 'warning' | 'inverse' | 'onPrimary';
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  /** Visual variants do not imply document structure. Native readers get a
   * header; React Native Web also exposes the chosen heading level. */
  headingLevel?: HeadingLevel;
}

const createToneColor = (colors: ThemeColors) => ({
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  primary: colors.primary,
  accent: colors.accent,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  inverse: colors.white,
  onPrimary: colors.onPrimary,
});

export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  { variant = 'body', tone = 'default', headingLevel, accessibilityRole, style, ...rest }, ref,
) {
  const toneColor = useThemedStyles(createToneColor);
  const heading = headingLevel !== undefined && (!accessibilityRole || accessibilityRole === 'header');
  return (
    <Text
      ref={ref}
      allowFontScaling
      accessibilityRole={accessibilityRole ?? (heading ? 'header' : undefined)}
      aria-level={heading ? headingLevel : undefined}
      style={[type[variant], { color: toneColor[tone] }, style]}
      {...rest}
    />
  );
});

export const textStyles = StyleSheet.create({});
