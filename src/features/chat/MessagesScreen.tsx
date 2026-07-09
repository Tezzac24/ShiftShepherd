import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { CountBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { lastMessageForTeam, userName, visibleTeams } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { formatRelative } from '../../utils/dates';

export default function MessagesScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const data = useAppData();

  const teams = visibleTeams(user, data.teams);
  // Live mode: the directory loads after sign-in — show calm loading/error
  // states instead of flashing the "no team chats" message.
  const showLoading = data.teamsLoading && teams.length === 0;
  const showError = !!data.teamsError && teams.length === 0 && !data.teamsLoading;

  return (
    <Screen safeTop>
      <AppText variant="title">Messages</AppText>
      <AppText tone="secondary">Your team conversations.</AppText>

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
          const last = lastMessageForTeam(team.id, data.chatMessages);
          const unread = data.unreadByTeam[team.id] ?? 0;
          return (
            <Card
              key={team.id}
              onPress={() =>
                router.push({ pathname: '/teams/[teamId]/chat', params: { teamId: team.id } })
              }
              accessibilityLabel={`Open ${team.name} chat${unread ? `, ${unread} unread` : ''}`}
              style={styles.chatCard}
            >
              <View style={styles.row}>
                <Avatar name={team.name} size={48} />
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <AppText variant="bodyBold">{team.name}</AppText>
                    {last ? (
                      <AppText variant="small" tone="muted">
                        {formatRelative(last.created_at)}
                      </AppText>
                    ) : null}
                  </View>
                  {last ? (
                    <AppText variant="small" tone="secondary" numberOfLines={1}>
                      {userName(data.users, last.sender_id).split(' ')[0]}: {last.body}
                    </AppText>
                  ) : (
                    <AppText variant="small" tone="muted">
                      {data.chatLoading ? 'Loading messages…' : 'No messages yet'}
                    </AppText>
                  )}
                </View>
                <CountBadge count={unread} />
              </View>
            </Card>
          );
        })
      ) : (
        <EmptyState
          icon="chatbubbles-outline"
          title="No team chats"
          message="When you join a team, its chat will appear here."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chatCard: { paddingVertical: spacing.md },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
