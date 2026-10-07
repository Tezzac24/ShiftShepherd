import React, { forwardRef, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, spacing, touchTarget, type } from '../../constants/theme';
import { AppText } from './AppText';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Native ref supports focus, selection and measurement for form recovery. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({
  label, helper, error, multiline, style, containerStyle, disabled, editable,
  accessibilityLabel, accessibilityHint, accessibilityState,
  cursorColor = colors.primary, placeholderTextColor = colors.textMuted,
  selectionColor = colors.primarySoft, onFocus, onBlur, ...rest
}, ref) {
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  const isDisabled = !!disabled || editable === false || !!accessibilityState?.disabled || !!rest['aria-disabled'];
  const busy = accessibilityState?.busy ?? rest['aria-busy'];
  const hint = [accessibilityHint, error ?? helper].filter(Boolean).join('. ');

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        {...rest}
        ref={ref}
        allowFontScaling={rest.allowFontScaling ?? true}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={hint || undefined}
        accessibilityState={{
          ...accessibilityState,
          disabled: isDisabled, busy,
        }}
        aria-disabled={isDisabled}
        aria-busy={busy}
        editable={!isDisabled}
        multiline={multiline}
        cursorColor={cursorColor}
        placeholderTextColor={placeholderTextColor}
        selectionColor={selectionColor}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[
          styles.input,
          { minHeight: Math.max(touchTarget, type.body.lineHeight * fontScale + spacing.md * 2) },
          multiline && styles.multiline,
          focused && styles.focused,
          isDisabled && styles.disabled,
          style,
          error ? styles.inputError : null,
        ]}
      />
      {error ? (
        <AppText variant="small" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="small" tone="secondary">{helper}</AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  input: {
    ...type.body,
    color: colors.text,
    minHeight: touchTarget,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  focused: { borderColor: colors.primary, borderWidth: 2 },
  inputError: { borderColor: colors.danger },
  disabled: { backgroundColor: colors.surfaceRaised, color: colors.textSecondary },
});
