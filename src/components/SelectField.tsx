import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../constants/theme';
import { AppText } from './AppText';

export interface SelectOption<T extends string = string> {
  label: string;
  value: T;
  description?: string;
}

interface SelectFieldProps<T extends string> {
  label: string;
  placeholder?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}

/**
 * A simple, obvious picker: a big field that opens a bottom-sheet list.
 * Friendly for less technical users: closes via the X, choosing an option,
 * tapping outside the panel, or the familiar swipe-down on its header.
 */
export function SelectField<T extends string>({
  label,
  placeholder = 'Choose…',
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  // How far the sheet has been dragged down (reset whenever it reopens).
  const sheetShift = useRef(new Animated.Value(0)).current;

  const close = () => {
    setOpen(false);
    sheetShift.setValue(0);
  };

  // Swipe-down lives on the sheet HEADER only, so the option list underneath
  // keeps scrolling normally. Taps (the X) still work — the gesture only
  // claims the touch once it clearly moves downwards.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy > 0) sheetShift.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 90 || gesture.vy > 0.8) {
          close();
        } else {
          Animated.spring(sheetShift, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? selected.label : placeholder}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.8 }]}
      >
        <AppText tone={selected ? 'default' : 'muted'}>
          {selected ? selected.label : placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          {/* Tapping anywhere outside the panel closes it. The sheet renders
              on top, so taps inside it never reach this backdrop. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close without choosing"
            onPress={close}
          />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetShift }] }]}>
            <View {...panResponder.panHandlers}>
              <View style={styles.dragHandle} />
              <View style={styles.sheetHeader}>
                <AppText variant="subheading">{label}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={close}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={26} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant={item.value === value ? 'bodyBold' : 'body'}>
                      {item.label}
                    </AppText>
                    {item.description ? (
                      <AppText variant="small" tone="secondary">
                        {item.description}
                      </AppText>
                    ) : null}
                  </View>
                  {item.value === value ? (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  ) : null}
                </Pressable>
              )}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  field: {
    minHeight: touchTarget,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '75%',
    paddingBottom: spacing.xl,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  option: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
