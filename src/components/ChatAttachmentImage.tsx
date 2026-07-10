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
          { width, height },
          isMine ? styles.fallbackMine : styles.fallbackTheirs,
        ]}
        accessibilityLabel="Photo unavailable"
      >
        <Ionicons
          name="image-outline"
          size={30}
          color={isMine ? colors.white : colors.textMuted}
        />
        <AppText
          variant="small"
          style={isMine ? styles.fallbackTextMine : undefined}
          tone={isMine ? undefined : 'muted'}
        >
          Photo unavailable
        </AppText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width, height, borderRadius: radius.md }}
      contentFit="cover"
      transition={150}
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
  fallbackMine: { backgroundColor: 'rgba(255,255,255,0.16)' },
  fallbackTheirs: { backgroundColor: colors.background },
  fallbackTextMine: { color: colors.white },
});
