import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../constants/theme';
import { AvailabilityStatus, RotaEntry } from '../types';
import { formatClockTime, formatUpcoming, parseDateKey } from '../utils/dates';
import { AppText } from './AppText';
import { AvailabilityBadge } from './Badge';
import { Card } from './Card';

interface RotaEntryCardProps {
  entry: RotaEntry;
  /** e.g. "You: Backup Vocal" or "3 people assigned" */
  assignmentSummary?: string;
  /** Current user's availability for this entry, if assigned. */
  myStatus?: AvailabilityStatus;
  songCount?: number;
  onPress: () => void;
}

export function RotaEntryCard({
  entry,
  assignmentSummary,
  myStatus,
  songCount,
  onPress,
}: RotaEntryCardProps) {
  const date = parseDateKey(entry.date);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${entry.title} on ${formatUpcoming(date)}`}
      accessibilityHint="Opens the rota details"
    >
      <View style={styles.topRow}>
        <AppText variant="label" tone="primary">
          {formatUpcoming(date)}
          {entry.time ? ` · ${formatClockTime(entry.time)}` : ''}
        </AppText>
        {myStatus ? <AvailabilityBadge status={myStatus} /> : null}
      </View>
      <AppText variant="subheading">{entry.title}</AppText>
      {assignmentSummary ? (
        <View style={styles.metaRow}>
          <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
          <AppText variant="small" tone="secondary">
            {assignmentSummary}
          </AppText>
        </View>
      ) : null}
      {songCount !== undefined ? (
        <View style={styles.metaRow}>
          <Ionicons name="musical-notes-outline" size={18} color={colors.textSecondary} />
          <AppText variant="small" tone="secondary">
            {songCount > 0 ? `${songCount} songs selected` : 'No songs selected yet'}
          </AppText>
        </View>
      ) : null}
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
