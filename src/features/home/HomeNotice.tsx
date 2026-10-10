import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AnnouncementImage } from '../../components/AnnouncementImage';
import { AppText } from '../../components/AppText';
import { Announcement } from '../../types';
import { formatRelative } from '../../utils/dates';

function teamAccentColor(teamName: string): string {
  // Hash the name into an RGB hex color, consistently across every card.
  let hash = 2166136261;
  for (const character of teamName.trim().toLowerCase()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `#${(hash & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function HomeNotice({ announcement, authorName, teamName, imageUri, onPress }: {
  announcement: Announcement; authorName: string; teamName?: string; imageUri?: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`Announcement: ${announcement.title}. ${teamName ?? (announcement.team_id ? 'Team announcement' : 'Church announcement')}. ${formatRelative(announcement.created_at)}`}
      accessibilityHint="Opens the full announcement"
      style={({ pressed }) => [styles.notice,
        { borderLeftColor: announcement.team_id && teamName ? teamAccentColor(teamName) : colors.accent },
        pressed && styles.pressed,
      ]}>
      <AppText variant="small" tone="secondary">
        {teamName ?? (announcement.team_id ? 'Team announcement' : 'Church announcement')} · {formatRelative(announcement.created_at)}
      </AppText>
      {announcement.pinned ? <AppText variant="small" tone="accent">Pinned</AppText> : null}
      <AppText variant="subheading">{announcement.title}</AppText>
      <AppText tone="secondary" numberOfLines={2}>{announcement.body}</AppText>
      <AnnouncementImage uri={imageUri} height={120} accessibilityLabel={`Image for ${announcement.title}`} />
      <AppText variant="small" tone="muted">Posted by {authorName}</AppText>
      <View style={styles.read}>
        <AppText variant="label" tone="primary">Read announcement</AppText>
        <Ionicons name="arrow-forward" size={20} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: { gap: spacing.sm, padding: spacing.lg, borderLeftWidth: spacing.xs, borderLeftColor: colors.accent, borderRadius: radius.sm, backgroundColor: colors.surface },
  pressed: { backgroundColor: colors.surfaceRaised },
  read: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
});
