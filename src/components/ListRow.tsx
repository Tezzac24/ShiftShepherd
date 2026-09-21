import { Ionicons } from '@expo/vector-icons';
import React, { useContext } from 'react';
import { AccessibilityRole, AccessibilityState, Pressable, StyleSheet, Switch, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../constants/theme';
import { AppText } from './AppText';
import { ListGroupContext } from './ListGroup';

interface ListRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  leading?: React.ReactNode;
  showChevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  testID?: string;
}

/** A full-width control in a ListGroup, or a stand-alone row. */
export function ListRow({
  icon, title, subtitle, onPress, right, leading, showChevron = true, destructive,
  disabled = false, accessibilityLabel, accessibilityHint, accessibilityRole = 'button',
  accessibilityState, testID,
}: ListRowProps) {
  const grouped = useContext(ListGroupContext);
  const content = (
    <>
      {leading ?? (icon ? (
        <View style={[styles.iconWrap, destructive && styles.dangerIcon]}>
          <Ionicons name={icon} size={24} color={destructive ? colors.danger : colors.primary} accessible={false} />
        </View>
      ) : null)}
      <View style={styles.textWrap}>
        <AppText variant="bodyBold" tone={disabled ? 'muted' : destructive ? 'danger' : 'default'}>{title}</AppText>
        {subtitle ? <AppText variant="small" tone="secondary">{subtitle}</AppText> : null}
      </View>
      {right}
      {onPress && showChevron && accessibilityRole === 'button' ? (
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} accessible={false} />
      ) : null}
    </>
  );
  const rowStyle = [styles.row, grouped && styles.grouped];

  if (!onPress) return <View testID={testID} style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join('. ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: disabled || accessibilityState?.disabled }}
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

interface SwitchRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
}

/** Exactly one accessible switch and one change per full-row tap. */
export function SwitchRow({ title, subtitle, value, onValueChange, disabled = false, busy = false }: SwitchRowProps) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      onPress={() => onValueChange(!value)}
      showChevron={false}
      disabled={disabled || busy}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, busy }}
      right={
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <Switch
            accessible={false}
            value={value}
            disabled={disabled || busy}
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
  },
  grouped: { borderWidth: 0, borderRadius: 0 },
  pressed: { backgroundColor: colors.primarySoft },
  iconWrap: {
    width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  dangerIcon: { backgroundColor: colors.dangerSoft },
  textWrap: { flex: 1, gap: spacing.xs },
});
