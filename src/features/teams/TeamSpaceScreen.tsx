import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AnnouncementCard } from '../../components/AnnouncementCard';
import { AppText } from '../../components/AppText';
import { Badge, CountBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { RotaEntryCard } from '../../components/RotaEntryCard';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { useAppData } from '../../lib/appData/AppDataContext';
import {
  assignmentsForEntry,
  availabilityForAssignment,
  nextActiveRotaEntryForTeam,
  selectionsForEntry,
  teamAnnouncements,
  teamMembers,
  userName,
} from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canCreateTeamAnnouncements,
  canManageTeamRota,
  canViewTeam,
} from '../../lib/permissions';

/**
 * Generic team space. The Choir team gets extra choir tools (song database,
 * selected songs) layered on top of the same screen.
 */
export default function TeamSpaceScreen() {
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  const data = useAppData();

  const team = data.teams.find((t) => t.id === teamId);

  // Live mode: the directory may still be loading (or have failed) — don't
  // flash "Team not found" while the team is simply on its way.
  if (!team && data.teamsLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Team' }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading your team…</AppText>
        </View>
      </Screen>
    );
  }
  if (!team && data.teamsError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Team' }} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load this team"
          message={data.teamsError}
        />
        <Button
          title="Try Again"
          variant="secondary"
          icon="refresh-outline"
          onPress={() => void data.refreshTeams()}
        />
      </Screen>
    );
  }

  if (!team || !canViewTeam(user, team.id)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Team' }} />
        <EmptyState
          icon="lock-closed-outline"
          title={team ? 'No permission' : 'Team not found'}
          message={
            team
              ? 'You do not have permission to view this team.'
              : 'This team may have been removed.'
          }
        />
      </Screen>
    );
  }

  const isChoir = team.type === 'choir';
  const isLeader = canManageTeamRota(user, team.id);
  const nextEntry = nextActiveRotaEntryForTeam(team.id, data.rotaEntries);
  const announcements = teamAnnouncements(team.id, data.announcements).slice(0, 2);
  const members = teamMembers(team.id, data.memberships, data.users);
  const unread = data.unreadByTeam[team.id] ?? 0;

  const myAssignment = nextEntry
    ? assignmentsForEntry(nextEntry.id, data.rotaAssignments).find(
        (a) => a.user_id === user.profile.id,
      )
    : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: team.name }} />

      <View style={styles.header}>
        <AppText variant="title">{team.name}</AppText>
        <AppText tone="secondary">{team.description}</AppText>
        <View style={styles.memberRow}>
          {members.map(({ profile, membership }) => (
            <Badge
              key={profile.id}
              label={
                membership.role === 'team_leader'
                  ? `${profile.full_name.split(' ')[0]} (Leader)`
                  : profile.full_name.split(' ')[0]
              }
              tone={membership.role === 'team_leader' ? 'accent' : 'neutral'}
            />
          ))}
        </View>
      </View>

      {/* Next on rota */}
      <SectionHeader
        title="Next on the Rota"
        actionLabel="Full rota"
        onAction={() =>
          router.push({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } })
        }
      />
      {nextEntry ? (
        <RotaEntryCard
          entry={nextEntry}
          assignmentSummary={
            myAssignment
              ? `You: ${myAssignment.role_name}`
              : `${assignmentsForEntry(nextEntry.id, data.rotaAssignments).length} people assigned`
          }
          myStatus={
            myAssignment
              ? (availabilityForAssignment(myAssignment.id, data.availabilityResponses)?.status ??
                'not_responded')
              : undefined
          }
          songCount={
            isChoir ? selectionsForEntry(nextEntry.id, data.songSelections).length : undefined
          }
          onPress={() =>
            router.push({
              pathname: '/teams/[teamId]/rota/[entryId]',
              params: { teamId: team.id, entryId: nextEntry.id },
            })
          }
        />
      ) : data.rotasLoading ? (
        // Live mode: the rota is still on its way from the server.
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <AppText tone="secondary">Loading the rota…</AppText>
        </View>
      ) : data.rotasError ? (
        <>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load the rota"
            message={data.rotasError}
          />
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshRotas()}
          />
        </>
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="No rota entries"
          message="No rota entries have been added for this team yet."
        />
      )}

      {/* Shortcuts */}
      <SectionHeader title="Team Areas" />
      <View style={styles.shortcuts}>
        <ListRow
          icon="calendar-outline"
          title="Team Rota"
          subtitle="Dates, roles and availability"
          onPress={() =>
            router.push({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } })
          }
        />
        <ListRow
          icon="chatbubbles-outline"
          title="Team Chat"
          subtitle="Talk with your team"
          right={<CountBadge count={unread} />}
          onPress={() =>
            router.push({ pathname: '/teams/[teamId]/chat', params: { teamId: team.id } })
          }
        />
        {isChoir ? (
          <ListRow
            icon="musical-notes-outline"
            title="Song Database"
            subtitle={`${data.songs.length} songs — browse, add and edit`}
            onPress={() =>
              router.push({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id } })
            }
          />
        ) : null}
        <ListRow
          icon="folder-open-outline"
          title="Team Resources"
          subtitle="Coming soon — documents and links"
          onPress={undefined}
          showChevron={false}
        />
      </View>

      {/* Team announcements */}
      <SectionHeader title="Team Announcements" actionLabel={undefined} />
      {announcements.length > 0 ? (
        announcements.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            authorName={userName(data.users, a.created_by)}
            onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: a.id } })}
          />
        ))
      ) : data.announcementsLoading ? (
        <EmptyState
          icon="megaphone-outline"
          title="Loading announcements…"
          message="Just a moment while we fetch the latest announcements."
        />
      ) : (
        <EmptyState
          icon="megaphone-outline"
          title="No team announcements"
          message="There are no announcements for this team yet."
        />
      )}

      {/* Leader actions */}
      {isLeader ? (
        <>
          <SectionHeader title="Leader Actions" />
          <View style={styles.actions}>
            <Button
              title="Add Rota Entry"
              icon="add-circle-outline"
              onPress={() =>
                router.push({ pathname: '/teams/[teamId]/rota/edit', params: { teamId: team.id } })
              }
            />
            {isChoir ? (
              <Button
                title="Plan the Month Ahead"
                variant="secondary"
                icon="calendar-number-outline"
                onPress={() =>
                  router.push({
                    pathname: '/teams/[teamId]/rota/plan-month',
                    params: { teamId: team.id },
                  })
                }
              />
            ) : null}
            {canCreateTeamAnnouncements(user, team.id) ? (
              <Button
                title="New Team Announcement"
                variant="secondary"
                icon="megaphone-outline"
                onPress={() =>
                  router.push({ pathname: '/announcements/edit', params: { teamId: team.id } })
                }
              />
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  header: { gap: spacing.xs },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  shortcuts: { gap: spacing.sm },
  actions: { gap: spacing.sm },
});
