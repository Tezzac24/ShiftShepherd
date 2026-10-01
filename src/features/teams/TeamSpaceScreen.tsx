import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { AvailabilityBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { DateMarker } from '../../components/DateMarker';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { nextActiveRotaEntryForTeam, peopleForEntry, teamAnnouncements, userName } from '../../lib/appData/selectors';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamRota, isChurchAdmin, leaveTeamState } from '../../lib/permissions';
import { Team } from '../../types';
import { formatClockTime, formatFullDate, formatUpcoming, parseDateKey } from '../../utils/dates';
import { HomeNotice } from '../home/HomeNotice';
import { TeamAccessBoundary } from './TeamAccessBoundary';
import { currentTeamMembers, teamManagementChoices } from './teamPresentation';
import { useTeamAvatar } from './useTeamAvatar';

/** Compact identity. The existing exported API remains usable by header tests. */
export function TeamIdentityHeader({ team, onOpenSettings, canOpenSettings, subtitle, manageOpen = false, actionRef }: {
  team: Team;
  onOpenSettings?: () => void;
  canOpenSettings?: boolean;
  subtitle?: string;
  manageOpen?: boolean;
  actionRef?: React.Ref<View>;
}) {
  const { canManage, avatarUri } = useTeamAvatar(team);
  return <View style={styles.identityBlock}>
    <View style={styles.identityHeader}>
      <Avatar name={team.name} uri={avatarUri} size={56} />
      <AppText variant="title" headingLevel={1} style={styles.identityCopy}>{team.name}</AppText>
    </View>
    {subtitle || ((canOpenSettings ?? canManage) && onOpenSettings) ? <View style={styles.identityMeta}>
      {subtitle ? <AppText variant="small" tone="secondary" style={styles.identityCopy}>{subtitle}</AppText> : null}
      {(canOpenSettings ?? canManage) && onOpenSettings ? <Pressable ref={actionRef}
        accessibilityRole="button" accessibilityLabel="Manage team"
        accessibilityHint={`Open management options for ${team.name}`}
        accessibilityState={{ expanded: manageOpen }} aria-expanded={manageOpen}
        onPress={onOpenSettings} style={({ pressed }) => [styles.manageAction, pressed && styles.pressed]}
        testID="team-settings-action">
        <Ionicons name="options-outline" size={20} color={colors.primary} accessible={false} />
        <AppText variant="label" tone="primary">Manage</AppText>
      </Pressable> : null}
    </View> : null}
  </View>;
}

export default function TeamSpaceScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  // Keep success navigation scoped to this route/account, even when a successful
  // leave removes the membership and the access boundary unmounts its content.
  const scope = `${user.profile.organisation_id}:${user.profile.id}:${teamId}`;
  const currentScope = useRef(scope);
  const mounted = useRef(true);
  currentScope.current = scope;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <TeamAccessBoundary teamId={teamId} title="Team">
    {(team) => <TeamSpaceContent key={`${user.profile.id}:${team.id}`} team={team}
      isCurrentScope={() => mounted.current && currentScope.current === scope} />}
  </TeamAccessBoundary>;
}

