import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../constants/theme';
import { AppText, HeadingLevel } from './AppText';
import { Button } from './Button';

export interface StateAction { label: string; onPress: () => void }
export interface StatePanelProps {
  kind?: 'empty' | 'loading' | 'error' | 'info';
  compact?: boolean;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: StateAction;
  headingLevel?: HeadingLevel;
}

/** Compact for a summary; full for a screen's main loading/empty/error state. */
export function StatePanel({
  kind = 'empty', compact = false, title, message, icon, action, headingLevel,
}: StatePanelProps) {
  const color = kind === 'error' ? colors.danger : colors.primary;
  const statusIcon = icon ?? (kind === 'error' ? 'alert-circle-outline' : 'information-circle-outline');
  const status = kind === 'loading' ? (
    <ActivityIndicator color={color} size={compact ? 'small' : 'large'} accessible={false} />
  ) : (
    <Ionicons name={statusIcon} size={compact ? 24 : 28} color={color} accessible={false} />
  );

  return (
    <View style={[styles.panel, compact ? styles.compact : styles.full]}>
      <View
        style={[styles.icon, compact && styles.compactIcon, kind === 'error' && styles.errorIcon]}
        accessible={kind === 'loading'}
        accessibilityRole={kind === 'loading' ? 'progressbar' : undefined}
        accessibilityLabel={kind === 'loading' ? title : undefined}
        accessibilityState={kind === 'loading' ? { busy: true } : undefined}
      >
        {status}
      </View>
      <View style={[styles.content, !compact && styles.fullContent]}>
        <AppText
          variant={compact ? 'bodyBold' : 'subheading'}
          style={!compact && styles.center}
          headingLevel={headingLevel}
          accessibilityRole={kind === 'error' ? 'alert' : undefined}
          accessibilityLiveRegion={kind === 'error' || kind === 'loading' ? 'polite' : undefined}
        >
          {title}
        </AppText>
        {message ? <AppText tone="secondary" style={!compact && styles.center}>{message}</AppText> : null}
        {action ? <Button title={action.label} onPress={action.onPress} variant={kind === 'error' ? 'secondary' : 'primary'} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  full: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  compact: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.lg, backgroundColor: colors.surfaceRaised, borderRadius: radius.md },
  icon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  compactIcon: { width: 32, height: 32, backgroundColor: 'transparent' },
  errorIcon: { backgroundColor: colors.dangerSoft },
  content: { flexShrink: 1, gap: spacing.sm },
  fullContent: { alignSelf: 'stretch' },
  center: { textAlign: 'center' },
});
