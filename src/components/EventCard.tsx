import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { categoryColors, colors, spacing } from '../../constants/theme';
import { Event, EventCategory } from '../types';
import { formatTime, formatUpcoming } from '../utils/dates';
import { recurrenceLabelForEvent } from '../utils/recurrence';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { Card } from './Card';

interface EventCardProps {
  event: Event;
  category?: EventCategory;
  onPress: () => void;
  /** Larger emphasis for the Home "next event" card. */
  hero?: boolean;
}

export function EventCard({ event, category, onPress, hero }: EventCardProps) {
  const cat = category ? categoryColors[category.name] : undefined;
  const start = new Date(event.start_time);
  const recurrenceLabel = recurrenceLabelForEvent(event);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${event.title}, ${formatUpcoming(start)} at ${formatTime(event.start_time)}`}
      accessibilityHint="Opens the event details"
    >
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          {category ? <Badge label={category.name} bg={cat?.bg} fg={cat?.fg} /> : null}
        </View>
        <AppText variant="label" tone="primary">
          {formatUpcoming(start)}
        </AppText>
      </View>
      <AppText variant={hero ? 'heading' : 'subheading'}>{event.title}</AppText>
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
        <AppText variant="small" tone="secondary">
          {formatTime(event.start_time)} – {formatTime(event.end_time)}
        </AppText>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
        <AppText variant="small" tone="secondary">
          {event.location}
        </AppText>
      </View>
      {recurrenceLabel ? (
        <View style={styles.metaRow}>
          <Ionicons name="repeat-outline" size={18} color={colors.textSecondary} />
          <AppText variant="small" tone="secondary">
            {recurrenceLabel}
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
  badgeRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
