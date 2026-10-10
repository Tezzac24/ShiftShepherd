import React from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { formatTime } from '../utils/dates';
import { AppText } from './AppText';
import { ChatAttachmentImage } from './ChatAttachmentImage';

interface MessageBubbleProps {
  body: string;
  senderName: string;
  createdAt: string;
  isMine: boolean;
  hasImage?: boolean;
  imageUri?: string | null;
}

export function MessageBubble({
  body,
  senderName,
  createdAt,
  isMine,
  hasImage = false,
  imageUri,
}: MessageBubbleProps) {
  const styles = useThemedStyles(createStyles);
  const caption = body.trim();
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
        <AppText variant="label" tone="primary">{isMine ? 'You' : senderName}</AppText>
        {hasImage ? <ChatAttachmentImage uri={imageUri} isMine={isMine} /> : null}
        {caption ? (
          <AppText>{caption}</AppText>
        ) : null}
        <AppText
          variant="small"
          style={styles.time}
          tone="muted"
        >
          {formatTime(createdAt)}
        </AppText>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: spacing.xs },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '90%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  mine: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    borderBottomRightRadius: radius.sm,
  },
  theirs: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  time: { alignSelf: 'flex-end' },
});
