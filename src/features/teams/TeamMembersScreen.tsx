import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { FocusRef } from '../../components/ModalSurface';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canManageTeamMemberships, canManageTeamRoles, demotionLeavesTeamWithoutAdmin,
  teamMemberRemovalState, TeamMemberRemovalState, TeamRoleAction, teamRoleActionFor,
} from '../../lib/permissions';
import { Team, TeamMembership, UserProfile } from '../../types';
import { TeamAccessBoundary } from './TeamAccessBoundary';
import { currentTeamMembers } from './teamPresentation';

export function TeamMemberRow({ profile, membership, avatarUri, isCurrentUser, removalState, removing, disabled, onRemove, roleAction, roleChanging, onChangeRole, first, last }: {
  profile: UserProfile;
  membership: TeamMembership;
  avatarUri?: string;
  isCurrentUser: boolean;
  /** Null is a readable row with no membership-management affordances. */
  removalState: TeamMemberRemovalState | null;
  removing: boolean;
  disabled: boolean;
  onRemove: (opener: FocusRef) => void;
  roleAction: TeamRoleAction | null;
  roleChanging: boolean;
  onChangeRole: (opener: FocusRef) => void;
  first?: boolean;
  last?: boolean;
}) {
  const removeRef = useRef<View>(null);
  const roleRef = useRef<View>(null);
  return <View style={[styles.memberRow, first && styles.firstMember, last && styles.lastMember]}>
    <View style={styles.person}>
      <Avatar name={profile.full_name} uri={avatarUri} size={48} />
      <View style={styles.memberCopy}>
        <AppText variant="bodyBold">{profile.full_name}</AppText>
        <View style={styles.roleLine}>
          <AppText variant="small" tone={membership.role === 'team_leader' ? 'accent' : 'secondary'}>
            {membership.role === 'team_leader' ? 'Team admin' : 'Member'}
          </AppText>
          {isCurrentUser ? <AppText variant="small" tone="primary">You</AppText> : null}
        </View>
        {removalState && profile.email ? <AppText variant="small" tone="secondary">{profile.email}</AppText> : null}
      </View>
    </View>
    {removalState === 'self' ? <AppText variant="small" tone="muted">Use Leave Team from the team page for your own membership.</AppText>
      : removalState === 'peer_team_admin' ? <AppText variant="small" tone="muted">Ask a church admin to manage another team admin’s membership.</AppText>
        : removalState === 'final_team_admin' ? <View style={styles.guidance}>
          <AppText variant="small" tone="muted">Another team admin must be appointed before this person can be removed.</AppText>
          {roleAction === 'demote' ? <AppText variant="small" tone="muted">You can remove their team admin role first. They will remain a member.</AppText> : null}
        </View> : null}
    {roleAction ? <Pressable ref={roleRef} accessibilityRole="button"
      accessibilityLabel={roleAction === 'promote' ? `Make ${profile.full_name} a team admin` : `Remove ${profile.full_name}'s team admin role`}
      accessibilityHint="Opens a confirmation before changing this team role"
      accessibilityState={{ disabled: disabled || roleChanging, busy: roleChanging }} aria-disabled={disabled || roleChanging} aria-busy={roleChanging}
      disabled={disabled || roleChanging} onPress={() => onChangeRole(roleRef)}
      style={({ pressed }) => [styles.action, styles.roleAction, pressed && styles.rolePressed]}>
      {roleChanging ? <ActivityIndicator size="small" color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
        : <Ionicons name={roleAction === 'promote' ? 'ribbon-outline' : 'remove-circle-outline'} size={21} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />}
      <AppText variant="label" tone={disabled ? 'muted' : 'primary'} style={styles.actionLabel}>
        {roleAction === 'promote' ? 'Make team admin' : 'Remove team admin role'}
      </AppText>
    </Pressable> : null}
    {removalState === 'removable' ? <Pressable ref={removeRef} accessibilityRole="button"
      accessibilityLabel={`Remove ${profile.full_name} from team`} accessibilityHint="Opens a confirmation before removing this membership"
      accessibilityState={{ disabled: disabled || removing, busy: removing }} aria-disabled={disabled || removing} aria-busy={removing}
      disabled={disabled || removing} onPress={() => onRemove(removeRef)}
      style={({ pressed }) => [styles.action, pressed && styles.removePressed]}>
      {removing ? <ActivityIndicator size="small" color={colors.danger} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
        : <Ionicons name="person-remove-outline" size={21} color={colors.danger} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />}
      <AppText variant="label" tone={disabled ? 'muted' : 'danger'} style={styles.actionLabel}>Remove member</AppText>
    </Pressable> : null}
  </View>;
}

export default function TeamMembersScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  return <TeamAccessBoundary teamId={teamId} title="Members">
    {(team) => <TeamMembersContent key={`${user.profile.id}:${team.id}`} team={team} />}
  </TeamAccessBoundary>;
}

