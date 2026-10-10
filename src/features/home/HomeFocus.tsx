import React from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from '../../components/AppText';
import { AvailabilityBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ServingSummary } from '../../lib/appData/presentation';
import { Event } from '../../types';
import { formatClockTime, formatTime, formatUpcoming, parseDateKey } from '../../utils/dates';
import { fullScheduleDate, ScheduleDateMarker } from '../calendar/ScheduleRows';
import { useCurrentTime } from '../../utils/useCurrentTime';
import { servingResponseReminder, servingResponseWindow } from './servingReminder';

export function ServingFocus({ serving, onPress }: { serving: ServingSummary; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const window = servingResponseWindow(serving);
  const now = useCurrentTime(window?.warningAt, window?.expiresAt);
  const reminder = servingResponseReminder(serving, now);
  const date = parseDateKey(serving.entry.date);
  const when = [formatUpcoming(date), serving.entry.time ? formatClockTime(serving.entry.time) : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.focus, reminder && styles.warningFocus]}>
      <AppText variant="label" tone={reminder ? 'warning' : 'secondary'}>{when}</AppText>
      <AppText variant="heading">{serving.entry.title}</AppText>
      <AppText variant="bodyBold">
        {serving.roleSummary}<AppText tone="secondary"> · {serving.team.name}</AppText>
      </AppText>
      {serving.status !== 'not_responded' ? <AvailabilityBadge status={serving.status} /> : null}
      {reminder ? <AppText variant="label" tone="warning" accessibilityLiveRegion="polite">{reminder}</AppText> : null}
      <Button title={serving.status === 'not_responded' ? 'Confirm availability' : 'View serving details'}
        onPress={onPress} accessibilityHint="Opens this date with all your roles and your availability response" />
    </View>
  );
}

export function EventFocus({ event, onPress }: { event: Event; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  focus: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border },
  warningFocus: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  eventFocus: { gap: spacing.md, padding: spacing.gutter, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  eventDate: { flex: 1, gap: spacing.xs },
});
