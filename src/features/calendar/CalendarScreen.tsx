import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { ListGroup } from '../../components/ListGroup';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { eventDestination, myServing, scheduleViewFromParam, servingDestination } from '../../lib/appData/presentation';
import { pastEvents, upcomingEvents } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageEvents } from '../../lib/permissions';
import { ScheduleEventRow, ServingRow } from './ScheduleRows';
import { ServingFeedback } from './ServingFeedback';

export default function CalendarScreen() {
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string | string[] }>();
  const selectedView = scheduleViewFromParam(view);
  const user = useRequiredUser();
  const data = useAppData();
  const churchEvents = data.events.filter((event) => event.organisation_id === user.profile.organisation_id);
  const events = upcomingEvents(churchEvents);
  // Finished base events retain the existing history/series semantics.
  const past = pastEvents(churchEvents);
  const serving = myServing(user, data.rotaEntries, data.rotaAssignments, data.teams, data.availabilityResponses);
  const [showPast, setShowPast] = useState(false);
  const servingSettled = !data.rotasLoading && !data.teamsLoading && !data.rotasError && !data.teamsError;

  return (
    <Screen safeTop>
      <OrganisationHeader />
      <PageHeading title="Schedule" description="Church life and the dates you’re serving." />
      <SegmentedControl label="Schedule view" value={selectedView} options={[
        { value: 'events', label: 'Church events' },
        { value: 'serving', label: 'My serving' },
      ]} onChange={(value) => router.setParams({ view: value })} />

      {selectedView === 'events' ? <>
        <View style={styles.sectionHeading}>
          <AppText variant="subheading" headingLevel={2} style={styles.headingText}>Upcoming events</AppText>
          {canManageEvents(user) ? <Button title="New event" icon="add-outline" onPress={() => router.push('/events/edit')}
            accessibilityHint="Creates a new church event" /> : null}
        </View>
        {data.eventsError ? <StatePanel compact kind="error" title="Couldn’t load church events" message={data.eventsError}
          action={{ label: 'Retry events', onPress: () => void data.refreshEvents() }} /> : null}
        {events.length ? <ListGroup>{events.map((event) => <ScheduleEventRow key={event.occurrence_id} event={event}
          category={data.categories.find((category) => category.id === event.category_id)}
          onPress={() => router.push(eventDestination(event))} />)}</ListGroup>
          : data.eventsLoading ? <StatePanel kind="loading" title="Loading church events…" />
            : !data.eventsError ? <StatePanel icon="calendar-outline" title="No upcoming events"
              message="When your church adds an event, you’ll find the date and details here." /> : null}
        {past.length > 0 ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Past events, ${past.length}`}
            accessibilityHint={showPast ? 'Hides past events' : 'Shows past events'}
            accessibilityState={{ expanded: showPast }} aria-expanded={showPast}
            onPress={() => setShowPast((current) => !current)}
            style={({ pressed }) => [styles.pastToggle, pressed && styles.pressed]}>
            <AppText variant="label" tone="secondary" style={styles.headingText}>Past events ({past.length})</AppText>
            <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} accessible={false} />
          </Pressable>
          {showPast ? <ListGroup>{past.map((event) => <ScheduleEventRow key={event.id} event={event}
            category={data.categories.find((category) => category.id === event.category_id)}
            onPress={() => router.push(eventDestination(event))} />)}</ListGroup> : null}
        </> : null}
      </> : <>
        {serving.length > 0 ? <AppText tone="secondary">Your upcoming serving dates in this church. Open a date to confirm or update your availability.</AppText> : null}
        <ServingFeedback hasContent={serving.length > 0} />
        {serving.length ? <ListGroup>{serving.map((duty) => <ServingRow key={duty.entry.id} serving={duty}
          onPress={() => router.push(servingDestination(duty))} />)}</ListGroup>
          : servingSettled ? <StatePanel icon="checkmark-circle-outline" title="No upcoming serving duties"
            message="Serving dates appear here when you’re scheduled. Choose Church events to see what’s happening at church."
            action={{ label: 'View church events', onPress: () => router.setParams({ view: 'events' }) }} /> : null}
      </>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  headingText: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  pastToggle: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    marginTop: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.primarySoft },
});
