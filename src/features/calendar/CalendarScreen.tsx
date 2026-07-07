import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { EventCard } from '../../components/EventCard';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { upcomingEvents } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageEvents } from '../../lib/permissions';

export default function CalendarScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const data = useAppData();

  const events = upcomingEvents(data.events);

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

      {events.length > 0 ? (
        events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            category={data.categories.find((c) => c.id === event.category_id)}
            onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })}
          />
        ))
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="No upcoming events"
          message="There are no upcoming events right now."
        />
      )}
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
});
