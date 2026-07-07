import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../constants/theme';
import { Announcement } from '../types';
import { formatRelative } from '../utils/dates';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { Card } from './Card';

interface AnnouncementCardProps {
  announcement: Announcement;
  authorName: string;
  teamName?: string;
  onPress: () => void;
}

export function AnnouncementCard({
  announcement,
  authorName,
  teamName,
  onPress,
}: AnnouncementCardProps) {
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Announcement: ${announcement.title}`}
      accessibilityHint="Opens the full announcement"
    >
      <View style={styles.topRow}>
        <View style={styles.badges}>
          {announcement.pinned ? <Badge label="Pinned" tone="accent" /> : null}
          {teamName ? <Badge label={teamName} tone="primary" /> : null}
        </View>
        <AppText variant="small" tone="muted">
          {formatRelative(announcement.created_at)}
        </AppText>
      </View>
      <AppText variant="subheading">{announcement.title}</AppText>
      <AppText tone="secondary" numberOfLines={2}>
        {announcement.body}
      </AppText>
      <View style={styles.metaRow}>
        <Ionicons name="person-circle-outline" size={18} color={colors.textMuted} />
        <AppText variant="small" tone="muted">
          Posted by {authorName}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badges: { flexDirection: 'row', gap: spacing.sm, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
