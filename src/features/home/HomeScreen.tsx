import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { sumUnread } from '../../lib/appData/chatUnread';
import { eventDestination, homeEventPreview, myServing, scheduleDestination, servingDestination } from '../../lib/appData/presentation';
import { latestAnnouncement, upcomingEvents, userName, visibleTeams } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { formatFullDate, greetingForNow } from '../../utils/dates';
import { useCurrentTime } from '../../utils/useCurrentTime';
import { accessibleAnnouncements } from '../announcements/announcementPresentation';
import { ScheduleEventRow } from '../calendar/ScheduleRows';
import { ServingFeedback } from '../calendar/ServingFeedback';
import { EventFocus, ServingFocus } from './HomeFocus';
import { HomeNotice } from './HomeNotice';

export default function HomeScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const data = useAppData();
  const now = useCurrentTime();
  const firstName = user.profile.full_name.trim().split(/\s+/)[0];
  const serving = myServing(user, data.rotaEntries, data.rotaAssignments, data.teams, data.availabilityResponses);
  const duty = serving[0];
  const servingSettled = !data.rotasLoading && !data.teamsLoading && !data.rotasError && !data.teamsError;
  const noDuty = !duty && servingSettled;
  const events = upcomingEvents(data.events.filter((event) => event.organisation_id === user.profile.organisation_id));
  const focusedEvent = noDuty ? events[0] : undefined;
  const preview = homeEventPreview(events, focusedEvent);
  const announcement = latestAnnouncement(user, accessibleAnnouncements(user, data.announcements, data.archivedTeams));
  const unread = sumUnread(data.unreadByTeam, visibleTeams(user, data.teams).map((team) => team.id));
  const openSchedule = () => router.push(scheduleDestination('events'));
  const openServing = () => router.push(scheduleDestination('serving'));

  return (
    <Screen safeTop contentStyle={styles.content}>
      <OrganisationHeader />
      <View>
        <PageHeading title={`${greetingForNow(now)}, ${firstName}`} eyebrow={formatFullDate(now)} />

      {!noDuty ? (
        <View style={styles.section}>
          <SectionHeader title="Next serving" actionLabel="My serving" onAction={openServing} />
          {duty ? <ServingFocus serving={duty} onPress={() => router.push(servingDestination(duty))} /> : null}
          <ServingFeedback hasContent={!!duty} compact />
        </View>
      ) : (
        <View style={styles.section}>
          <SectionHeader title="Coming up next" actionLabel="Schedule" onAction={openSchedule} />
          {data.eventsError ? <StatePanel compact kind="error" title="Couldn’t load church events" message={data.eventsError}
            action={{ label: 'Retry events', onPress: () => void data.refreshEvents() }} /> : null}
          {focusedEvent ? <EventFocus event={focusedEvent} onPress={() => router.push(eventDestination(focusedEvent))} />
            : data.eventsLoading ? <StatePanel compact kind="loading" title="Loading church events…" />
              : !data.eventsError ? <StatePanel compact title="No upcoming church events" message="New dates will appear in Schedule."
                action={{ label: 'Open schedule', onPress: openSchedule }} /> : null}
          <View style={styles.noDuty}>
            <AppText variant="small" tone="secondary" style={styles.noDutyText}>No upcoming serving duties.</AppText>
            <Button title="My serving" variant="ghost" onPress={openServing} style={styles.quietAction} />
          </View>
        </View>
      )}
      </View>

      {unread > 0 ? <ListRow icon="chatbubbles-outline" title={`${unread} unread ${unread === 1 ? 'message' : 'messages'}`}
        subtitle="Open Messages" onPress={() => router.push('/(tabs)/messages')}
        accessibilityLabel={`Messages, ${unread} unread`} /> : null}

      <View style={styles.section}>
        <SectionHeader title="Announcements" actionLabel="View all" actionAccessibilityLabel="View all announcements" onAction={() => router.push('/announcements')} />
        {data.announcementsError ? <StatePanel compact kind="error" title="Couldn’t load announcements" message={data.announcementsError}
          action={{ label: 'Retry announcements', onPress: () => void data.refreshAnnouncements() }} /> : null}
        {announcement ? <HomeNotice announcement={announcement}
          authorName={userName(data.users, announcement.created_by)}
          teamName={announcement.team_id ? data.teams.find((team) => team.id === announcement.team_id)?.name : undefined}
          imageUri={data.getAnnouncementImageUri(announcement)}
          onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: announcement.id } })} />
          : data.announcementsLoading ? <StatePanel compact kind="loading" title="Loading announcements…" />
            : !data.announcementsError ? <AppText tone="secondary">No announcements yet. Updates from your church will appear here.</AppText> : null}
      </View>

      {(preview.length > 0 || !noDuty) ? (
        <View style={styles.section}>
          <SectionHeader title="Next church events" actionLabel="All events" onAction={openSchedule} />
          {data.eventsError && !noDuty ? <StatePanel compact kind="error" title="Couldn’t load church events" message={data.eventsError}
            action={{ label: 'Retry events', onPress: () => void data.refreshEvents() }} /> : null}
          {preview.length > 0 ? <ListGroup>{preview.map((event) => <ScheduleEventRow key={event.occurrence_id} event={event}
            category={data.categories.find((category) => category.id === event.category_id)}
            onPress={() => router.push(eventDestination(event))} />)}</ListGroup>
            : !noDuty && data.eventsLoading ? <StatePanel compact kind="loading" title="Loading church events…" />
              : !noDuty && !data.eventsError ? <AppText tone="secondary">No upcoming church events. New dates will appear in Schedule.</AppText> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.lg },
  section: { gap: spacing.sm, marginBottom: spacing.sm },
  noDuty: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  noDutyText: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  quietAction: { paddingHorizontal: spacing.sm },
});
