import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AnnouncementImage } from '../../components/AnnouncementImage';
import { AppText } from '../../components/AppText';
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

  if (!authorityResolved || !announcement || deleted) return <Screen>
    <Stack.Screen options={{ title: 'Announcement' }} />
    {!authorityResolved || data.announcementsLoading || deleted ? <StatePanel headingLevel={1} kind="loading" title={deleted ? 'Returning to announcements…' : 'Loading announcement…'} />
      : data.announcementsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this announcement" message={data.announcementsError}
        action={{ label: 'Retry announcement', onPress: () => void data.refreshAnnouncements() }} />
        : <StatePanel headingLevel={1} icon="megaphone-outline" title="Announcement unavailable" message="This announcement may have been removed or is not available in your current church." />}
    <Button title="All announcements" variant="secondary" onPress={() => router.replace('/announcements')} />
  </Screen>;

  const linkedEvent = data.events.find((event) => event.id === announcement.linked_event_id && event.organisation_id === user.profile.organisation_id);
  return <Screen scrollRef={scrollRef}>
    <Stack.Screen options={{ title: 'Announcement' }} />
    {deleteError ? <StatePanel compact kind="error" title="Announcement wasn't deleted" message={deleteError}
      action={{ label: 'Try deleting again', onPress: () => void handleDelete() }} /> : null}
    {data.announcementsError ? <StatePanel compact kind="error" title="Couldn't refresh this announcement" message={data.announcementsError}
      action={{ label: 'Retry announcement', onPress: () => void data.refreshAnnouncements() }} /> : null}
    <View style={styles.notice}>
      <View style={styles.context}>
        <AppText variant="label" tone="primary" style={styles.contextLabel}>{team?.name ?? (announcement.team_id ? 'Team announcement' : 'Whole church')}</AppText>
        {allowed ? <Button ref={manageRef} title="Manage" accessibilityLabel="Manage announcement" variant="ghost" icon="options-outline"
          loading={deleting} onPress={() => setManaging(true)} /> : null}
      </View>
      <PageHeading title={announcement.title} />
      {announcement.pinned ? <AppText variant="small" tone="accent">Pinned · Kept at the top of announcements</AppText> : null}
      <AppText variant="small" tone="secondary">Posted by {userName(data.users, announcement.created_by)}</AppText>
      <AppText variant="small" tone="muted">{formatFullDate(new Date(announcement.created_at))} · {formatTime(announcement.created_at)}</AppText>
      <AnnouncementImage uri={data.getAnnouncementImageUri(announcement)} height={220} presentation="full" accessibilityLabel={`Image for ${announcement.title}`} />
      <AppText style={styles.body}>{announcement.body}</AppText>
    </View>
    {linkedEvent ? <View style={styles.section}>
      <SectionHeader title="Linked event" />
      <ListGroup><ListRow icon="calendar-outline" title={linkedEvent.title}
        subtitle={formatUpcoming(new Date(linkedEvent.start_time))}
        onPress={() => router.push({ pathname: '/events/[id]', params: { id: linkedEvent.id } })} /></ListGroup>
    </View> : null}
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
  notice: { gap: spacing.sm, borderTopWidth: spacing.xs, borderTopColor: colors.accent, paddingTop: spacing.lg },
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  contextLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  body: { marginTop: spacing.md },
  section: { gap: spacing.sm, marginTop: spacing.md },
});
