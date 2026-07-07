import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../../constants/theme';

interface ScreenProps {
  children: React.ReactNode;
  /** Scrollable content (default true). Set false for lists/chat that manage their own scrolling. */
  scroll?: boolean;
  /** Add safe-area top padding (for screens without a native header). */
  safeTop?: boolean;
  /** Wrap in KeyboardAvoidingView (for forms/chat). */
  keyboard?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

export function Screen({
  children,
  scroll = true,
  safeTop = false,
  keyboard = false,
  style,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad = safeTop ? { paddingTop: insets.top + spacing.md } : null;

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, topPad, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, topPad, contentStyle]}>{children}</View>
  );

  if (keyboard) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, styles.bg, style]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {inner}
      </KeyboardAvoidingView>
    );
  }

  return <View style={[styles.flex, styles.bg, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bg: { backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.md,
  },
});
