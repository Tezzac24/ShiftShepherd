import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageSongs, canViewTeam } from '../../lib/permissions';
import { SessionUser, Team } from '../../types';

export interface ChoirScopeValue {
  user: SessionUser;
  team?: Team;
  ready: boolean;
  state: 'ready' | 'checking' | 'loading' | 'error' | 'unavailable' | 'denied' | 'archived';
}

/** Temporary readiness checks keep drafts mounted; a different identity, route,
 * or revoked choir access replaces the editor and invalidates its callbacks. */
export function ChoirScope({ teamId, routeKey, children }: {
  teamId: string | null;
  routeKey: string;
  children: (scope: ChoirScopeValue) => React.ReactNode;
}) {
  const { user, authMode, isLoading, accountStatus } = useAuth();
  const data = useAppData();
  const router = useRouter();
  if (!user) return <Screen><Stack.Screen options={{ title: 'Songs' }} />
    <StatePanel headingLevel={1} kind="loading" title="Checking your access…" />
    <Button title="Back to home" variant="secondary" onPress={() => router.replace('/')} />
  </Screen>;

  const authorityReady = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const candidate = data.teams.find((item) => item.id === teamId && item.organisation_id === user.profile.organisation_id);
  const archived = !!candidate?.archived_at || data.archivedTeams?.some((item) => item.id === teamId && item.organisation_id === user.profile.organisation_id);
  const team = candidate?.archived_at === null ? candidate : undefined;
  const permitted = user.profile.access_status === 'active' && !!teamId && canViewTeam(user, teamId)
    && (!team || canManageSongs(user, team));
  const state: ChoirScopeValue['state'] = archived ? 'archived'
    : !permitted ? 'denied'
      : !authorityReady ? 'checking'
        : team ? 'ready'
          : data.teamsLoading ? 'loading'
            : data.teamsError ? 'error' : 'unavailable';
  const revoked = ['archived', 'denied', 'unavailable'].includes(state);
  const key = [authMode, user.profile.auth_user_id, user.profile.organisation_id, user.profile.id, teamId, routeKey, revoked].join(':');
  return <React.Fragment key={key}>{children({ user, team, ready: state === 'ready', state })}</React.Fragment>;
}

export function ChoirAccessState({ scope, title = 'Songs', onExit, exitLabel = 'Back to teams' }: {
  scope: ChoirScopeValue; title?: string; onExit?: () => void; exitLabel?: string;
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
          ? <StatePanel headingLevel={1} title="Team is archived" icon="archive-outline" message="A church admin must restore this team before its songs can be opened." />
          : scope.state === 'denied'
            ? <StatePanel headingLevel={1} title="No permission" icon="lock-closed-outline" message="Songs are available to this team's members and church admins." />
            : <StatePanel headingLevel={1} title="Team unavailable" message="This team is not available in your current church." />}
    <Button title={exitLabel} variant="secondary" onPress={onExit ?? (() => router.replace('/(tabs)/teams'))} />
  </Screen>;
}
