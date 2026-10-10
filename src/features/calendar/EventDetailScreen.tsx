import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
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
import { canManageEvents } from '../../lib/permissions';
import { SessionUser } from '../../types';
import { formatTime, parseDateKey } from '../../utils/dates';
import { recurrenceLabelForEvent } from '../../utils/recurrence';
import { eventDetailTimes } from './eventPresentation';
import { fullScheduleDate, ScheduleDateMarker } from './ScheduleRows';

export default function EventDetailScreen() {
  const { id, occurrenceStart } = useLocalSearchParams<{ id: string | string[]; occurrenceStart?: string | string[] }>();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  if (!user) return null;
  return <EventDetail key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}:${String(id)}:${user.orgRole}`}
    id={typeof id === 'string' ? id : null} occurrenceStart={typeof occurrenceStart === 'string' ? occurrenceStart : undefined}
    user={user} authorityResolved={!isLoading && (authMode !== 'supabase' || accountStatus === 'ready')} />;
}

function EventDetail({ id, occurrenceStart, user, authorityResolved }: {
  id: string | null; occurrenceStart?: string; user: SessionUser; authorityResolved: boolean;
}) {
  const router = useRouter();
  const data = useAppData();
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
  const event = data.events.find((candidate) => candidate.id === id && candidate.organisation_id === user.profile.organisation_id);
  const archivedTeam = !!event?.team_id && data.archivedTeams.some((team) => team.id === event.team_id && team.organisation_id === user.profile.organisation_id);
  const allowed = !!event && canManageEvents(user) && !archivedTeam;
  const current = useRef({ authorityResolved, allowed });
  current.current = { authorityResolved, allowed };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!deleted || !authorityResolved || navigated.current) return;
    navigated.current = true;
    showToast('Event deleted.');
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/calendar');
  }, [deleted, authorityResolved, router, showToast]);
  useEffect(() => { if (deleteError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [deleteError]);

  const handleDelete = async () => {
    if (!current.current.authorityResolved || !current.current.allowed || !event || requestPending.current) return;
    requestPending.current = true;
    setDeleting(true);
    try {
      const ok = await confirm({ title: event.is_recurring ? 'Delete the whole series?' : 'Delete event?',
        message: event.is_recurring ? `All dates in “${event.title}” will be removed, including this occurrence. This cannot be undone.`
          : `“${event.title}” will be removed from the church schedule. This cannot be undone.`,
        confirmLabel: event.is_recurring ? 'Delete series' : 'Delete event', destructive: true, returnFocusRef: manageRef });
      if (!ok || !active.current || !current.current.allowed || !current.current.authorityResolved) return;
      setDeleteError(null);
      await data.deleteEvent(event.id);
      if (active.current) setDeleted(true);
    } catch (error) {
      if (active.current) setDeleteError(error instanceof Error ? error.message : 'This event could not be deleted. Please try again.');
    } finally { requestPending.current = false; if (active.current) setDeleting(false); }
  };

  if (!authorityResolved || !event || deleted) return <Screen>
    <Stack.Screen options={{ title: 'Event' }} />
    {!authorityResolved || data.eventsLoading || deleted ? <StatePanel headingLevel={1} kind="loading" title={deleted ? 'Returning to the schedule…' : 'Loading event…'} />
      : data.eventsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this event" message={data.eventsError}
        action={{ label: 'Retry event', onPress: () => void data.refreshEvents() }} />
        : <StatePanel headingLevel={1} icon="calendar-outline" title="Event unavailable" message="This event may have been removed or is not available in your current church." />}
    <Button title="Back to schedule" variant="secondary" onPress={() => router.replace('/(tabs)/calendar')} />
  </Screen>;

  const { start, end } = eventDetailTimes(event, occurrenceStart);
  const category = data.categories.find((candidate) => candidate.id === event.category_id);
  const team = data.teams.find((candidate) => candidate.id === event.team_id && candidate.organisation_id === user.profile.organisation_id && candidate.archived_at === null);
  const recurrenceLabel = recurrenceLabelForEvent(event);
  const editParams = { id: event.id, ...(occurrenceStart ? { occurrenceStart } : {}) };

  return <Screen scrollRef={scrollRef}>
    <Stack.Screen options={{ title: 'Event' }} />
    {deleteError ? <StatePanel compact kind="error" title="Event wasn't deleted" message={deleteError}
      action={{ label: 'Try deleting again', onPress: () => void handleDelete() }} /> : null}
    {data.eventsError ? <StatePanel compact kind="error" title="Couldn't refresh this event" message={data.eventsError}
      action={{ label: 'Retry event', onPress: () => void data.refreshEvents() }} /> : null}
    <View style={styles.context}>
      <AppText variant="label" tone="primary" style={styles.contextLabel}>{category?.name ?? 'Church event'}</AppText>
      {allowed ? <Button ref={manageRef} title="Manage" accessibilityLabel="Manage event" variant="ghost" icon="options-outline"
        loading={deleting} onPress={() => setManaging(true)} /> : null}
    </View>
    <PageHeading title={event.title} />
    <ListGroup>
      <ListRow title={fullScheduleDate(start)} subtitle={`${formatTime(start.toISOString())} – ${formatTime(end.toISOString())}`}
        leading={<ScheduleDateMarker date={start} label={fullScheduleDate(start)} />} />
      <ListRow icon="location-outline" title="Where" subtitle={event.location} />
    </ListGroup>
    {recurrenceLabel ? <View style={styles.section}>
      <AppText variant="bodyBold">{recurrenceLabel}</AppText>
      {event.recurrence_end_date ? <AppText variant="small" tone="secondary">This series ends on {fullScheduleDate(parseDateKey(event.recurrence_end_date))}.</AppText> : null}
    </View> : null}
    <View style={styles.section}>
      <SectionHeader title="About this event" />
      <AppText>{event.description || 'No extra details have been added.'}</AppText>
      {team ? <AppText tone="secondary">Related team: {team.name}</AppText> : null}
      <AppText variant="small" tone="muted">Added by {userName(data.users, event.created_by)}</AppText>
    </View>
    {archivedTeam && canManageEvents(user) ? <StatePanel compact kind="info" title="Related team is archived"
      message="A church admin must restore the team before this event can be edited or deleted." /> : null}
    {allowed ? <>
      <ActionSheet visible={managing} title="Manage event" description={event.is_recurring ? 'Changes apply to every date in this series.' : undefined}
        onClose={() => setManaging(false)} returnFocusRef={manageRef} actions={[
          { key: 'edit', label: event.is_recurring ? 'Edit series' : 'Edit event', icon: 'create-outline', disabled: deleting,
            onPress: () => router.push({ pathname: '/events/edit', params: editParams }) },
          { key: 'delete', label: event.is_recurring ? 'Delete series' : 'Delete event', icon: 'trash-outline', destructive: true, disabled: deleting,
            onPress: () => void handleDelete() },
        ]} />
    </> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginVertical: spacing.sm },
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  contextLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
});
