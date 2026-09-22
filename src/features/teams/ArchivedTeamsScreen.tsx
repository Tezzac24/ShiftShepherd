import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { FocusRef } from '../../components/ModalSurface';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle } from '../../lib/permissions';
import { Team } from '../../types';

function ArchivedTeamRow({ team, first, last, restoring, disabled, onRestore }: {
  team: Team;
  first: boolean;
  last: boolean;
  restoring: boolean;
  disabled: boolean;
  onRestore: (opener: FocusRef) => void;
}) {
  const opener = useRef<View>(null);
  const parsed = new Date(team.archived_at ?? '');
  const date = Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return <View style={[styles.teamRow, first && styles.firstRow, last && styles.lastRow]}>
    <View style={styles.metadata}>
      <Badge label="Archived" tone="neutral" />
      {date ? <AppText variant="small" tone="secondary">{date}</AppText> : null}
    </View>
    <AppText variant="subheading" headingLevel={2}>{team.name}</AppText>
    {team.description ? <AppText tone="secondary">{team.description}</AppText> : null}
    <Button ref={opener} title="Restore team" variant="secondary" icon="refresh-outline" loading={restoring} disabled={disabled}
      accessibilityLabel={`Restore ${team.name}`} accessibilityHint="Restore this team with its existing members and history"
      onPress={() => onRestore(opener)} />
  </View>;
}

export default function ArchivedTeamsScreen() {
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const router = useRouter();
  const authorityResolved = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  if (!authorityResolved || !user || !canManageTeamLifecycle(user)) return <Screen>
    <Stack.Screen options={{ title: 'Archived teams' }} />
    <StatePanel headingLevel={1} kind={authorityResolved ? 'empty' : 'loading'} icon="lock-closed-outline"
      title={authorityResolved ? 'No permission' : 'Checking team permissions...'}
      message={authorityResolved ? 'Only a church admin can view or restore archived teams.' : undefined} />
    <Button title="Back to teams" variant="secondary" onPress={() => router.replace('/(tabs)/teams')} />
  </Screen>;
  return <ArchivedTeamsContent key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}`} organisationId={user.profile.organisation_id} />;
}

function ArchivedTeamsContent({ organisationId }: { organisationId: string }) {
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [confirmingTeamId, setConfirmingTeamId] = useState<string | null>(null);
  const [restoringTeamId, setRestoringTeamId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ name: string; message: string } | null>(null);
  const [restoredTeam, setRestoredTeam] = useState<Team | null>(null);
  const pending = useRef(false);
  const active = useRef(true);
  const listRef = useRef<FlatList<Team>>(null);
  const teams = data.archivedTeams.filter((team) => team.organisation_id === organisationId && team.archived_at !== null);
  const latestTeams = useRef(teams);
  latestTeams.current = teams;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!actionError && !restoredTeam) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [actionError, restoredTeam]);

  const restore = async (team: Team, opener: FocusRef) => {
    if (pending.current) return;
    pending.current = true;
    setConfirmingTeamId(team.id);
    try {
      const approved = await confirm({
        title: `Restore ${team.name}?`,
        message: 'The same team, memberships, chat, rota, songs and history will return to active team areas.',
        confirmLabel: 'Restore team', destructive: false, returnFocusRef: opener,
      });
      if (!approved || !active.current || !latestTeams.current.some((item) => item.id === team.id)) return;
      setConfirmingTeamId(null);
      setRestoringTeamId(team.id);
      setActionError(null);
      const restored = await data.restoreTeam(team.id);
      if (!active.current) return;
      setRestoredTeam(restored);
      showToast('Team restored.');
    } catch (error) {
      if (active.current) setActionError({ name: team.name, message: error instanceof Error ? error.message : "We couldn't restore this team right now. Please try again." });
    } finally {
      pending.current = false;
      if (active.current) { setConfirmingTeamId(null); setRestoringTeamId(null); }
    }
  };

  return <Screen scroll={false} footer={<Button title="Back to teams" variant="ghost" onPress={() => router.replace('/(tabs)/teams')} />}>
    <Stack.Screen options={{ title: 'Archived teams' }} />
    <FlatList ref={listRef} data={teams} keyExtractor={(team) => team.id}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeading title="Archived teams" description="These teams are out of active use. Restore one to bring back its members and history." />
        {restoredTeam ? <StatePanel compact kind="info" icon="checkmark-circle-outline" title={`${restoredTeam.name} was restored`}
          message="You can open it now or keep restoring other teams." action={{ label: 'Open team', onPress: () => router.push({ pathname: '/teams/[teamId]', params: { teamId: restoredTeam.id } }) }} /> : null}
        {actionError ? <StatePanel compact kind="error" title={`Couldn't restore ${actionError.name}`} message={actionError.message} /> : null}
        {data.teamsError && teams.length > 0 ? <StatePanel compact kind="error" title="Couldn't refresh archived teams" message={data.teamsError}
          action={{ label: 'Retry archived teams', onPress: () => void data.refreshTeams() }} /> : null}
      </View>}
      renderItem={({ item, index }) => <ArchivedTeamRow team={item} first={index === 0} last={index === teams.length - 1}
        restoring={restoringTeamId === item.id} disabled={confirmingTeamId !== null || restoringTeamId !== null}
        onRestore={(opener) => void restore(item, opener)} />}
      ListEmptyComponent={data.teamsLoading ? <StatePanel kind="loading" title="Loading archived teams..." />
        : data.teamsError ? <StatePanel kind="error" title="Couldn't load archived teams" message={data.teamsError}
          action={{ label: 'Try Again', onPress: () => void data.refreshTeams() }} />
          : <StatePanel icon="archive-outline" title="No archived teams" message="Teams you archive will appear here until a church admin restores them." />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  teamRow: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border,
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  firstRow: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastRow: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
