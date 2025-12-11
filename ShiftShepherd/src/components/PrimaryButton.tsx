import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

type Variant = 'primary' | 'secondary';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  style?: ViewStyle;
};

const PrimaryButton = ({ label, onPress, variant = 'primary', style }: Props) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [
      styles.base,
      variant === 'secondary' && styles.secondary,
      pressed && styles.pressed,
      style,
    ]}
  >
    <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#0F6CBD',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: '#F3F4F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C4C6CF',
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryLabel: {
    color: '#111827',
  },
});

export default PrimaryButton;
