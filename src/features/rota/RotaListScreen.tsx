import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

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
        <Button
          title="Add Rota Entry"
          icon="add-circle-outline"
          onPress={() =>
            router.push({ pathname: '/teams/[teamId]/rota/edit', params: { teamId: team.id } })
          }
        />
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
                isChoir ? selectionsForEntry(entry.id, data.songSelections).length : undefined
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
