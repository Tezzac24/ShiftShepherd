import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
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

export function Avatar({
  name,
  uri,
  size = 44,
}: {
  name: string;
  /** Optional photo (e.g. a signed avatar URL). Falls back to initials. */
  uri?: string | null;
  size?: number;
}) {
  // A photo that fails to load (expired signed URL, offline cold cache)
  // quietly falls back to initials; a new uri gets a fresh chance.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const showImage = !!uri && !failed;
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
      {showImage ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={100}
          onError={() => setFailed(true)}
          accessibilityLabel={`${name}'s photo`}
        />
      ) : (
        <AppText
          variant={size >= 56 ? 'heading' : 'label'}
          tone="inverse"
          style={{ fontWeight: '700' }}
        >
          {initials(name)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
