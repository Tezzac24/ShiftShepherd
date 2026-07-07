import React from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

import { colors, type } from '../../constants/theme';

type Variant = 'title' | 'heading' | 'subheading' | 'body' | 'bodyBold' | 'label' | 'small';
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'danger' | 'inverse';

interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

const toneColor: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  primary: colors.primary,
  danger: colors.danger,
  inverse: colors.white,
};

export function AppText({ variant = 'body', tone = 'default', style, ...rest }: AppTextProps) {
  return <Text style={[type[variant], { color: toneColor[tone] }, style]} {...rest} />;
}

export const textStyles = StyleSheet.create({});
