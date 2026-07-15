import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge, CountBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import {
  chatMessagePreview,
  lastMessageForTeam,
  upcomingRotaEntriesForTeam,
  userName,
  visibleTeams,
} from '../../lib/appData/selectors';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canManageTeamLifecycle,
  isChurchAdmin,
  isTeamLeader,
} from '../../lib/permissions';
import { formatUpcoming, parseDateKey } from '../../utils/dates';

const teamTypeLabel: Record<string, string> = {
  choir: 'Choir team',
  media: 'Media team',
  generic: 'Team',
};

export default function TeamsScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const { authMode, accountStatus, isLoading } = useAuth();
  const data = useAppData();

  const teams = visibleTeams(user, data.teams);
  const authorityResolved =
    !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const showAdminActions = authorityResolved && canManageTeamLifecycle(user);
  // Live mode: the directory loads after sign-in — show calm loading/error
  // states instead of flashing the "no teams" message.
  const showLoading = data.teamsLoading && teams.length === 0;
  const showError = !!data.teamsError && teams.length === 0 && !data.teamsLoading;

  return (
    <Screen safeTop>
      <View style={styles.titleRow}>
        <AppText variant="title" style={styles.titleText}>
          Your Teams
        </AppText>
        {showAdminActions ? (
          <Button
            title="New team"
            icon="add-outline"
            onPress={() => router.push('/teams/new')}
            style={styles.newTeamButton}
            accessibilityHint="Create a team in this church"
          />
        ) : null}
      </View>
      <AppText tone="secondary">
        {isChurchAdmin(user)
          ? 'As Church Admin you can see every team.'
          : 'The teams you belong to.'}
      </AppText>
      {showAdminActions ? (
        <Button
          title={
            data.archivedTeams.length > 0
              ? `Archived teams (${data.archivedTeams.length})`
              : 'Archived teams'
          }
          variant="ghost"
          icon="archive-outline"
          onPress={() => router.push('/teams/archived')}
          accessibilityHint="View and restore archived teams"
        />
      ) : null}

      {showLoading ? (
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="secondary">Loading your teams…</AppText>
          </View>
        </Card>
      ) : showError ? (
        <>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load your teams"
            message={data.teamsError ?? ''}
          />
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshTeams()}
          />
        </>
      ) : teams.length > 0 ? (
        teams.map((team) => {
          const nextRota = upcomingRotaEntriesForTeam(team.id, data.rotaEntries)[0];
          const lastMsg = lastMessageForTeam(team.id, data.chatMessages);
          const unread = data.unreadByTeam[team.id] ?? 0;
          const leader = isTeamLeader(user, team.id);

          return (
            <Card
              key={team.id}
              onPress={() =>
                router.push({ pathname: '/teams/[teamId]', params: { teamId: team.id } })
              }
              accessibilityLabel={`Open ${team.name} team space`}
            >
              <View style={styles.headerRow}>
                <Avatar name={team.name} uri={data.getTeamAvatarUri(team)} size={44} />
                <View style={{ flex: 1 }}>
                  <AppText variant="subheading">{team.name}</AppText>
                  <View style={styles.badgeRow}>
                    <Badge label={teamTypeLabel[team.type] ?? 'Team'} tone="primary" />
                    {leader ? <Badge label="You lead this team" tone="accent" /> : null}
                  </View>
                </View>
                <CountBadge count={unread} />
              </View>
              <AppText variant="small" tone="secondary">
                {team.description}
              </AppText>
              {nextRota ? (
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                  <AppText variant="small" tone="secondary">
                    Next: {nextRota.title} · {formatUpcoming(parseDateKey(nextRota.date))}
                  </AppText>
                </View>
              ) : null}
              {lastMsg ? (
                <View style={styles.metaRow}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
                  <AppText variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                    {userName(data.users, lastMsg.sender_id).split(' ')[0]}:{' '}
                    {chatMessagePreview(lastMsg)}
                  </AppText>
                </View>
              ) : null}
            </Card>
          );
        })
      ) : (
        <EmptyState
          icon="people-outline"
          title="No teams yet"
          message={
            showAdminActions
              ? 'Create the first team for this church when you are ready.'
              : 'You are not part of any team yet. When you join a team it will appear here.'
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleText: { flex: 1, minWidth: 0 },
  newTeamButton: { flexShrink: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: 2, flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
