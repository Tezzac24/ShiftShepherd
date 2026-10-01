import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing, radius, touchTarget } from '../../constants/theme';
import { AppText } from './AppText';
import { ModalSurface } from './ModalSurface';
import { TextField } from './TextField';

export interface SelectOption<T extends string = string> {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
}

interface SelectFieldProps<T extends string> {
  label: string;
  placeholder?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  helper?: string;
  error?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

/** An explicit, labelled picker with one selected option and a safe exit. */
export function SelectField<T extends string>({
  label, placeholder = 'Choose…', value, options, onChange, disabled = false,
  helper, error, searchable = false, searchPlaceholder = 'Search options',
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const triggerRef = useRef<View>(null);
  const selected = options.find((option) => option.value === value);
  const search = query.trim().toLocaleLowerCase();
  const visibleOptions = search
    ? options.filter((option) => [option.label, option.description].filter(Boolean).join(' ').toLocaleLowerCase().includes(search))
    : options;
  const close = () => setOpen(false);

  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={label + ': ' + (selected?.label ?? placeholder)}
        accessibilityHint={error ?? helper}
        accessibilityState={{ expanded: open && !disabled, disabled }}
        aria-expanded={open && !disabled}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={disabled ? undefined : () => { setQuery(''); setOpen(true); }}
        style={({ pressed }) => [
          styles.field, disabled && styles.disabled, error ? styles.error : null,
          pressed && styles.pressed,
        ]}
      >
        <AppText tone={selected ? 'default' : 'muted'} style={styles.value}>
          {selected?.label ?? placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={22} color={colors.textSecondary} accessible={false} />
      </Pressable>
      {error ? (
        <AppText variant="small" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</AppText>
      ) : helper ? (
        <AppText variant="small" tone="secondary">{helper}</AppText>
      ) : null}

      <ModalSurface visible={open && !disabled} title={label} onClose={close} scroll={false} returnFocusRef={triggerRef}>
        {searchable ? (
          <View style={styles.search}>
            <TextField
              accessibilityLabel={'Search ' + label.toLocaleLowerCase()}
              placeholder={searchPlaceholder}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>
        ) : null}
        <FlatList
          data={visibleOptions}
          keyExtractor={(option) => option.value}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.options}
          ListEmptyComponent={<AppText tone="secondary" style={styles.empty}>No options found.</AppText>}
          renderItem={({ item }) => {
            const checked = item.value === value;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={[item.label, item.description].filter(Boolean).join('. ')}
                accessibilityState={{ selected: checked, checked, disabled: disabled || !!item.disabled }}
                aria-checked={checked}
                aria-disabled={disabled || !!item.disabled}
                disabled={disabled || item.disabled}
                onPress={disabled || item.disabled ? undefined : () => { onChange(item.value); close(); }}
                style={({ pressed }) => [styles.option, checked && styles.selected, pressed && styles.pressed]}
              >
                <View style={styles.value}>
                  <AppText variant={checked ? 'bodyBold' : 'body'} tone={item.disabled ? 'muted' : 'default'}>
                    {item.label}
                  </AppText>
                  {item.description ? <AppText variant="small" tone="secondary">{item.description}</AppText> : null}
                </View>
                <Ionicons
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24} color={checked ? colors.primary : colors.borderStrong} accessible={false}
                />
              </Pressable>
            );
          }}
        />
      </ModalSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: {
    minHeight: touchTarget, borderWidth: 1.5, borderColor: colors.borderStrong,
    borderRadius: radius.md, backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  value: { flex: 1, gap: spacing.xs },
  disabled: { backgroundColor: colors.surfaceRaised },
  error: { borderColor: colors.danger },
  search: { padding: spacing.gutter, paddingBottom: spacing.sm },
  list: { flexGrow: 0, flexShrink: 1 },
  options: { paddingTop: spacing.sm },
  empty: { padding: spacing.gutter },
  option: {
    minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.gutter, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  selected: { backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.surfaceRaised },
});
