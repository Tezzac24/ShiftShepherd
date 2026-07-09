import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';

import { colors, radius, touchTarget, type } from '../../constants/theme';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type PaperButtonMode = React.ComponentProps<typeof PaperButton>['mode'];

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const buttonMode: Record<Variant, PaperButtonMode> = {
  primary: 'contained',
  secondary: 'contained-tonal',
  destructive: 'contained-tonal',
  ghost: 'outlined',
};

const buttonColor: Record<Variant, string> = {
  primary: colors.primary,
  secondary: colors.accentSoft,
  destructive: colors.dangerSoft,
  ghost: 'transparent',
};

const textColor: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.accent,
  destructive: colors.danger,
  ghost: colors.primary,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: ButtonProps) {
  const labelColor = textColor[variant];

  return (
    <PaperButton
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      loading={loading}
      mode={buttonMode[variant]}
      buttonColor={buttonColor[variant]}
      textColor={labelColor}
      uppercase={false}
      icon={
        icon
          ? ({ size, color }) => (
              <Ionicons name={icon} size={size} color={color} />
            )
          : undefined
      }
      contentStyle={styles.content}
      labelStyle={styles.label}
      style={[
        styles.base,
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
        style,
      ]}
    >
      {title}
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radius.md,
  },
  content: { minHeight: touchTarget },
  label: {
    fontSize: type.bodyBold.fontSize,
    lineHeight: type.bodyBold.lineHeight,
    fontWeight: type.bodyBold.fontWeight,
    letterSpacing: 0,
  },
  ghost: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  disabled: { opacity: 0.45 },
});
