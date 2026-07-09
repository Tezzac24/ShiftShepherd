import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { RotaEntryCard } from '../../components/RotaEntryCard';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import {
  assignmentsForEntry,
  availabilityForAssignment,
  selectionsForEntry,
  upcomingRotaEntriesForTeam,
} from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamRota, canViewTeam } from '../../lib/permissions';

export default function RotaListScreen() {
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  const data = useAppData();

  const team = data.teams.find((t) => t.id === teamId);

  // Live mode: don't flash "No permission" while the directory is on its way.
  if (!team && data.teamsLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Rota' }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading the rota…</AppText>
        </View>
      </Screen>
    );
  }

  if (!team || !canViewTeam(user, team.id)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Rota' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="You do not have permission to view this rota."
        />
      </Screen>
    );
  }

  const isChoir = team.type === 'choir';
  const entries = upcomingRotaEntriesForTeam(team.id, data.rotaEntries);

  return (
    <Screen>
      <Stack.Screen options={{ title: `${team.name} Rota` }} />
      <AppText tone="secondary">
        Upcoming dates for the {team.name} team. Tap a date to see details
        {isChoir ? ' and selected songs' : ''}.
      </AppText>

      {canManageTeamRota(user, team.id) ? (
        <>
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
              accessibilityHint="Creates rota entries for all the Sundays and rehearsals in a month at once"
              onPress={() =>
                router.push({
                  pathname: '/teams/[teamId]/rota/plan-month',
                  params: { teamId: team.id },
                })
              }
            />
          ) : null}
        </>
      ) : null}

      {entries.length > 0 ? (
        entries.map((entry) => {
          const assignments = assignmentsForEntry(entry.id, data.rotaAssignments);
          const mine = assignments.find((a) => a.user_id === user.profile.id);
          return (
            <RotaEntryCard
              key={entry.id}
              entry={entry}
              assignmentSummary={
                mine ? `You: ${mine.role_name}` : `${assignments.length} people assigned`
              }
              myStatus={
                mine
                  ? (availabilityForAssignment(mine.id, data.availabilityResponses)?.status ??
                    'not_responded')
                  : undefined
              }
              songCount={
                isChoir && !data.songsLoading && !data.songsError
                  ? selectionsForEntry(entry.id, data.songSelections).length
                  : undefined
              }
              onPress={() =>
                router.push({
                  pathname: '/teams/[teamId]/rota/[entryId]',
                  params: { teamId: team.id, entryId: entry.id },
                })
              }
            />
          );
        })
      ) : data.rotasLoading ? (
        // Live mode: the rota is still on its way from the server.
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
});
