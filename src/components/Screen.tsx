import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, type ThemeColors } from '../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';

interface ScreenProps {
  children: React.ReactNode;
  /** Set false for lists/chat that manage their own scrolling. */
  scroll?: boolean;
  /** Add safe-area top padding on screens without a native header. */
  safeTop?: boolean;
  /** Opt in for forms; the content AND footer avoid the keyboard. */
  keyboard?: boolean;
  keyboardVerticalOffset?: number;
  /** Reachable actions in normal layout, never overlaid on the final field. */
  footer?: React.ReactNode;
  footerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Callers can scroll to a measured error before focusing its field. */
  scrollRef?: React.Ref<ScrollView>;
  scrollProps?: Omit<ScrollViewProps, 'children' | 'style' | 'contentContainerStyle'>;
}

export function Screen({
  children, scroll = true, safeTop = false, keyboard = false,
  keyboardVerticalOffset = Platform.OS === 'ios' ? 88 : 0,
  footer, footerStyle, style, contentStyle, scrollRef, scrollProps,
}: ScreenProps) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const topPad = safeTop ? { paddingTop: insets.top + spacing.md } : null;

  const inner = (
    <>
      {scroll ? (
        <ScrollView
          {...scrollProps}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: footer ? spacing.xl : Math.max(spacing.lg, insets.bottom) },
            topPad,
            contentStyle,
          ]}
          keyboardShouldPersistTaps={scrollProps?.keyboardShouldPersistTaps ?? 'handled'}
          keyboardDismissMode={scrollProps?.keyboardDismissMode ?? (keyboard ? (Platform.OS === 'ios' ? 'interactive' : 'on-drag') : 'none')}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, topPad, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          footerStyle,
        ]}>
          {footer}
        </View>
      ) : null}
    </>
  );

  if (keyboard) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, styles.bg, style]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {inner}
      </KeyboardAvoidingView>
    );
  }

  return <View style={[styles.flex, styles.bg, style]}>{inner}</View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  bg: { backgroundColor: colors.background },
  content: { padding: spacing.gutter, gap: spacing.md },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
});
