import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AnnouncementCard } from '../../components/AnnouncementCard';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge, CountBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { useConfirm } from '../../components/ConfirmDialog';
import { ListRow } from '../../components/ListRow';
import { RotaEntryCard } from '../../components/RotaEntryCard';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { useToast } from '../../components/Toast';
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
  canManageTeamAvatar,
  canManageTeamLifecycle,
  canCreateTeamAnnouncements,
  canManageTeamRota,
  canViewTeam,
  isChurchAdmin,
  leaveTeamState,
} from '../../lib/permissions';
import { Team } from '../../types';
import { useTeamAvatar } from './useTeamAvatar';

/**
 * Team identity only — no management controls. Authorised leaders/admins get
 * a quiet Team settings action that opens the dedicated settings screen.
 */
export function TeamIdentityHeader({
  team,
  onOpenSettings,
  canOpenSettings,
}: {
  team: Team;
  onOpenSettings?: () => void;
  canOpenSettings?: boolean;
}) {
  const { canManage, avatarUri } = useTeamAvatar(team);
  const showSettings = canOpenSettings ?? canManage;

  return (
    <View style={styles.identityBlock}>
      {showSettings && onOpenSettings ? (
        <View style={styles.settingsActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Team settings"
            accessibilityHint={`Manage the photo and members for ${team.name}`}
            onPress={onOpenSettings}
            style={({ pressed }) => [
              styles.settingsAction,
              pressed && styles.settingsActionPressed,
            ]}
            testID="team-settings-action"
          >
            <Ionicons name="settings-outline" size={18} color={colors.primary} />
            <AppText variant="label" tone="primary">
              Team settings
            </AppText>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.identityHeader}>
        <Avatar name={team.name} uri={avatarUri} size={72} />
        <View style={styles.identityCopy}>
          <AppText variant="title">{team.name}</AppText>
          <AppText tone="secondary">{team.description}</AppText>
        </View>
      </View>
    </View>
  );
}

/**
 * Generic team space. The Choir team gets extra choir tools (song database,
 * selected songs) layered on top of the same screen.
 */
export default function TeamSpaceScreen() {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const team = data.teams.find((t) => t.id === teamId);
  const archivedTeam = data.archivedTeams.find((candidate) => candidate.id === teamId);

  if (archivedTeam) {
    return (
      <Screen>
        <Stack.Screen options={{ title: archivedTeam.name }} />
        <EmptyState
          icon="archive-outline"
          title="Team is archived"
          message="This team is hidden from active areas. A church admin can restore it from Archived teams."
        />
        <Button
          title="View archived teams"
          variant="secondary"
          icon="archive-outline"
          onPress={() => router.replace('/teams/archived')}
        />
      </Screen>
    );
  }

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
  const ownMembership = data.memberships.find(
    (membership) =>
      membership.team_id === team.id && membership.user_id === user.profile.id,
  );
  const currentLeaveState = leaveTeamState(user.profile.id, team.id, data.memberships);

  const myAssignment = nextEntry
    ? assignmentsForEntry(nextEntry.id, data.rotaAssignments).find(
        (a) => a.user_id === user.profile.id,
      )
    : undefined;

  const requestLeave = async () => {
    if (!ownMembership || currentLeaveState !== 'allowed' || confirmingLeave || leaving) return;
    const leadershipCopy =
      ownMembership.role === 'team_leader'
        ? ' You will also stop being a team admin. Another team admin will remain.'
        : '';
    const accessCopy = isChurchAdmin(user)
      ? 'Your team membership will be removed. Your church-admin role, account and organisation access will stay in place.'
      : `You will lose access to ${team.name}'s chat, rota and team updates.`;
    setConfirmingLeave(true);
    let approved = false;
    try {
      approved = await confirm({
        title: `Leave ${team.name}?`,
        message: `${accessCopy}${leadershipCopy} Your church profile and account will not be deleted.`,
        confirmLabel: 'Leave team',
      });
    } finally {
      setConfirmingLeave(false);
    }
    if (!approved) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await data.leaveTeam(team.id);
      showToast(`You left ${team.name}.`);
      router.replace('/(tabs)/teams');
    } catch (error) {
      setLeaveError(
        error instanceof Error
          ? error.message
          : "We couldn't leave this team right now. Please try again.",
      );
    } finally {
      setLeaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: team.name }} />

      <View style={styles.header}>
        <TeamIdentityHeader
          team={team}
          canOpenSettings={
            canManageTeamLifecycle(user) || canManageTeamAvatar(user, team.id)
          }
          onOpenSettings={() =>
            router.push({ pathname: '/teams/[teamId]/settings', params: { teamId: team.id } })
          }
        />
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
            isChoir && !data.songsLoading && !data.songsError
              ? selectionsForEntry(nextEntry.id, data.songSelections).length
              : undefined
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
            subtitle={
              data.songsLoading
                ? 'Loading songs...'
                : data.songsError
                  ? "Songs couldn't load"
                  : `${data.songs.filter((song) => song.team_id === team.id).length} songs — browse, add and edit`
            }
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
            imageUri={data.getAnnouncementImageUri(a)}
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

      {ownMembership ? (
        <>
          <SectionHeader title="Your Membership" />
          <Card style={styles.membershipCard}>
            <View style={styles.membershipSummary}>
              <Badge
                label={ownMembership.role === 'team_leader' ? 'Team admin' : 'Member'}
                tone={ownMembership.role === 'team_leader' ? 'accent' : 'neutral'}
              />
              <AppText tone="secondary" style={styles.membershipCopy}>
                Leaving removes only your membership in {team.name}. Your church profile and
                account stay in place.
              </AppText>
            </View>
            {currentLeaveState === 'final_team_admin' ? (
              <View style={styles.leaveGuidance} accessibilityLiveRegion="polite">
                <Ionicons name="shield-checkmark-outline" size={21} color={colors.textMuted} />
                <AppText variant="small" tone="muted" style={styles.membershipCopy}>
                  Another team admin must be appointed before you can leave.
                </AppText>
              </View>
            ) : null}
            {leaveError ? (
              <View style={styles.leaveError} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={21} color={colors.danger} />
                <AppText variant="small" tone="danger" style={styles.membershipCopy}>
                  {leaveError}
                </AppText>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Leave ${team.name}`}
              accessibilityHint="Removes only your membership after confirmation"
              accessibilityState={{
                disabled:
                  confirmingLeave || leaving || currentLeaveState === 'final_team_admin',
                busy: leaving,
              }}
              disabled={
                confirmingLeave || leaving || currentLeaveState === 'final_team_admin'
              }
              onPress={() => void requestLeave()}
              style={({ pressed }) => [
                styles.leaveAction,
                pressed && styles.leaveActionPressed,
                (confirmingLeave || leaving || currentLeaveState === 'final_team_admin') &&
                  styles.leaveDisabled,
              ]}
              testID="leave-team-action"
            >
              {leaving ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              )}
              <AppText variant="label" tone="danger">
                {leaving ? 'Leaving…' : 'Leave team'}
              </AppText>
            </Pressable>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  header: { gap: spacing.xs },
  identityBlock: { gap: spacing.xs },
  settingsActionRow: { alignItems: 'flex-end', marginBottom: -spacing.xs },
  settingsAction: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  settingsActionPressed: { backgroundColor: colors.primarySoft },
  identityHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  identityCopy: { flex: 1, gap: spacing.xs },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  shortcuts: { gap: spacing.sm },
  actions: { gap: spacing.sm },
  membershipCard: { gap: spacing.md },
  membershipSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  membershipCopy: { flex: 1 },
  leaveGuidance: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  leaveError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  leaveAction: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.md,
  },
  leaveActionPressed: { opacity: 0.75 },
  leaveDisabled: { opacity: 0.5 },
});
