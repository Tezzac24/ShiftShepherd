import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AnnouncementImage } from '../../components/AnnouncementImage';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName } from '../../lib/appData/selectors';
import { useAuth } from '../../lib/auth/AuthContext';
import { canEditAnnouncement } from '../../lib/permissions';
import { SessionUser } from '../../types';
import { formatFullDate, formatTime, formatUpcoming } from '../../utils/dates';
import { useCurrentTime } from '../../utils/useCurrentTime';
import { announcementAccentColor } from './announcementAccent';
import { accessibleAnnouncements, announcementAuthorityKey, announcementTeam } from './announcementPresentation';

export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  if (!user) return null;
  return <AnnouncementDetail key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}:${String(id)}:${announcementAuthorityKey(user)}`}
    id={typeof id === 'string' ? id : null} user={user}
    authorityResolved={!isLoading && (authMode !== 'supabase' || accountStatus === 'ready')} />;
}

function AnnouncementDetail({ id, user, authorityResolved }: { id: string | null; user: SessionUser; authorityResolved: boolean }) {
  const router = useRouter();
  const navigation = useNavigation('/');
  const data = useAppData();
  useCurrentTime();
  const confirm = useConfirm();
  const showToast = useToast();
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const active = useRef(true);
  const requestPending = useRef(false);
  const navigated = useRef(false);
  const manageRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const announcement = accessibleAnnouncements(user, data.announcements, data.archivedTeams).find((notice) => notice.id === id);
  const team = announcementTeam(user, data.teams, announcement?.team_id);
  const allowed = !!announcement && canEditAnnouncement(user, announcement) && (!announcement.team_id || !!team);
  const current = useRef({ allowed, authorityResolved, announcement });
  current.current = { allowed, authorityResolved, announcement };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!deleted || !authorityResolved || navigated.current) return;
    navigated.current = true;
    showToast('Announcement deleted.');
    if (router.canGoBack()) router.back(); else router.replace('/announcements');
  }, [deleted, authorityResolved, router, showToast]);
  useEffect(() => { if (deleteError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [deleteError]);

  const handleDelete = async () => {
    if (!current.current.allowed || !current.current.authorityResolved || !announcement || requestPending.current) return;
    requestPending.current = true;
    setDeleting(true);
    try {
      const ok = await confirm({ title: 'Delete announcement?',
        message: `“${announcement.title}” will be removed. This cannot be undone.`,
        confirmLabel: 'Delete announcement', destructive: true, returnFocusRef: manageRef });
      if (!ok || !active.current || !current.current.allowed || !current.current.authorityResolved) return;
      setDeleteError(null);
      await data.deleteAnnouncement(announcement.id);
      if (active.current) setDeleted(true);
    } catch (error) {
      if (active.current) setDeleteError(error instanceof Error ? error.message : 'This announcement could not be deleted. Please try again.');
    } finally {
      requestPending.current = false;
      if (active.current) setDeleting(false);
    }
  };

  const handleViewTeam = () => {
    if (!team) return;
    const state = navigation.getState();
    if (state?.type === 'stack') {
      // Match the actual team, not just the shared dynamic route name.
      for (let index = state.index - 1; index >= 0; index--) {
        const route = state.routes[index];
        if (route.name === 'teams/[teamId]/index' && route.params &&
          'teamId' in route.params && route.params.teamId === team.id) {
          router.dismiss(state.index - index);
          return;
        }
      }
    }
    router.push({ pathname: '/teams/[teamId]', params: { teamId: team.id } });
  };

  if (!authorityResolved || !announcement || deleted) return <Screen>
    <Stack.Screen options={{ title: 'Announcement' }} />
    {!authorityResolved || data.announcementsLoading || deleted ? <StatePanel headingLevel={1} kind="loading" title={deleted ? 'Returning to announcements…' : 'Loading announcement…'} />
      : data.announcementsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this announcement" message={data.announcementsError}
        action={{ label: 'Retry announcement', onPress: () => void data.refreshAnnouncements() }} />
        : <StatePanel headingLevel={1} icon="megaphone-outline" title="Announcement unavailable" message="This announcement may have been removed or is not available in your current church." />}
    <Button title="All announcements" variant="secondary" onPress={() => router.dismissTo('/announcements')} />
  </Screen>;

  const linkedEvent = data.events.find((event) => event.id === announcement.linked_event_id && event.organisation_id === user.profile.organisation_id);
  const author = data.users.find((profile) => profile.id === announcement.created_by && profile.organisation_id === user.profile.organisation_id);
  const authorName = userName(author ? [author] : [], announcement.created_by);
  const accentColor = announcementAccentColor(announcement.team_id ? team?.name : undefined);
  const imageUri = data.getAnnouncementImageUri(announcement);
  return <Screen scrollRef={scrollRef}>
    <Stack.Screen options={{ title: 'Announcement' }} />
    {deleteError ? <StatePanel compact kind="error" title="Announcement wasn't deleted" message={deleteError}
      action={{ label: 'Try deleting again', onPress: () => void handleDelete() }} /> : null}
    {data.announcementsError ? <StatePanel compact kind="error" title="Couldn't refresh this announcement" message={data.announcementsError}
      action={{ label: 'Retry announcement', onPress: () => void data.refreshAnnouncements() }} /> : null}
    <View style={[styles.notice, { borderTopColor: accentColor }]}>
      <View style={styles.heading}>
        <View style={styles.context}>
          <View style={styles.noticeIcon}>
            <Ionicons name="megaphone-outline" size={26} color={colors.primary} accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
          </View>
          <AppText variant="label" tone="primary" style={styles.contextLabel}>{team?.name ?? (announcement.team_id ? 'Team announcement' : 'Whole church')}</AppText>
          {allowed ? <Button ref={manageRef} title="Manage" accessibilityLabel="Manage announcement" variant="ghost" icon="options-outline"
            loading={deleting} onPress={() => setManaging(true)} /> : null}
        </View>
        <PageHeading title={announcement.title} />
        <View style={styles.date}>
          {announcement.pinned ? <View accessible accessibilityRole="image" accessibilityLabel="Pinned announcement">
            <Ionicons name="pin" size={22} color={colors.primary} accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
          </View> : null}
          <AppText variant="small" tone="secondary" style={styles.dateText}>{formatFullDate(new Date(announcement.created_at))} · {formatTime(announcement.created_at)}</AppText>
        </View>
      </View>
      <View style={styles.message}>
        <AnnouncementImage uri={imageUri} height={220} presentation="full" accessibilityLabel={`Image for ${announcement.title}`} />
        <AppText>{announcement.body}</AppText>
      </View>
      <View style={styles.author}>
        <Avatar name={authorName} uri={data.getAvatarUri(author)} decorative />
        <View style={styles.authorText}>
          <AppText variant="small" tone="secondary">Posted by</AppText>
          <AppText variant="bodyBold">{authorName}</AppText>
        </View>
      </View>
    </View>
    {linkedEvent ? <View style={styles.section}>
      <SectionHeader title="Linked event" />
      <ListGroup><ListRow icon="calendar-outline" title={linkedEvent.title}
        subtitle={formatUpcoming(new Date(linkedEvent.start_time))}
        onPress={() => router.push({ pathname: '/events/[id]', params: { id: linkedEvent.id } })} /></ListGroup>
    </View> : null}
    <View style={styles.section}>
      <SectionHeader title="Keep exploring" />
      <ListGroup>
        {team ? <ListRow icon="people-outline" title="View team" subtitle={team.name}
          onPress={handleViewTeam} /> : null}
        <ListRow icon="megaphone-outline" title="All announcements" subtitle="More updates from your church"
          onPress={() => router.dismissTo('/announcements')} />
      </ListGroup>
    </View>
    {allowed ? <>
      <ActionSheet visible={managing} title="Manage announcement" onClose={() => setManaging(false)} returnFocusRef={manageRef}
        actions={[
          { key: 'edit', label: 'Edit announcement', icon: 'create-outline', disabled: deleting,
            onPress: () => router.push({ pathname: '/announcements/edit', params: { id: announcement.id } }) },
          { key: 'delete', label: 'Delete announcement', icon: 'trash-outline', destructive: true, disabled: deleting,
            onPress: () => void handleDelete() },
        ]} />
    </> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  notice: { borderWidth: 1, borderColor: colors.border, borderTopWidth: spacing.xs, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  heading: { padding: spacing.gutter, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  noticeIcon: { width: 40, height: 40, flexShrink: 0, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  contextLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 104, minWidth: 0 },
  date: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateText: { flex: 1, minWidth: 0 },
  message: { padding: spacing.gutter, gap: spacing.lg, minHeight: 140 },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.gutter },
  authorText: { flex: 1, minWidth: 0, gap: spacing.xs },
  section: { gap: spacing.sm, marginTop: spacing.md },
});
