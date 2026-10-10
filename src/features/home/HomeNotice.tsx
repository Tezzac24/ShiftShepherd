import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../../../constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AnnouncementImage } from '../../components/AnnouncementImage';
import { AppText } from '../../components/AppText';
import { Announcement } from '../../types';
import { formatRelative } from '../../utils/dates';
import { announcementAccentColor } from '../announcements/announcementAccent';

export function HomeNotice({ announcement, authorName, teamName, imageUri, onPress }: {
  announcement: Announcement; authorName: string; teamName?: string; imageUri?: string; onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const accentColor = announcementAccentColor(announcement.team_id ? teamName : undefined);
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`Announcement: ${announcement.title}. ${teamName ?? (announcement.team_id ? 'Team announcement' : 'Church announcement')}. ${formatRelative(announcement.created_at)}${announcement.pinned ? '. Pinned' : ''}`}
      accessibilityHint="Opens the full announcement"
      style={({ pressed }) => [styles.notice,
        { borderLeftColor: accentColor },
        pressed && styles.pressed,
      ]}>
      <View style={styles.metadata}>
        <AppText variant="small" tone="secondary" style={styles.context}>
          {teamName ?? (announcement.team_id ? 'Team announcement' : 'Church announcement')} · {formatRelative(announcement.created_at)}
        </AppText>
        {announcement.pinned ? <Ionicons name="pin" size={20} color={accentColor} accessible={false}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden /> : null}
      </View>
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  notice: { gap: spacing.sm, padding: spacing.lg, borderLeftWidth: spacing.xs, borderLeftColor: colors.accent, borderRadius: radius.sm, backgroundColor: colors.surface },
  metadata: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  context: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: colors.surfaceRaised },
  read: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
});
