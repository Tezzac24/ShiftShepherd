import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../constants/theme';
import { AppText } from './AppText';

/** Fixed-aspect chat photo with a calm, layout-stable failure fallback. */
export function ChatAttachmentImage({
  uri,
  isMine = false,
  width = 230,
  height = 170,
  accessibilityLabel = 'Chat photo',
}: {
  uri?: string | null;
  isMine?: boolean;
  width?: number;
  height?: number;
  accessibilityLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  if (!uri || failed) {
    return (
      <View
        style={[
          styles.fallback,
          { width, maxWidth: '100%', aspectRatio: width / height },
          isMine ? styles.fallbackMine : styles.fallbackTheirs,
        ]}
        accessibilityLabel="Photo unavailable"
        accessibilityRole="image"
        accessible
      >
        <Ionicons
          name="image-outline"
          size={30}
          color={colors.textMuted}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        />
        <AppText
          variant="small"
          tone="muted"
        >
          Photo unavailable
        </AppText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width, maxWidth: '100%', aspectRatio: width / height, borderRadius: radius.md }}
      contentFit="cover"
      transition={0}
      onError={() => setFailed(true)}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  fallbackMine: { backgroundColor: colors.surface },
  fallbackTheirs: { backgroundColor: colors.surfaceRaised },
});