function TeamSpaceContent({ team, isCurrentScope }: { team: Team; isCurrentScope: () => boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const user = useRequiredUser();
  const { authMode } = useAuth();
  const data = useAppData();
  const { canManage: canManagePhoto } = useTeamAvatar(team);
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<View>(null);
  const leaveRef = useRef<View>(null);
  const activeRef = useRef(true);
  const leaveRequestRef = useRef(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);

  const liveMembers = authMode === 'supabase' && data.teamsLive;
  const choices = teamManagementChoices(user, team, liveMembers);
  const isChoir = team.type === 'choir';
  const isLeader = canManageTeamRota(user, team.id);
  const nextEntry = nextActiveRotaEntryForTeam(team.id, data.rotaEntries.filter((entry) => entry.organisation_id === team.organisation_id));
  const announcements = teamAnnouncements(team.id, data.announcements.filter((notice) => notice.organisation_id === team.organisation_id)).slice(0, 2);
  const members = currentTeamMembers(team, data.memberships, data.users);
  const memberSummary = members.length === 0 && data.teamsLoading ? 'Loading members…'
    : members.length === 0 && data.teamsError ? 'Members unavailable'
      : `${members.length} ${members.length === 1 ? 'member' : 'members'}`;
  const unread = data.unreadByTeam[team.id] ?? 0;
  const ownMembership = data.memberships.find((membership) => membership.team_id === team.id && membership.user_id === user.profile.id);
  const currentLeaveState = leaveTeamState(user.profile.id, team.id, data.memberships);
  const people = nextEntry ? peopleForEntry(nextEntry.id, data.rotaAssignments, data.availabilityResponses) : [];
  const me = people.find((person) => person.userId === user.profile.id);
  const nextDate = nextEntry ? parseDateKey(nextEntry.date) : undefined;
  const when = nextDate ? [formatUpcoming(nextDate), nextEntry?.time ? formatClockTime(nextEntry.time) : null].filter(Boolean).join(' · ') : '';
  const leaveDisabled = !liveMembers || confirmingLeave || leaving || currentLeaveState !== 'allowed';
  const params = { teamId: team.id };
  const addDate = () => router.push({ pathname: '/teams/[teamId]/rota/edit', params });

  const requestLeave = async () => {
    if (!ownMembership || leaveDisabled || leaveRequestRef.current) return;
    leaveRequestRef.current = true;
    const leadershipCopy = ownMembership.role === 'team_leader'
      ? ' You will also stop being a team admin. Another team admin will remain.' : '';
    const accessCopy = isChurchAdmin(user)
      ? 'Your team membership will be removed. Your church-admin role, account and organisation access will stay in place.'
      : `You will lose access to ${team.name}'s chat, rota and team updates.`;
    setConfirmingLeave(true);
    try {
      const approved = await confirm({
        title: `Leave ${team.name}?`,
        message: `${accessCopy}${leadershipCopy} Your church profile and account will not be deleted.`,
        confirmLabel: 'Leave team', returnFocusRef: leaveRef,
      });
      if (!activeRef.current || !isCurrentScope()) return;
      setConfirmingLeave(false);
      if (!approved) return;
      setLeaving(true);
      setLeaveError(null);
      await data.leaveTeam(team.id);
      if (!isCurrentScope()) return;
      showToast(`You left ${team.name}.`);
      router.replace('/(tabs)/teams');
    } catch (error) {
      if (activeRef.current) setLeaveError(error instanceof Error ? error.message : "We couldn't leave this team right now. Please try again.");
    } finally {
      leaveRequestRef.current = false;
      if (activeRef.current) { setConfirmingLeave(false); setLeaving(false); }
    }
  };

  return <Screen>
    <Stack.Screen options={{ title: 'Team' }} />
    <TeamIdentityHeader team={team} subtitle={`${memberSummary}${isChoir ? ' · Choir team' : ''}`}
      canOpenSettings={choices.length > 0} onOpenSettings={() => setManageOpen(true)} actionRef={manageRef} manageOpen={manageOpen} />

    <View style={styles.tools}>
      <Button title={unread > 0 ? `Chat (${unread > 99 ? '99+' : unread})` : 'Chat'} icon="chatbubbles-outline" variant="secondary"
        accessibilityLabel={unread > 0 ? `Chat, ${unread} unread messages` : 'Chat'}
        onPress={() => router.push({ pathname: '/teams/[teamId]/chat', params })} style={styles.tool} />
      <Button title="Rota" icon="calendar-outline" variant="secondary"
        onPress={() => router.push({ pathname: '/teams/[teamId]/rota', params })} style={styles.tool} />
      <Button title="Members" icon="people-outline" variant="secondary"
        onPress={() => router.push({ pathname: '/teams/[teamId]/settings/members', params })} style={styles.tool} />
      {isChoir ? <Button title="Songs" icon="musical-notes-outline" variant="secondary"
        onPress={() => router.push({ pathname: '/teams/[teamId]/songs', params })} style={styles.tool} /> : null}
    </View>

    {data.teamsError ? <StatePanel compact kind="error" title="Team details may be out of date" message={data.teamsError}
      action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} /> : null}

    <View style={styles.section}>
      <SectionHeader title="Next team date" actionLabel={isLeader ? 'Add a date' : undefined} onAction={isLeader ? addDate : undefined} />
      {data.rotasError ? <StatePanel compact kind="error" title="Couldn't load the rota" message={data.rotasError}
        action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /> : null}
      {nextEntry && nextDate ? <View style={styles.nextDate}>
        <View style={styles.dateRow}>
          <DateMarker day={String(nextDate.getDate())} month={nextDate.toLocaleDateString(undefined, { month: 'short' })}
            accessibilityLabel={`${formatFullDate(nextDate)}${nextEntry.time ? `, ${formatClockTime(nextEntry.time)}` : ''}`} />
          <View style={styles.dateCopy}>
            <AppText variant="label" tone="primary">{when}</AppText>
            <AppText variant="subheading">{nextEntry.title}</AppText>
          </View>
        </View>
        <AppText tone="secondary">{me ? `You: ${me.roleSummary}` : `${people.length} ${people.length === 1 ? 'person' : 'people'} assigned`}</AppText>
        {me && me.status !== 'not_responded' ? <AvailabilityBadge status={me.status} /> : null}
        <Button title={me?.status === 'not_responded' ? 'Confirm availability' : 'View date'}
          onPress={() => router.push({ pathname: '/teams/[teamId]/rota/[entryId]', params: { ...params, entryId: nextEntry.id } })} />
      </View> : data.rotasLoading ? <StatePanel compact kind="loading" title="Loading the rota…" />
        : !data.rotasError ? <StatePanel compact title="No upcoming team dates" message={isLeader ? 'Add a date when the next plan is ready.' : 'New dates will appear here when your team makes a plan.'} /> : null}
    </View>

    <View style={styles.section}>
      <SectionHeader title="Team announcements" />
      {data.announcementsError ? <StatePanel compact kind="error" title="Couldn't load team announcements" message={data.announcementsError}
        action={{ label: 'Retry announcements', onPress: () => void data.refreshAnnouncements() }} /> : null}
      {announcements.map((notice) => <HomeNotice key={notice.id} announcement={notice} teamName={team.name}
        authorName={userName(data.users, notice.created_by)} imageUri={data.getAnnouncementImageUri(notice)}
        onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: notice.id } })} />)}
      {announcements.length === 0 ? data.announcementsLoading ? <StatePanel compact kind="loading" title="Loading announcements…" />
        : !data.announcementsError ? <AppText tone="secondary">No team announcements yet.</AppText> : null : null}
      <Button title="All team announcements" variant="ghost" icon="megaphone-outline"
        accessibilityHint={`Opens announcements for ${team.name}`}
        onPress={() => router.push({ pathname: '/announcements', params: { teamId: team.id } })} />
    </View>

    {team.description ? <View style={styles.section}>
      <SectionHeader title="About this team" />
      <AppText tone="secondary">{team.description}</AppText>
    </View> : null}

    {ownMembership ? <View style={styles.section}>
      <SectionHeader title="Your membership" />
      <AppText variant="bodyBold">{ownMembership.role === 'team_leader' ? 'Team admin' : 'Member'}</AppText>
      <AppText tone="secondary">Leaving removes only your membership in {team.name}. Your church profile and account stay in place.</AppText>
      {isChurchAdmin(user) ? <AppText variant="small" tone="secondary">Your church-admin role still gives you access to this team after leaving.</AppText> : null}
      {currentLeaveState === 'final_team_admin' ? <View style={styles.guidance}>
        <AppText variant="small" tone="secondary">Another team admin must be appointed before you can leave.</AppText>
        <AppText variant="small" tone="secondary">A church admin can also remove your team admin role in Members first.</AppText>
      </View> : null}
      {!liveMembers ? <AppText variant="small" tone="muted">Membership changes are unavailable in demo mode.</AppText> : null}
      {leaveError ? <AppText tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{leaveError}</AppText> : null}
      <Pressable ref={leaveRef} accessibilityRole="button" accessibilityLabel={`Leave ${team.name}`}
        accessibilityHint="Removes only your membership after confirmation"
        accessibilityState={{ disabled: leaveDisabled, busy: leaving }} aria-disabled={leaveDisabled} aria-busy={leaving}
        disabled={leaveDisabled} onPress={() => void requestLeave()} testID="leave-team-action"
        style={({ pressed }) => [styles.leaveAction, pressed && styles.leavePressed]}>
        {leaving ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="log-out-outline" size={20} color={leaveDisabled ? colors.textMuted : colors.danger} accessible={false} />}
        <AppText variant="label" tone={leaveDisabled ? 'muted' : 'danger'}>{leaving ? 'Leaving…' : 'Leave team'}</AppText>
      </Pressable>
    </View> : null}

    <ActionSheet visible={manageOpen} title="Manage team" description={team.name} onClose={() => setManageOpen(false)} returnFocusRef={manageRef}
      actions={[...choices.map(({ destination, ...choice }) => ({ ...choice, onPress: () => router.push(destination) })),
        ...(canManagePhoto ? [{ key: 'photo', label: 'Team photo', description: 'Add, change or remove the team photo', icon: 'image-outline' as const,
          onPress: () => router.push({ pathname: '/teams/[teamId]/settings', params }) }] : [])]} />
  </Screen>;
}

const styles = StyleSheet.create({
  identityBlock: { gap: spacing.xs },
  identityHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityCopy: { flex: 1, minWidth: 0 },
  identityMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  manageAction: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md },
  pressed: { backgroundColor: colors.primarySoft },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tool: { flexGrow: 1, flexBasis: '45%', paddingHorizontal: spacing.md },
  section: { gap: spacing.md, marginTop: spacing.md },
  nextDate: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  guidance: { gap: spacing.xs, padding: spacing.md, backgroundColor: colors.surfaceRaised, borderRadius: radius.md },
  leaveAction: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  leavePressed: { backgroundColor: colors.dangerSoft },
});
