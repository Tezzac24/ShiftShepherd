import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, touchTarget, type ThemeColors } from '../../../constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { CollectionGuide } from '../../components/CollectionGuide';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { nextActiveRotaEntryForTeam } from '../../lib/appData/selectors';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle, isMemberOfTeam, isTeamLeader } from '../../lib/permissions';
import { formatUpcoming, parseDateKey } from '../../utils/dates';
import { useCurrentTime } from '../../utils/useCurrentTime';
import { teamDirectory } from './teamPresentation';

export default function TeamsScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const user = useRequiredUser();
  const { authMode, accountStatus, isLoading } = useAuth();
  const data = useAppData();
  useCurrentTime();
  const [view, setView] = useState<'mine' | 'all'>('mine');
  const [search, setSearch] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<View>(null);
  const authorityResolved = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const showAdminActions = authorityResolved && canManageTeamLifecycle(user);
  const effectiveView = showAdminActions ? view : 'mine';
  const teams = teamDirectory(user, data.teams, effectiveView);
  const query = search.trim().toLocaleLowerCase();
  const filtered = teams.filter((team) => team.name.toLocaleLowerCase().includes(query));
  const showSearch = teams.length > 5 || search.length > 0;
  const showLoading = data.teamsLoading && teams.length === 0;
  const showError = !!data.teamsError;
  const shortCollection = teams.length > 0 && teams.length <= 3 && !query;
  const archivedCount = data.archivedTeams.filter((team) =>
    team.organisation_id === user.profile.organisation_id && team.archived_at !== null).length;

  return (
    <Screen safeTop scroll={false}>
      <FlatList
        data={filtered}
        keyExtractor={(team) => team.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={<View style={styles.header}>
          <OrganisationHeader />
          <PageHeading title="Teams" action={showAdminActions ? (
            <Pressable ref={manageRef} accessibilityRole="button" accessibilityLabel="Manage teams"
              accessibilityState={{ expanded: manageOpen }} aria-expanded={manageOpen}
              onPress={() => setManageOpen(true)} style={({ pressed }) => [styles.manage, pressed && styles.pressed]}>
              <Ionicons name="options-outline" size={20} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
              <AppText variant="label" tone="primary">Manage</AppText>
            </Pressable>
          ) : undefined} />
          {showAdminActions ? <SegmentedControl label="Team directory" value={effectiveView}
            options={[{ value: 'mine', label: 'My teams' }, { value: 'all', label: 'All teams' }]}
            onChange={(next) => { setView(next); setSearch(''); }} /> : null}
          <AppText tone="secondary">
            {effectiveView === 'all' ? 'You can manage all of your church’s teams.' : 'The teams you belong to.'}
          </AppText>
          {showSearch ? <TextField label="Search teams" value={search} onChangeText={setSearch}
            placeholder="Team name" autoCapitalize="none" returnKeyType="search" /> : null}
          {showError ? <StatePanel compact kind="error" title="Couldn't load your teams" message={data.teamsError ?? undefined}
            action={{ label: 'Retry teams', onPress: () => void data.refreshTeams() }} /> : null}
          {teams.length > 0 ? <AppText variant="small" tone="secondary" accessibilityLiveRegion="polite">
            {query ? `${filtered.length} of ${teams.length} teams` : `${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`}
          </AppText> : null}
        </View>}
        renderItem={({ item: team }) => {
          const next = nextActiveRotaEntryForTeam(team.id, data.rotaEntries.filter((entry) => entry.organisation_id === user.profile.organisation_id));
          const membership = isTeamLeader(user, team.id) ? 'Team admin' : isMemberOfTeam(user, team.id) ? 'Member' : 'Not on this team';
          const context = next ? `${formatUpcoming(parseDateKey(next.date))} · ${next.title}`
            : data.rotasLoading ? 'Loading next date…' : data.rotasError ? 'Next date unavailable' : 'No upcoming dates';
          return <Pressable accessibilityRole="button" accessibilityLabel={`${team.name}. ${membership}. ${context}`}
            accessibilityHint="Opens the team" onPress={() => router.push({ pathname: '/teams/[teamId]', params: { teamId: team.id } })}
            style={({ pressed }) => [styles.team, pressed && styles.pressed]}>
            <Avatar name={team.name} uri={data.getTeamAvatarUri(team)} size={48} decorative />
            <View style={styles.teamCopy}>
              <AppText variant="subheading">{team.name}</AppText>
              <AppText variant="small" tone="primary">{membership}</AppText>
              <AppText variant="small" tone="secondary">{context}</AppText>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
          </Pressable>;
        }}
        ListFooterComponent={shortCollection && !data.teamsLoading && !showError ? <CollectionGuide title="Your team space"
          items={[
            { icon: 'calendar-outline', title: 'Plan together', description: 'Open a team to see its rota and upcoming dates.' },
            { icon: 'chatbubbles-outline', title: 'Stay connected', description: 'Find team conversations and the people you serve with, all in one place.' },
          ]} /> : null}
        ListEmptyComponent={showLoading ? <StatePanel kind="loading" title="Loading your teams…" />
          : showError ? null : query ? <StatePanel title="No matching teams" message="Try a different team name." />
            : <StatePanel icon="people-outline" title={effectiveView === 'all' ? 'No teams yet' : 'No teams to show'}
              message={effectiveView === 'all' ? 'Use Manage to create the first team for your church.'
                : 'When a team admin adds you to a team, it will appear here. Speak to a team admin if you would like to take part.'} />}
      />
      <ActionSheet visible={showAdminActions && manageOpen} title="Manage teams" onClose={() => setManageOpen(false)}
        returnFocusRef={manageRef} actions={[
          { key: 'new', label: 'New team', icon: 'add-outline', onPress: () => router.push('/teams/new') },
          { key: 'archived', label: 'Archived teams', description: archivedCount > 0 ? `${archivedCount} archived ${archivedCount === 1 ? 'team' : 'teams'}` : undefined,
            icon: 'archive-outline', onPress: () => router.push('/teams/archived') },
        ]} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg },
  header: { gap: spacing.md, marginBottom: spacing.md },
  manage: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  team: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  teamCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  pressed: { backgroundColor: colors.primarySoft },
});
