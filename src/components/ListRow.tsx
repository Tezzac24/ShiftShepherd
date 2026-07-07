import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../constants/theme';
import { AppText } from './AppText';

interface ListRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
  destructive?: boolean;
}

/** A large, obvious tappable row for menus and settings. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  showChevron = true,
  destructive,
}: ListRowProps) {
  const color = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? (
        <View style={[styles.iconWrap, destructive && { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name={icon} size={22} color={destructive ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={styles.textWrap}>
        <AppText variant="bodyBold" style={{ color }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      {onPress && showChevron ? (
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pressed: { opacity: 0.8 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
});
