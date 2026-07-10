import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../constants/theme';
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
  const caption = body.trim();
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
        {!isMine ? (
          <AppText variant="label" style={{ color: colors.accent }}>
            {senderName}
          </AppText>
        ) : null}
        {hasImage ? <ChatAttachmentImage uri={imageUri} isMine={isMine} /> : null}
        {caption ? (
          <AppText style={isMine ? { color: colors.white } : undefined}>{caption}</AppText>
        ) : null}
        <AppText
          variant="small"
          style={[styles.time, isMine ? { color: '#D8E2F7' } : { color: colors.textMuted }]}
        >
          {formatTime(createdAt)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: spacing.xs },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  mine: {
    backgroundColor: colors.primary,
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