function TeamMembersContent({ team }: { team: Team }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const { authMode } = useAuth();
  const user = useRequiredUser();
  const data = useAppData();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [removingProfileId, setRemovingProfileId] = useState<string | null>(null);
  const [changingRoleProfileId, setChangingRoleProfileId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [refreshingMembers, setRefreshingMembers] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const refreshGeneration = useRef(0);
  const focusedRef = useRef(false);
  const activeRef = useRef(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    refreshGeneration.current += 1;
    refreshInFlightRef.current = false;
    setRefreshingMembers(false);
    return () => {
      focusedRef.current = false;
      refreshGeneration.current += 1;
      refreshInFlightRef.current = false;
    };
  }, []));

  const members = useMemo(() => currentTeamMembers(team, data.memberships, data.users), [team, data.memberships, data.users]);
  const query = search.trim().toLocaleLowerCase();
  const filtered = members.filter(({ profile }) => [profile.full_name, profile.email].some((value) => value.toLocaleLowerCase().includes(query)));
  const isDemo = authMode !== 'supabase' || !data.teamsLive;
  const canManage = !isDemo && canManageTeamMemberships(user, team.id);
  const canChangeRoles = canManage && canManageTeamRoles(user) && team.archived_at === null;
  const actionsBusy = confirming || removingProfileId !== null || changingRoleProfileId !== null || refreshingMembers;
  const scopeKey = `${authMode}:${user.profile.organisation_id}:${user.profile.id}:${team.id}`;
  const latest = useRef({ canManage, canChangeRoles, user, members, memberships: data.memberships,
    scopeKey, isDemo, actionsBusy, teamsLoading: data.teamsLoading, refreshTeams: data.refreshTeams });
  latest.current = { canManage, canChangeRoles, user, members, memberships: data.memberships,
    scopeKey, isDemo, actionsBusy, teamsLoading: data.teamsLoading, refreshTeams: data.refreshTeams };

  const showActionError = (error: unknown, fallback: string) => {
    if (!activeRef.current) return;
    setActionError(error instanceof Error ? error.message : fallback);
    setRefreshError(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const refreshMembers = async () => {
    const current = latest.current;
    if (!activeRef.current || !focusedRef.current || current.isDemo || current.actionsBusy || current.teamsLoading
      || requestInFlightRef.current || refreshInFlightRef.current) return;
    const generation = ++refreshGeneration.current;
    const requestScope = current.scopeKey;
    const stillCurrent = () => activeRef.current && focusedRef.current && generation === refreshGeneration.current
      && latest.current.scopeKey === requestScope && !latest.current.isDemo;
    refreshInFlightRef.current = true;
    setRefreshingMembers(true);
    setRefreshError(null);
    try {
      // refreshTeams publishes the authoritative directory/error to AppData.
      // A resolved read does not establish whether the earlier write succeeded.
      await current.refreshTeams();
    } catch (error) {
      if (stillCurrent()) {
        setRefreshError(error instanceof Error ? error.message : 'We couldn’t refresh members. Check your connection and try again.');
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    } finally {
      if (stillCurrent()) {
        refreshInFlightRef.current = false;
        setRefreshingMembers(false);
      }
    }
  };

  const requestRemove = async (profile: UserProfile, membership: TeamMembership, opener: FocusRef) => {
    if (!canManage || actionsBusy || requestInFlightRef.current || teamMemberRemovalState(user, membership, data.memberships) !== 'removable') return;
    requestInFlightRef.current = true;
    setConfirming(true);
    try {
      const approved = await confirm({
        title: 'Remove member?',
        message: `${profile.full_name}${profile.email ? ` (${profile.email})` : ''}.\n\n` + (membership.role === 'team_leader'
          ? `Their team-admin membership will be removed from ${team.name}. Another team admin will remain. Their church profile, account and church role will stay in place.`
          : `They will be removed from ${team.name} and will no longer have member access to this team's chat, rota and updates. Their church profile, account and church role will stay in place.`),
        confirmLabel: 'Remove member', returnFocusRef: opener,
      });
      const current = latest.current.members.find((member) => member.profile.id === profile.id)?.membership;
      if (!approved || !activeRef.current || !latest.current.canManage || !current
        || teamMemberRemovalState(latest.current.user, current, latest.current.memberships) !== 'removable') return;
      setConfirming(false);
      setRemovingProfileId(profile.id);
      setActionError(null);
      await data.removeTeamMember(team.id, profile.id);
      if (activeRef.current) showToast(`${profile.full_name} was removed from ${team.name}.`);
    } catch (error) {
      showActionError(error, "We couldn't confirm this person's removal.");
    } finally {
      requestInFlightRef.current = false;
      if (activeRef.current) { setConfirming(false); setRemovingProfileId(null); }
    }
  };

  const requestRoleChange = async (profile: UserProfile, membership: TeamMembership, opener: FocusRef) => {
    if (!canChangeRoles || actionsBusy || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setConfirming(true);
    const promote = teamRoleActionFor(membership) === 'promote';
    // Final-leader demotion is valid. This warning is informational, never a block.
    const leavesTeamWithoutAdmin = !promote && demotionLeavesTeamWithoutAdmin(membership, data.memberships);
    try {
      const approved = await confirm({
        title: promote ? 'Make team admin?' : 'Remove team admin role?',
        message: `${profile.full_name}${profile.email ? ` (${profile.email})` : ''}.\n\n` + (promote
          ? `They will be able to help organise ${team.name}. Their church role and account stay the same.`
          : `They will remain a member of ${team.name}.${leavesTeamWithoutAdmin ? ' This will leave the team without a team admin. A church admin can appoint one later.' : ''}`),
        confirmLabel: promote ? 'Make team admin' : 'Remove team admin role',
        destructive: !promote, returnFocusRef: opener,
      });
      if (!approved || !activeRef.current || !latest.current.canChangeRoles
        || !latest.current.members.some((member) => member.profile.id === profile.id)) return;
      setConfirming(false);
      setChangingRoleProfileId(profile.id);
      setActionError(null);
      await data.setTeamMemberRole(team.id, profile.id, promote ? 'team_leader' : 'member');
      if (activeRef.current) showToast(promote ? `${profile.full_name} is now a team admin of ${team.name}.`
        : `${profile.full_name} is no longer a team admin of ${team.name}.`);
    } catch (error) {
      showActionError(error, "We couldn't confirm this team role change.");
    } finally {
      requestInFlightRef.current = false;
      if (activeRef.current) { setConfirming(false); setChangingRoleProfileId(null); }
    }
  };

  return <Screen scroll={false}>
    <Stack.Screen options={{ title: 'Members' }} />
    <FlatList ref={listRef} data={filtered} keyExtractor={({ profile }) => profile.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl * 2 + insets.bottom }]}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeading title="Members" eyebrow={team.name} action={canManage ? <Button title="Add member" icon="person-add-outline"
          onPress={() => router.push({ pathname: '/teams/[teamId]/settings/members/add', params: { teamId: team.id } })} /> : undefined} />
        {members.length > 0 || (!data.teamsLoading && !data.teamsError)
          ? <AppText tone="secondary">{members.length} current {members.length === 1 ? 'member' : 'members'}</AppText> : null}
        {isDemo && canManageTeamMemberships(user, team.id) ? <StatePanel compact kind="info"
          title="Member management is read-only in demo mode" message="You can browse names here. Adding, removing and changing team roles requires a linked church account." /> : null}
        {members.length > 5 || search.length > 0 ? <TextField label="Search members" placeholder="Name or email" value={search}
          onChangeText={setSearch} autoCapitalize="none" returnKeyType="search" /> : null}
        {query ? <AppText variant="small" tone="secondary" accessibilityLiveRegion="polite">{filtered.length} of {members.length} members</AppText> : null}
        {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh the member list" message={data.teamsError}
          action={!actionError && !refreshingMembers ? { label: 'Retry members', onPress: () => void refreshMembers() } : undefined} /> : null}
        {actionError ? <View style={styles.guidance}>
          <StatePanel compact kind="error" title="Couldn’t confirm change" message={actionError} />
          <AppText tone="secondary">Refresh members to check the current memberships and roles before trying again.</AppText>
          <Button title="Refresh members" variant="secondary" icon="refresh-outline" loading={refreshingMembers}
            disabled={actionsBusy || data.teamsLoading} onPress={() => void refreshMembers()} />
        </View> : null}
        {refreshError ? <StatePanel compact kind="error" title="Couldn’t refresh members" message={refreshError}
          action={!actionError && !refreshingMembers ? { label: 'Retry members', onPress: () => void refreshMembers() } : undefined} /> : null}
      </View>}
      renderItem={({ item: { profile, membership }, index }) => <TeamMemberRow
        profile={profile} membership={membership} avatarUri={data.getAvatarUri(profile)} isCurrentUser={profile.id === user.profile.id}
        first={index === 0} last={index === filtered.length - 1}
        removalState={canManage ? teamMemberRemovalState(user, membership, data.memberships) : null}
        removing={removingProfileId === profile.id} disabled={actionsBusy}
        onRemove={(opener) => void requestRemove(profile, membership, opener)}
        roleAction={canChangeRoles ? teamRoleActionFor(membership) : null} roleChanging={changingRoleProfileId === profile.id}
        onChangeRole={(opener) => void requestRoleChange(profile, membership, opener)} />}
      ListEmptyComponent={data.teamsLoading ? <StatePanel kind="loading" title="Loading the member list…" />
        : data.teamsError ? null : query ? <StatePanel title="No matching members" message="Try a different name or email." />
          : <StatePanel title="No members yet" icon="people-outline" message={canManage ? 'Add the first linked church profile to this team.' : 'People will appear here when a team admin adds them.'} />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  memberRow: { gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border,
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  firstMember: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastMember: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  roleLine: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  guidance: { gap: spacing.xs },
  action: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  actionLabel: { flexShrink: 1 },
  roleAction: { backgroundColor: colors.primarySoft },
  rolePressed: { backgroundColor: colors.surfaceRaised },
  removePressed: { backgroundColor: colors.dangerSoft },
});
