import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../constants/theme';
import { AppText } from './AppText';

const palette = [colors.primary, colors.accent, '#1F6B5C', '#9A6B15', '#8A4FB0', '#24499A'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return palette[hash % palette.length];
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colorFor(name),
        },
      ]}
      accessibilityLabel={name}
    >
      <AppText
        variant={size >= 56 ? 'heading' : 'label'}
        tone="inverse"
        style={{ fontWeight: '700' }}
      >
        {initials(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
