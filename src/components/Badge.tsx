import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../constants/theme';
import { AvailabilityStatus } from '../types';
import { AppText } from './AppText';

export type BadgeTone = 'primary' | 'accent' | 'danger' | 'success' | 'warning' | 'neutral';

const tones: Record<BadgeTone, { bg: string; fg: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  neutral: { bg: '#EEF0F5', fg: colors.textSecondary },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Custom colours (e.g. from categoryColors) override tone. */
  bg?: string;
  fg?: string;
  style?: ViewStyle;
}

export function Badge({ label, tone = 'neutral', bg, fg, style }: BadgeProps) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? t.bg }, style]}>
      <AppText variant="label" style={{ color: fg ?? t.fg }}>
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

/** Small red dot with a count, for unread indicators. */
export function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={styles.count} accessibilityLabel={`${count} unread`}>
      <AppText variant="label" tone="inverse">
        {count > 9 ? '9+' : String(count)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  count: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
