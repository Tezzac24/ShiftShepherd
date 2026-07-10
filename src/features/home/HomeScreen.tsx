import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AnnouncementCard } from '../../components/AnnouncementCard';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { AvailabilityBadge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { EventCard } from '../../components/EventCard';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { useAppData } from '../../lib/appData/AppDataContext';
import {
  availabilityForAssignment,
  latestAnnouncement,
  nextEvent,
  nextResponsibility,
  upcomingEvents,
  userName,
  visibleTeams,
} from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { formatClockTime, formatUpcoming, greetingForNow, isWithinNextDays, parseDateKey } from '../../utils/dates';

export default function HomeScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const data = useAppData();

  const firstName = user.profile.full_name.split(' ')[0];
  const event = nextEvent(data.events);
  const announcement = latestAnnouncement(user, data.announcements);
  const responsibility = nextResponsibility(
    user,
    data.rotaEntries,
    data.rotaAssignments,
    data.teams,
  );
  const myTeams = visibleTeams(user, data.teams).filter((t) =>
    user.memberships.some((m) => m.team_id === t.id),
  );
  const thisWeek = upcomingEvents(data.events).filter((e) =>
    isWithinNextDays(new Date(e.start_time), 7),
  );

  const responsibilityStatus = responsibility
    ? (availabilityForAssignment(responsibility.assignment.id, data.availabilityResponses)
        ?.status ?? 'not_responded')
    : undefined;

  return (
    <Screen safeTop>
      {/* Greeting */}
      <View style={styles.greetingRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="title">
            {greetingForNow()}, {firstName}
          </AppText>
          <AppText tone="secondary">{data.organisation.name}</AppText>
        </View>
        <Avatar name={user.profile.full_name} uri={data.getAvatarUri(user.profile)} size={48} />
      </View>

      {/* 1. Latest announcement */}
      <SectionHeader
        title="Latest Announcement"
        actionLabel="See all"
        onAction={() => router.push('/announcements')}
      />
      {announcement ? (
        <AnnouncementCard
          announcement={announcement}
          authorName={userName(data.users, announcement.created_by)}
          teamName={
            announcement.team_id
              ? data.teams.find((t) => t.id === announcement.team_id)?.name
              : undefined
          }
          imageUri={data.getAnnouncementImageUri(announcement)}
          onPress={() =>
            router.push({ pathname: '/announcements/[id]', params: { id: announcement.id } })
          }
        />
      ) : data.announcementsLoading ? (
        // Live mode: announcements are still on their way from the server.
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="secondary">Loading announcements…</AppText>
          </View>
        </Card>
      ) : data.announcementsError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load announcements"
          message={data.announcementsError}
        />
      ) : (
        <EmptyState
          icon="megaphone-outline"
          title="No announcements yet"
          message="There are no announcements yet. Important updates will appear here."
        />
      )}

      {/* 2. Next upcoming event */}
      <SectionHeader
        title="Next Upcoming Event"
        actionLabel="See calendar"
        onAction={() => router.push('/(tabs)/calendar')}
      />
      {event ? (
        <EventCard
          hero
          event={event}
          category={data.categories.find((c) => c.id === event.category_id)}
          onPress={() =>
            router.push({
              pathname: '/events/[id]',
              params: { id: event.id, occurrenceStart: event.start_time },
            })
          }
        />
      ) : data.eventsLoading ? (
        // Live mode: events are still on their way from the server.
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="secondary">Loading events…</AppText>
          </View>
        </Card>
      ) : data.eventsError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load events"
          message={data.eventsError}
        />
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="No upcoming events"
          message="There are no upcoming events right now."
        />
      )}

      {/* 3. Next responsibility */}
      <SectionHeader title="Your Next Responsibility" />
      {responsibility ? (
        <Card
          onPress={() =>
            router.push({
              pathname: '/teams/[teamId]/rota/[entryId]',
              params: {
                teamId: responsibility.team.id,
                entryId: responsibility.entry.id,
              },
            })
          }
          accessibilityLabel={`Your next responsibility: ${responsibility.assignment.role_name} for ${responsibility.team.name}`}
          accessibilityHint="Opens the rota details where you can confirm availability"
        >
          <View style={styles.topRow}>
            <AppText variant="label" tone="primary">
              {formatUpcoming(parseDateKey(responsibility.entry.date))}
              {responsibility.entry.time
                ? ` · ${formatClockTime(responsibility.entry.time)}`
                : ''}
            </AppText>
            {responsibilityStatus ? <AvailabilityBadge status={responsibilityStatus} /> : null}
          </View>
          <AppText variant="subheading">
            {responsibility.assignment.role_name} — {responsibility.team.name}
          </AppText>
          <AppText tone="secondary">{responsibility.entry.title}</AppText>
          {responsibilityStatus === 'not_responded' ? (
            <View style={styles.hintRow}>
              <Ionicons name="hand-left-outline" size={18} color={colors.accent} />
              <AppText variant="small" style={{ color: colors.accent }}>
                Tap to confirm your availability
              </AppText>
            </View>
          ) : null}
        </Card>
      ) : data.rotasLoading || data.teamsLoading ? (
        // Live mode: responsibilities need the rota and the teams directory.
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="secondary">Loading your rota…</AppText>
          </View>
        </Card>
      ) : data.rotasError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load your rota"
          message={data.rotasError}
        />
      ) : (
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing assigned"
          message="You do not have any upcoming team responsibilities."
        />
      )}

      {/* My teams preview */}
      <SectionHeader
        title="Your Teams"
        actionLabel="See all"
        onAction={() => router.push('/(tabs)/teams')}
      />
      {myTeams.length > 0 ? (
        myTeams.map((team) => (
          <Card
            key={team.id}
            onPress={() => router.push({ pathname: '/teams/[teamId]', params: { teamId: team.id } })}
            accessibilityLabel={`Open ${team.name} team space`}
            style={styles.teamCard}
          >
            <View style={styles.teamRow}>
              <Avatar name={team.name} size={40} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{team.name}</AppText>
                <AppText variant="small" tone="secondary" numberOfLines={1}>
                  {team.description}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </View>
          </Card>
        ))
      ) : data.teamsLoading ? (
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="secondary">Loading your teams…</AppText>
          </View>
        </Card>
      ) : (
        <EmptyState
          icon="people-outline"
          title="No teams yet"
          message="You are not part of any team yet. Your teams will appear here."
        />
      )}

      {/* Coming up this week */}
      <SectionHeader title="Coming Up This Week" />
      {thisWeek.length > 0 ? (
        thisWeek.map((e) => (
          <Card
            key={e.occurrence_id}
            onPress={() =>
              router.push({
                pathname: '/events/[id]',
                params: { id: e.id, occurrenceStart: e.start_time },
              })
            }
            accessibilityLabel={`${e.title}, ${formatUpcoming(new Date(e.start_time))}`}
            style={styles.weekCard}
          >
            <View style={styles.teamRow}>
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{e.title}</AppText>
                <AppText variant="small" tone="secondary">
                  {formatUpcoming(new Date(e.start_time))}
                </AppText>
              </View>
            </View>
          </Card>
        ))
      ) : data.eventsLoading ? (
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="secondary">Loading events…</AppText>
          </View>
        </Card>
      ) : (
        <EmptyState
          icon="sunny-outline"
          title="A quiet week"
          message="There are no events in the next seven days."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  teamCard: { paddingVertical: spacing.md },
  weekCard: { paddingVertical: spacing.md },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
