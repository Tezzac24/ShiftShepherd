import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radius, spacing, type ThemeColors } from '../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AvailabilityStatus } from '../types';
import { AppText } from './AppText';

export type BadgeTone = 'primary' | 'accent' | 'danger' | 'success' | 'warning' | 'neutral';

const createTones = (colors: ThemeColors) => ({
  primary: { bg: colors.primarySoft, fg: colors.primary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  neutral: { bg: colors.surfaceRaised, fg: colors.textSecondary },
});

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Custom colours (e.g. from categoryColors) override tone. */
  bg?: string;
  fg?: string;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'neutral', bg, fg, style }: BadgeProps) {
  const tones = useThemedStyles(createTones);
  const styles = useThemedStyles(createStyles);
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? t.bg }, style]}>
      <AppText variant="small" style={{ color: fg ?? t.fg, fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}

export const availabilityLabels: Record<AvailabilityStatus, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  maybe: 'Maybe',
  not_responded: 'Not responded',
};

export const availabilityTones: Record<AvailabilityStatus, BadgeTone> = {
  available: 'success',
  unavailable: 'danger',
  maybe: 'warning',
  not_responded: 'neutral',
};

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  return <Badge label={availabilityLabels[status]} tone={availabilityTones[status]} />;
}

/** Unread is information, so its count uses the primary colour. */
export function CountBadge({ count }: { count: number }) {
  const styles = useThemedStyles(createStyles);
  if (!count) return null;
  return (
    <View style={styles.count} accessible accessibilityRole="text" accessibilityLabel={`${count} unread`}>
      <AppText variant="small" tone="onPrimary" style={{ fontWeight: '600' }}>
        {count > 9 ? '9+' : String(count)}
      </AppText>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
  },
  count: {
    minWidth: 26,
    minHeight: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
