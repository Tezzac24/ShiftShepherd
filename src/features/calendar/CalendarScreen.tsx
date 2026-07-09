import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { EventCard } from '../../components/EventCard';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { pastEvents, upcomingEvents } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageEvents } from '../../lib/permissions';

export default function CalendarScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const data = useAppData();

  const events = upcomingEvents(data.events);
  // Finished events stay available for reference, tucked away below the
  // upcoming list and collapsed by default.
  const past = pastEvents(data.events);
  const [showPast, setShowPast] = useState(false);
  // Live mode only: a first load shows a spinner instead of pretending the
  // list is empty; a failed load offers a retry instead of stale content.
  const loadingFirstTime = data.eventsLoading && events.length === 0;

  return (
    <Screen safeTop>
      <View style={styles.headerRow}>
        <AppText variant="title">Calendar</AppText>
      </View>
      <AppText tone="secondary">Upcoming church events, soonest first.</AppText>

      {canManageEvents(user) ? (
        <Button
          title="New Event"
          icon="add-circle-outline"
          onPress={() => router.push('/events/edit')}
          accessibilityHint="Creates a new church event"
        />
      ) : null}

      {data.eventsError ? (
        <View style={styles.errorBox}>
          <AppText tone="danger" style={styles.errorText}>
            {data.eventsError}
          </AppText>
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshEvents()}
          />
        </View>
      ) : null}

      {loadingFirstTime ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading events…</AppText>
        </View>
      ) : events.length > 0 ? (
        events.map((event) => (
          <EventCard
            key={event.occurrence_id}
            event={event}
            category={data.categories.find((c) => c.id === event.category_id)}
            onPress={() =>
              router.push({
                pathname: '/events/[id]',
                params: { id: event.id, occurrenceStart: event.start_time },
              })
            }
          />
        ))
      ) : data.eventsError ? null : (
        <EmptyState
          icon="calendar-outline"
          title="No upcoming events"
          message="There are no upcoming events right now."
        />
      )}

      {past.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Past events, ${past.length}`}
            accessibilityHint={showPast ? 'Hides past events' : 'Shows past events'}
            accessibilityState={{ expanded: showPast }}
            onPress={() => setShowPast((current) => !current)}
            style={({ pressed }) => [styles.pastToggle, pressed && styles.pressed]}
          >
            <AppText variant="label" tone="secondary">
              Past events ({past.length})
            </AppText>
            <Ionicons
              name={showPast ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
          {showPast
            ? past.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  category={data.categories.find((c) => c.id === event.category_id)}
                  onPress={() =>
                    router.push({
                      pathname: '/events/[id]',
                      params: { id: event.id, occurrenceStart: event.start_time },
                    })
                  }
                />
              ))
            : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -spacing.xs,
  },
  loadingBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  errorBox: { gap: spacing.sm },
  errorText: { textAlign: 'center' },
  pastToggle: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pressed: { opacity: 0.7 },
});
