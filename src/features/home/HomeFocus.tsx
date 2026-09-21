import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { AvailabilityBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ServingSummary } from '../../lib/appData/presentation';
import { Event } from '../../types';
import { formatClockTime, formatTime, formatUpcoming, parseDateKey } from '../../utils/dates';
import { fullScheduleDate, ScheduleDateMarker } from '../calendar/ScheduleRows';

export function ServingFocus({ serving, onPress }: { serving: ServingSummary; onPress: () => void }) {
  const date = parseDateKey(serving.entry.date);
  const when = [formatUpcoming(date), serving.entry.time ? formatClockTime(serving.entry.time) : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.focus}>
      <AppText variant="label" tone="primary">{when}</AppText>
      <AppText variant="heading">{serving.entry.title}</AppText>
      <AppText variant="bodyBold">
        {serving.roleSummary}<AppText tone="secondary"> · {serving.team.name}</AppText>
      </AppText>
      {serving.status !== 'not_responded' ? <AvailabilityBadge status={serving.status} /> : null}
      <Button title={serving.status === 'not_responded' ? 'Confirm availability' : 'View serving details'}
        onPress={onPress} accessibilityHint="Opens this date with all your roles and your availability response" />
    </View>
  );
}

export function EventFocus({ event, onPress }: { event: Event; onPress: () => void }) {
  const date = new Date(event.start_time);
  const time = `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`;
  return (
    <View style={styles.eventFocus}>
      <View style={styles.dateRow}>
        <ScheduleDateMarker date={date} label={`${fullScheduleDate(date)}. ${time}`} decorative={false} />
        <View style={styles.eventDate}>
          <AppText variant="label" tone="primary">{formatUpcoming(date)}</AppText>
          <AppText tone="secondary">{time}</AppText>
        </View>
      </View>
      <AppText variant="heading">{event.title}</AppText>
      {event.location ? <AppText tone="secondary">{event.location}</AppText> : null}
      <Button title="View event" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  focus: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.primarySoft, borderRadius: radius.lg },
  eventFocus: { gap: spacing.md, padding: spacing.gutter, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  eventDate: { flex: 1, gap: spacing.xs },
});
