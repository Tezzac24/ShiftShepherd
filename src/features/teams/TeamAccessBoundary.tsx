import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle, canManageTeamMemberships, canViewTeam } from '../../lib/permissions';
import { Team } from '../../types';

/** Active-team pages never open an archived or different church's content. */
export function TeamAccessBoundary({ teamId, title, management = false, children }: {
  teamId: string;
  title: string;
  management?: boolean;
  children: (team: Team) => React.ReactNode;
}) {
  const user = useRequiredUser();
  const data = useAppData();
  const router = useRouter();
  const candidate = data.teams.find((team) => team.id === teamId
    && team.organisation_id === user.profile.organisation_id);
  const archived = candidate?.archived_at != null || data.archivedTeams?.some((team) =>
    team.id === teamId && team.organisation_id === user.profile.organisation_id);
  const team = candidate?.archived_at === null ? candidate : undefined;
  const back = { label: 'Back to teams', onPress: () => router.replace('/(tabs)/teams') };
  let state: React.ReactNode;

  if (archived) {
    state = <StatePanel headingLevel={1} title="Team is archived" icon="archive-outline"
      message="This team is hidden from active areas. A church admin can restore it from Archived teams."
      action={canManageTeamLifecycle(user)
        ? { label: 'View archived teams', onPress: () => router.replace('/teams/archived') }
        : back} />;
  } else if (!team && data.teamsLoading) {
    state = <StatePanel headingLevel={1} kind="loading" title="Loading your team…" />;
  } else if (!team && data.teamsError) {
    state = <StatePanel headingLevel={1} kind="error" title="Couldn't load this team" message={data.teamsError}
      action={{ label: 'Try Again', onPress: () => void data.refreshTeams() }} />;
  } else if (!team) {
    state = <StatePanel headingLevel={1} title="Team not found" message="This team is not available in your current church." action={back} />;
  } else if (!canViewTeam(user, team.id) || (management && !canManageTeamMemberships(user, team.id))) {
    state = <StatePanel headingLevel={1} title="No permission" icon="lock-closed-outline"
      message={management ? 'Only team admins and church admins can manage this team.' : 'You do not have permission to view this team.'}
      action={back} />;
  } else {
    return <>{children(team)}</>;
  }

  return <Screen>
    <Stack.Screen options={{ title }} />
    {state}
    {(!team && !archived && (data.teamsLoading || data.teamsError)) || (archived && canManageTeamLifecycle(user))
      ? <Button title={back.label} onPress={back.onPress} variant="ghost" /> : null}
  </Screen>;
}
