import React, { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../constants/theme';
import { AppText } from './AppText';
import { Button } from './Button';

export type FocusRef = React.RefObject<View | Text | TextInput | null>;

function focusTarget(target: View | Text | TextInput | null) {
  if (!target) return;
  if (Platform.OS === 'web') {
    target.focus();
  } else {
    const handle = findNodeHandle(target);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }
}

interface ModalSurfaceProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  presentation?: 'sheet' | 'dialog';
  closeLabel?: string;
  footer?: React.ReactNode;
  /** False when the child owns scrolling, e.g. a FlatList. */
  scroll?: boolean;
  returnFocusRef?: FocusRef;
  /** Read at dismissal so a synchronous navigation/unmount can transfer focus. */
  shouldRestoreFocus?: () => boolean;
}

/**
 * Native Modal supplies the modal window (and web keyboard focus trap).
 * No transition is intentional: reduced motion is respected from first paint.
 * Supply the opener ref for reliable native accessibility focus restoration.
 */
export function ModalSurface({
  visible, title, onClose, children, presentation = 'sheet',
  closeLabel = 'Close', footer, scroll = true, returnFocusRef, shouldRestoreFocus,
}: ModalSurfaceProps) {
  const insets = useSafeAreaInsets();
  const titleRef = useRef<Text>(null);
  const opener = useRef({ ref: returnFocusRef, shouldRestoreFocus });
  opener.current = { ref: returnFocusRef, shouldRestoreFocus };
  const lifecycle = useRef({ visible: false, cycle: 0, mounted: true });
  if (visible && !lifecycle.current.visible) lifecycle.current.cycle += 1;
  lifecycle.current.visible = visible;
  const cycle = lifecycle.current.cycle;
  const restoredCycle = useRef(0);
  const restoreFocus = useCallback((dismissedCycle: number) => {
    // A dismissal/animation frame from an older opening cannot steal focus
    // from a reopened modal, even if that newer opening has since closed.
    const current = lifecycle.current;
    if (dismissedCycle !== current.cycle || restoredCycle.current === dismissedCycle
      || (current.mounted && current.visible) || opener.current.shouldRestoreFocus?.() === false) return;
    restoredCycle.current = dismissedCycle;
    focusTarget(opener.current.ref?.current ?? null);
  }, []);

  useEffect(() => {
    const current = lifecycle.current;
    current.mounted = true;
    return () => { current.mounted = false; };
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS === 'ios') return;
    return () => {
      // Android has no onDismiss callback. Wait until the modal window is gone.
      requestAnimationFrame(() => restoreFocus(cycle));
    };
  }, [visible, cycle, restoreFocus]);

  const content = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.scroll}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={() => restoreFocus(cycle)}
      accessibilityLabel={title}
      onShow={() => {
        if (Platform.OS !== 'web') focusTarget(titleRef.current);
      }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[
        styles.overlay,
        presentation === 'dialog' ? styles.dialogOverlay : styles.sheetOverlay,
        { paddingTop: insets.top + spacing.md },
        {
          paddingLeft: presentation === 'dialog' ? Math.max(insets.left, spacing.gutter) : insets.left,
          paddingRight: presentation === 'dialog' ? Math.max(insets.right, spacing.gutter) : insets.right,
        },
        presentation === 'dialog' && { paddingBottom: insets.bottom + spacing.md },
      ]}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[
            styles.panel,
            presentation === 'dialog' ? styles.dialog : styles.sheet,
            { paddingBottom: presentation === 'sheet' ? Math.max(insets.bottom, spacing.md) : spacing.md },
          ]}
        >
          <View style={styles.header}>
            <AppText ref={titleRef} variant="heading" headingLevel={1} style={styles.title}>
              {title}
            </AppText>
            <Button
              title={closeLabel}
              variant="ghost"
              icon={closeLabel === 'Close' ? 'close' : undefined}
              onPress={onClose}
              style={styles.close}
            />
          </View>
          {content}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay },
  sheetOverlay: { justifyContent: 'flex-end' },
  dialogOverlay: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.gutter },
  panel: { backgroundColor: colors.surface, maxHeight: '90%', width: '100%', flexShrink: 1 },
  dialog: { borderRadius: radius.lg, maxWidth: 480 },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    columnGap: spacing.sm, rowGap: spacing.xs,
    paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  close: { marginLeft: 'auto' },
  scroll: { flexShrink: 1 },
  content: { padding: spacing.gutter, gap: spacing.md },
  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.sm },
});
