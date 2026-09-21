import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../constants/theme';
import { AppText } from './AppText';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  /** Main views have two or three choices; never a hidden horizontal scroller. */
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label, value, options, onChange,
}: SegmentedControlProps<T>) {
  return (
    <View role="tablist" accessibilityLabel={label} style={styles.group}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled: !!option.disabled }}
            disabled={option.disabled}
            onPress={option.disabled || selected ? undefined : () => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment, selected && styles.selected,
              pressed && (selected ? styles.selectedPressed : styles.pressed),
            ]}
          >
            <AppText
              variant="label"
              tone={selected ? 'inverse' : option.disabled ? 'muted' : 'secondary'}
              style={styles.label}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row', padding: spacing.xs, gap: spacing.xs,
    borderRadius: radius.md, backgroundColor: colors.surfaceRaised,
  },
  segment: {
    flex: 1, minWidth: 0, minHeight: touchTarget,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.sm,
  },
  selected: { backgroundColor: colors.primary },
  selectedPressed: { backgroundColor: colors.primaryDark },
  pressed: { backgroundColor: colors.primarySoft },
  label: { textAlign: 'center' },
});
