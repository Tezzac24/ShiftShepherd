import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ImageStyle, StyleProp, View } from 'react-native';

import { radius } from '../../constants/theme';
import { StatePanel } from './StatePanel';

interface AnnouncementImageProps {
  /** A display URL (e.g. a signed announcement-image URL). */
  uri?: string | null;
  /** Thumbnail height, or the full image's height until its dimensions load. */
  height?: number;
  presentation?: 'thumbnail' | 'full';
  accessibilityLabel?: string;
  style?: StyleProp<ImageStyle>;
}

/**
 * A new URI mounts a fresh image so old loads and failures cannot affect it.
 * Full presentation keeps the whole image readable, including portrait notices.
 */
export function AnnouncementImage({
  uri,
  ...props
}: AnnouncementImageProps) {
  return uri ? <AnnouncementImageSource key={uri} uri={uri} {...props} /> : null;
}

function AnnouncementImageSource({
  uri,
  height = 160,
  presentation = 'thumbnail',
  accessibilityLabel = 'Announcement image',
  style,
}: AnnouncementImageProps & { uri: string }) {
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  if (failed) return <View style={style}><StatePanel compact title="Image unavailable" icon="image-outline" /></View>;
  return (
    <Image
      source={{ uri }}
      style={[{ width: '100%', height, borderRadius: radius.md }, style,
        presentation === 'full' && aspectRatio ? { width: '100%', height: undefined, aspectRatio } : null]}
      contentFit={presentation === 'full' ? 'contain' : 'cover'}
      onLoad={({ source }) => {
        if (!active.current || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0) return;
        setAspectRatio(source.width / source.height);
      }}
      onError={() => { if (active.current) setFailed(true); }}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
