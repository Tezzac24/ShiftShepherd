import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, touchTarget, type ThemeColors } from '../../constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from './AppText';
import { FocusRef, ModalSurface } from './ModalSurface';

export interface SheetAction {
  key: string;
  label: string;
  onPress: () => void;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  disabled?: boolean;
  selected?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  title: string;
  description?: string;
  actions: SheetAction[];
  onClose: () => void;
  returnFocusRef?: FocusRef;
  slide?: boolean;
}

/** Labelled contextual tools; selecting one closes the sheet before its action. */
export function ActionSheet({
  visible, title, description, actions, onClose, returnFocusRef, slide,
}: ActionSheetProps) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const transferredFocus = useRef(false);
  const wasVisible = useRef(false);
  if (visible && !wasVisible.current) transferredFocus.current = false;
  wasVisible.current = visible;

  return (
    <ModalSurface visible={visible} title={title} onClose={onClose} returnFocusRef={returnFocusRef} slide={slide}
      shouldRestoreFocus={() => !transferredFocus.current}>
      {description ? <AppText tone="secondary">{description}</AppText> : null}
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={[action.label, action.description].filter(Boolean).join('. ')}
          accessibilityState={{ disabled: !!action.disabled, selected: action.selected }}
          aria-disabled={!!action.disabled}
          aria-pressed={action.selected}
          disabled={action.disabled}
          onPress={action.disabled ? undefined : () => {
            // Set this before either callback: either may synchronously unmount
            // the sheet or open another screen/dialog that now owns focus.
            transferredFocus.current = true;
            onClose();
            action.onPress();
          }}
          style={({ pressed }) => [
            styles.action,
            action.selected && styles.selected,
            pressed && styles.pressed,
          ]}
        >
          {action.icon ? (
            <Ionicons
              name={action.icon} size={24} accessible={false}
              color={action.disabled ? colors.textMuted : action.destructive ? colors.danger : colors.primary} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
            />
          ) : null}
          <View style={styles.text}>
            <AppText variant="bodyBold" tone={action.disabled ? 'muted' : action.destructive ? 'danger' : 'default'}>
              {action.label}
            </AppText>
            {action.description ? <AppText variant="small" tone="secondary">{action.description}</AppText> : null}
          </View>
          {action.selected ? <Ionicons name="checkmark" size={24} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden /> : null}
        </Pressable>
      ))}
    </ModalSurface>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  action: {
    minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
  },
  text: { flex: 1, gap: spacing.xs },
  selected: { backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.surfaceRaised },
});
