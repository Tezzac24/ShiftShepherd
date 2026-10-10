import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { eligibleTeamProfiles } from '../../lib/appData/selectors';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamMemberships } from '../../lib/permissions';
import { Team, UserProfile } from '../../types';
import { TeamAccessBoundary } from './TeamAccessBoundary';

export function TeamProfileCandidateRow({ profile, avatarUri, adding, disabled, onAdd, first, last }: {
  profile: UserProfile;
  avatarUri?: string;
  adding: boolean;
  disabled: boolean;
  onAdd: () => void;
  first?: boolean;
  last?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.personRow, first && styles.firstRow, last && styles.lastRow]}>
    <View style={styles.person}>
      <Avatar name={profile.full_name} uri={avatarUri} size={48} />
      <View style={styles.personCopy}>
        <AppText variant="bodyBold">{profile.full_name}</AppText>
        <AppText variant="small" tone="secondary">{profile.email}</AppText>
      </View>
    </View>
    <Button title="Add" variant="secondary" icon="person-add-outline" onPress={onAdd} loading={adding} disabled={disabled}
      accessibilityLabel={`Add ${profile.full_name}`} accessibilityHint="Adds this person as a member of the team" />
  </View>;
}

export default function TeamAddMemberScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { authMode, accountStatus, isLoading } = useAuth();
  const user = useRequiredUser();
  const router = useRouter();
  if (isLoading || (authMode === 'supabase' && accountStatus !== 'ready')) return <Screen>
    <Stack.Screen options={{ title: 'Add member' }} />
    <StatePanel headingLevel={1} kind="loading" title="Checking team permissions..." />
    <Button title="Back to teams" variant="secondary" onPress={() => router.replace('/(tabs)/teams')} />
  </Screen>;
  return <TeamAccessBoundary teamId={teamId} title="Add member" management>
    {(team) => <TeamAddMemberContent key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}:${team.id}`} team={team} />}
  </TeamAccessBoundary>;
}

function TeamAddMemberContent({ team }: { team: Team }) {
  const styles = useThemedStyles(createStyles);
  const { authMode } = useAuth();
  const user = useRequiredUser();
  const data = useAppData();
  const showToast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [addingProfileId, setAddingProfileId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ profileId: string; name: string; message: string } | null>(null);
  const pending = useRef(false);
  const active = useRef(true);
  const listRef = useRef<FlatList<UserProfile>>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!actionError) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [actionError]);

  const allEligible = useMemo(() => eligibleTeamProfiles(team, data.memberships, data.users), [team, data.memberships, data.users]);
  const candidates = useMemo(() => eligibleTeamProfiles(team, data.memberships, data.users, query), [team, data.memberships, data.users, query]);
  const retryCandidate = actionError ? allEligible.find((profile) => profile.id === actionError.profileId) : undefined;
  const isDemo = authMode !== 'supabase' || !data.teamsLive;
  const canManage = !isDemo && canManageTeamMemberships(user, team.id);
  const latest = useRef({ canManage, allEligible });
  latest.current = { canManage, allEligible };
  const backToMembers = () => router.replace({ pathname: '/teams/[teamId]/settings/members', params: { teamId: team.id } });

  const addProfile = async (profile: UserProfile) => {
    if (pending.current || !latest.current.canManage || !latest.current.allEligible.some((item) => item.id === profile.id)) return;
    pending.current = true;
    setAddingProfileId(profile.id);
    // Keep same-person retry feedback mounted so its busy control stays in view.
    if (actionError?.profileId !== profile.id) setActionError(null);
    try {
      await data.addTeamMember(team.id, profile.id);
      if (active.current && latest.current.canManage) {
        setActionError(null);
        showToast(`${profile.full_name} was added to ${team.name}.`);
      }
    } catch (error) {
      if (active.current && latest.current.canManage) setActionError({ profileId: profile.id, name: profile.full_name,
        message: error instanceof Error ? error.message : "We couldn't add this person right now. Please try again." });
    } finally {
      pending.current = false;
      if (active.current) setAddingProfileId(null);
    }
  };

  if (!canManage) return <Screen>
    <Stack.Screen options={{ title: 'Add member' }} />
    <StatePanel headingLevel={1} icon={isDemo ? 'information-circle-outline' : 'lock-closed-outline'}
      title={isDemo ? 'Adding members is unavailable in demo mode' : 'No permission'}
      message={isDemo ? 'Sign in with your linked church account to manage live team memberships.' : `Only ${team.name} team admins and church admins can add members.`} />
    <Button title="Back to members" variant="secondary" onPress={backToMembers} />
  </Screen>;

  return <Screen scroll={false} keyboard footer={<Button title="Back to members" variant="ghost" onPress={backToMembers} />}>
    <Stack.Screen options={{ title: 'Add member' }} />
    <FlatList ref={listRef} data={candidates} keyExtractor={(profile) => profile.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeading title="Add member" eyebrow={team.name} description="Choose from active members of your church." />
        <TextField label="Search people" placeholder="Name or email" value={query} onChangeText={setQuery}
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityHint="Filters people who can be added to this team" />
        {actionError ? <View style={styles.feedback}>
          <StatePanel compact kind="error" title={`Couldn't add ${actionError.name}`} message={actionError.message} />
          {retryCandidate ? <Button title="Retry add" variant="secondary" onPress={() => void addProfile(retryCandidate)}
            loading={addingProfileId === retryCandidate.id} disabled={addingProfileId !== null}
            accessibilityHint={`Try adding ${retryCandidate.full_name} again`} /> : null}
        </View> : null}
        {data.teamsError && candidates.length > 0 ? <StatePanel compact kind="error" title="Couldn't refresh the directory" message={data.teamsError}
          action={{ label: 'Retry directory', onPress: () => void data.refreshTeams() }} /> : null}
        {candidates.length > 0 ? <AppText variant="small" tone="secondary" accessibilityLiveRegion="polite">
          {candidates.length} {candidates.length === 1 ? 'person' : 'people'} available{query.trim() ? ' for this search' : ''}
        </AppText> : null}
      </View>}
      renderItem={({ item, index }) => <TeamProfileCandidateRow profile={item} avatarUri={data.getAvatarUri(item)}
        first={index === 0} last={index === candidates.length - 1} adding={addingProfileId === item.id} disabled={addingProfileId !== null}
        onAdd={() => void addProfile(item)} />}
      ListEmptyComponent={data.teamsLoading ? <StatePanel kind="loading" title="Loading your church directory…" />
        : data.teamsError ? <StatePanel kind="error" title="Couldn't load the directory" message={data.teamsError}
          action={{ label: 'Try Again', onPress: () => void data.refreshTeams() }} />
          : query.trim() ? <StatePanel icon="search-outline" title="No matching people" message="Try a different name or email address."
            action={{ label: 'Clear search', onPress: () => setQuery('') }} />
            : allEligible.length === 0 ? <StatePanel icon="checkmark-circle-outline" title="Everyone is already added"
              message="Every linked church profile available to this team is already a member." /> : null}
    />
  </Screen>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  feedback: { gap: spacing.sm },
  personRow: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border,
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  firstRow: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastRow: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
});
