import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ImageStyle, StyleProp } from 'react-native';

import { radius } from '../../constants/theme';

/**
 * An announcement's optional image (card preview or full detail view).
 * Renders nothing when there is no uri or the image fails to load (expired
 * signed URL, offline cold cache) — the announcement text always stays
 * readable on its own.
 */
export function AnnouncementImage({
  uri,
  height = 160,
  accessibilityLabel = 'Announcement image',
  style,
}: {
  /** A display URL (e.g. a signed announcement-image URL). */
  uri?: string | null;
  height?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ImageStyle>;
}) {
  // A new uri gets a fresh chance after a failure.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!uri || failed) return null;
  return (
    <Image
      source={{ uri }}
      style={[{ width: '100%', height, borderRadius: radius.md }, style]}
      contentFit="cover"
      transition={150}
      onError={() => setFailed(true)}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
