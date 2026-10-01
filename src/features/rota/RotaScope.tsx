import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageTeamRota, canViewTeam } from '../../lib/permissions';
import { SessionUser, Team } from '../../types';

export interface RotaScopeValue {
  user: SessionUser;
  team?: Team;
  ready: boolean;
  state: 'ready' | 'checking' | 'loading' | 'error' | 'unavailable' | 'denied' | 'archived';
}

/** Keep same-profile drafts mounted during readiness checks, but tear down a
 * genuinely different identity, route, or lost team/management authority. */
export function RotaScope({ teamId, routeKey, management = false, choirOnly = false, children }: {
  teamId: string | null;
  routeKey: string;
  management?: boolean;
  choirOnly?: boolean;
  children: (scope: RotaScopeValue) => React.ReactNode;
}) {
  const { user, authMode, isLoading, accountStatus } = useAuth();
  const data = useAppData();
  const router = useRouter();
  if (!user) return <Screen><Stack.Screen options={{ title: 'Rota' }} />
    <StatePanel headingLevel={1} kind="loading" title="Checking your access…" />
    <Button title="Back to home" variant="secondary" onPress={() => router.replace('/')} />
  </Screen>;

  const authorityReady = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const candidate = data.teams.find((item) => item.id === teamId && item.organisation_id === user.profile.organisation_id);
  const archived = !!candidate?.archived_at || data.archivedTeams?.some((item) => item.id === teamId && item.organisation_id === user.profile.organisation_id);
  const team = candidate?.archived_at === null ? candidate : undefined;
  const visible = !!teamId && canViewTeam(user, teamId);
  const manager = !!teamId && canManageTeamRota(user, teamId);
  const state: RotaScopeValue['state'] = archived ? 'archived'
    : !visible || (management && !manager) || (choirOnly && !!team && team.type !== 'choir') ? 'denied'
      : !authorityReady ? 'checking'
        : team ? 'ready'
          : data.teamsLoading ? 'loading'
            : data.teamsError ? 'error' : 'unavailable';
  const revoked = ['archived', 'denied', 'unavailable'].includes(state);
  const key = [authMode, user.profile.auth_user_id, user.profile.organisation_id, user.profile.id,
    teamId, routeKey, visible, manager, revoked].join(':');
  return <React.Fragment key={key}>{children({ user, team, ready: state === 'ready', state })}</React.Fragment>;
}

export function RotaAccessState({ scope, title = 'Rota', onExit, exitLabel = 'Back to teams' }: {
  scope: RotaScopeValue; title?: string; onExit?: () => void; exitLabel?: string;
}) {
  const data = useAppData();
  const router = useRouter();
  return <Screen><Stack.Screen options={{ title }} />
    {scope.state === 'checking' || scope.state === 'loading'
      ? <StatePanel headingLevel={1} kind="loading" title={scope.state === 'checking' ? 'Checking your access…' : 'Loading the team…'} />
      : scope.state === 'error'
        ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this team" message={data.teamsError ?? undefined}
          action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} />
        : scope.state === 'archived'
          ? <StatePanel headingLevel={1} title="Team is archived" icon="archive-outline" message="A church admin must restore this team before its rota can be opened." />
          : scope.state === 'denied'
            ? <StatePanel headingLevel={1} title="No permission" icon="lock-closed-outline" message="You do not have permission to open this rota page." />
            : <StatePanel headingLevel={1} title="Team unavailable" message="This team is not available in your current church." />}
    <Button title={exitLabel} variant="secondary" onPress={onExit ?? (() => router.replace('/(tabs)/teams'))} />
  </Screen>;
}
