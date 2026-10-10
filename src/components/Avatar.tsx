import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { avatarColors, radius, spacing } from '../../constants/theme';
import { AppText } from './AppText';

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
  return avatarColors[hash % avatarColors.length];
}

export function Avatar({
  name,
  uri,
  size = 44,
  decorative = false,
}: {
  name: string;
  /** Optional photo (e.g. a signed avatar URL). Falls back to initials. */
  uri?: string | null;
  size?: number;
  decorative?: boolean;
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
          minWidth: size,
          minHeight: size,
          borderRadius: radius.pill,
          padding: showImage ? 0 : spacing.xs,
          backgroundColor: colorFor(name),
        },
      ]}
      accessibilityLabel={name}
      accessibilityRole="image"
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      aria-hidden={decorative}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={0}
          onError={() => setFailed(true)}
          accessible={false}
        />
      ) : (
        <AppText
          variant={size >= 56 ? 'heading' : 'label'}
          tone="inverse"
          accessibilityRole="text"
          style={{ fontWeight: '700' }}
        >
          {initials(name)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, alignSelf: 'center' },
});
