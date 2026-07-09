import React from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';

import { colors, radius, spacing, touchTarget, type } from '../../constants/theme';
import { AppText } from './AppText';

interface TextFieldProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  helper,
  error,
  multiline,
  style,
  containerStyle,
  disabled,
  editable,
  accessibilityLabel,
  accessibilityState,
  cursorColor,
  placeholderTextColor,
  selectionColor,
  ...rest
}: TextFieldProps) {
  const isDisabled = !!disabled || editable === false;
  const paperCursorColor = typeof cursorColor === 'string' ? cursorColor : colors.primary;
  const paperPlaceholderColor =
    typeof placeholderTextColor === 'string' ? placeholderTextColor : colors.textMuted;
  const paperSelectionColor =
    typeof selectionColor === 'string' ? selectionColor : colors.primarySoft;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <PaperTextInput
        mode="outlined"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{
          ...accessibilityState,
          disabled: isDisabled || accessibilityState?.disabled,
        }}
        activeOutlineColor={error ? colors.danger : colors.primary}
        cursorColor={paperCursorColor}
        dense={false}
        disabled={isDisabled}
        editable={!isDisabled}
        error={!!error}
        multiline={multiline}
        outlineColor={error ? colors.danger : colors.borderStrong}
        placeholderTextColor={paperPlaceholderColor}
        selectionColor={paperSelectionColor}
        textColor={colors.text}
        contentStyle={[styles.content, multiline && styles.multilineContent]}
        outlineStyle={[styles.outline, error ? styles.inputError : null]}
        style={[
          styles.input,
          multiline && styles.multiline,
          isDisabled ? styles.disabled : null,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="small" tone="muted">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  input: {
    minHeight: touchTarget,
    backgroundColor: colors.card,
    fontSize: type.body.fontSize,
  },
  content: {
    color: colors.text,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    paddingHorizontal: spacing.md,
  },
  outline: {
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  multiline: {
    minHeight: 120,
  },
  multilineContent: {
    textAlignVertical: 'top',
    paddingVertical: spacing.md,
  },
  inputError: { borderColor: colors.danger },
  disabled: { opacity: 0.55 },
});
