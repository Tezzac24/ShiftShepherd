import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { AvailabilityBadge, availabilityLabels, Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { ModalSurface } from '../../components/ModalSurface';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useDiscardChanges } from '../../components/useDiscardChanges';
import { useAppData } from '../../lib/appData/AppDataContext';
import { availabilitySummaryForEntry, peopleForEntry, selectionsForEntrySection, userName } from '../../lib/appData/selectors';
import { canCancelRotaEntry, canManageSongSectionForRotaEntry, canManageTeamRota, canRespondToAssignment, sectionLeaderAssignment, songSectionLabels } from '../../lib/permissions';
import { AvailabilityStatus, RotaEntry, SongSection } from '../../types';
import { formatClockTime, parseDateKey } from '../../utils/dates';
import { fullScheduleDate, ScheduleDateMarker } from '../calendar/ScheduleRows';
import { RotaAccessState, RotaScope, RotaScopeValue } from './RotaScope';
import { matchingRotaEntry } from './rotaPresentation';

const RESPONSE_OPTIONS: AvailabilityStatus[] = ['available', 'maybe', 'unavailable'];
const SONG_SECTIONS: SongSection[] = ['praise', 'worship'];
type DateAction = 'cancel' | 'restore' | 'delete';
interface ActionResult { kind: DateAction; entry: RotaEntry }

export default function RotaDetailScreen() {
  const { teamId, entryId } = useLocalSearchParams<{ teamId: string | string[]; entryId: string | string[] }>();
  return <RotaScope teamId={typeof teamId === 'string' ? teamId : null} routeKey={`detail:${String(entryId)}`}>
    {(scope) => <RotaDetail scope={scope} entryId={typeof entryId === 'string' ? entryId : null} />}
  </RotaScope>;
}

function RotaDetail({ scope, entryId }: { scope: RotaScopeValue; entryId: string | null }) {
  const { user, team } = scope;
  const router = useRouter();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const entry = matchingRotaEntry(data.rotaEntries, entryId, team?.id ?? null, user.profile.organisation_id);
  const people = entry ? peopleForEntry(entry.id, data.rotaAssignments, data.availabilityResponses) : [];
  const me = people.find((person) => person.userId === user.profile.id);
  const myAssignmentsKey = me?.assignments.map((assignment) => assignment.id).sort().join(':') ?? '';
  const manager = !!team && canManageTeamRota(user, team.id);
  const [managing, setManaging] = useState(false);
  const [responding, setResponding] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AvailabilityStatus | null>(null);
  const [note, setNote] = useState('');
  const [initialResponse, setInitialResponse] = useState<{ status: AvailabilityStatus | null; note: string } | null>(null);
  const [savingResponse, setSavingResponse] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseSaved, setResponseSaved] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [announcementRequested, setAnnouncementRequested] = useState(false);
  const active = useRef(true);
  const closed = useRef(false);
  const requestPending = useRef(false);
  const cancellationVisible = useRef(false);
  const cancellationTransfersFocus = useRef(false);
  const offeredAnnouncement = useRef(false);
  const announcementNavigated = useRef(false);
  const reportedResponse = useRef(false);
  const lastResponseScope = useRef('');
  const responseRef = useRef<View>(null);
  const manageRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const responsePosition = useRef(0);
  const current = useRef({ ready: scope.ready, entry, me, myAssignmentsKey, manager });
  current.current = { ready: scope.ready, entry, me, myAssignmentsKey, manager };

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (scope.ready && entry?.status === 'cancelled') {
      cancellationVisible.current = false;
      setCancellationOpen(false);
    }
  }, [scope.ready, entry?.status]);
  useEffect(() => {
    if (!scope.ready || !entry) return;
    const key = `${myAssignmentsKey}:${entry.status}`;
    if (lastResponseScope.current === key) return;
    lastResponseScope.current = key;
    setResponding(false); setResponseError(null); setResponseSaved(false);
  }, [scope.ready, myAssignmentsKey, entry]);
  useEffect(() => { if (actionError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [actionError]);
  useEffect(() => {
    if (responseError && !responding) scrollRef.current?.scrollTo({ y: Math.max(0, responsePosition.current - spacing.md), animated: false });
  }, [responseError, responding]);
  useEffect(() => {
    if (!responseSaved || !scope.ready || reportedResponse.current || closed.current) return;
    reportedResponse.current = true; setResponding(false); showToast('Availability saved.');
  }, [responseSaved, scope.ready, showToast]);
  useEffect(() => {
    if (!actionResult || !scope.ready || !team || closed.current) return;
    if (actionResult.kind === 'delete') {
      closed.current = true; showToast('Date deleted.');
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
      return;
    }
    if (actionResult.kind !== 'cancel' || offeredAnnouncement.current || !manager || !entry) return;
    offeredAnnouncement.current = true;
    void (async () => {
      const announce = await confirm({ title: 'Write an announcement?',
        message: 'The date is cancelled. You can review a team announcement on the next screen, then choose Post announcement to publish it.',
        confirmLabel: 'Write announcement', cancelLabel: 'Not now', destructive: false, returnFocusRef: manageRef });
      if (announce && active.current && !closed.current) setAnnouncementRequested(true);
    })();
  }, [actionResult, scope.ready, team, manager, entry, confirm, router, showToast]);
  useEffect(() => {
    if (!announcementRequested || !actionResult || !scope.ready || !manager || !entry || !team || closed.current || announcementNavigated.current) return;
    announcementNavigated.current = true;
    router.push({ pathname: '/announcements/edit', params: { teamId: team.id, presetTitle: `Cancelled: ${actionResult.entry.title}`,
      presetBody: `${actionResult.entry.title} on ${fullScheduleDate(parseDateKey(actionResult.entry.date))} has been cancelled.${actionResult.entry.cancellation_reason ? `\n\nReason: ${actionResult.entry.cancellation_reason}` : ''}` } });
  }, [announcementRequested, actionResult, scope.ready, manager, entry, team, router]);

  const close = () => {
    closed.current = true;
    if (router.canGoBack()) router.back();
    else if (team) router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
    else router.replace('/(tabs)/teams');
  };
  const startResponding = () => {
    const state = current.current;
    if (!active.current || closed.current || !state.ready || !state.me || state.entry?.status === 'cancelled' || requestPending.current) return;
    // Closing the sheet does not cancel an in-flight save. A failed submitted
    // draft stays available for review rather than being replaced by a partial
    // saved response from the first of several roles.
    if (responseError) { setResponding(true); return; }
    setInitialResponse({ status: state.me.status !== 'not_responded' ? state.me.status : null, note: state.me.note ?? '' });
    setPendingStatus(state.me.status !== 'not_responded' ? state.me.status : null);
    setNote(state.me.note ?? ''); setResponseError(null); setResponseSaved(false); reportedResponse.current = false;
    setResponding(true);
  };
  const { requestExit: discardResponse, exitRef: responseCancelRef } = useDiscardChanges({
    hasChanges: responding && initialResponse !== null && (pendingStatus !== initialResponse.status || note !== initialResponse.note),
    blocked: savingResponse, saved: responseSaved, uncertain: responding && responseError !== null,
    message: 'Your availability choice and note will not be saved.', onDiscard: () => setResponding(false),
  });
  const saveResponse = async () => {
    const state = current.current;
    if (!active.current || closed.current || !state.ready || !state.me || !state.entry || state.entry.status === 'cancelled' || !pendingStatus || requestPending.current) return;
    const assignments = state.me.assignments;
    const expectedKey = state.myAssignmentsKey;
    let saved = 0;
    requestPending.current = true; setSavingResponse(true); setResponseError(null);
    try {
      // A single person response still writes every original assignment, in order.
      // Re-check after each await before starting another write.
      for (const assignment of assignments) {
        const latest = current.current;
        if (!active.current || closed.current) return;
        if (!latest.ready || latest.entry?.status === 'cancelled' || latest.myAssignmentsKey !== expectedKey
          || !canRespondToAssignment(user, assignment)) {
          throw new Error('This date or your access changed. Check the latest details before saving again.');
        }
        await data.setAvailability(assignment.id, user.profile.id, pendingStatus, note.trim() || null);
        saved++;
      }
      if (active.current && !closed.current) setResponseSaved(true);
    } catch (error) {
      if (active.current && !closed.current) {
        const message = error instanceof Error ? error.message : 'Your availability could not be saved. Please try again.';
        setResponseError(saved > 0 ? `${saved} of ${assignments.length} roles saved. ${message}` : message);
      }
    } finally { requestPending.current = false; if (active.current) setSavingResponse(false); }
  };
  const closeCancellation = () => {
    cancellationVisible.current = false;
    setCancellationOpen(false);
  };
  const startCancellation = () => {
    const state = current.current;
    if (!active.current || closed.current || !state.ready || !state.manager || !state.entry
      || state.entry.status === 'cancelled' || !canCancelRotaEntry(user, state.entry) || requestPending.current) return;
    if (!cancellationError) setCancellationReason('');
    setActionError(null);
    cancellationTransfersFocus.current = false;
    cancellationVisible.current = true;
    setCancellationOpen(true);
  };
  const cancelDate = async () => {
    const state = current.current;
    if (!active.current || closed.current || !cancellationVisible.current || !state.ready || !state.manager || !state.entry
      || state.entry.status === 'cancelled' || !canCancelRotaEntry(user, state.entry) || requestPending.current) return;
    const target = state.entry;
    const reason = cancellationReason.trim() || null;
    requestPending.current = true; setActionBusy(true); setActionError(null); setCancellationError(null); setActionResult(null);
    try {
      await data.cancelRotaEntry(target.id, user.profile.id, reason);
      if (!active.current || closed.current) return;
      // The optional announcement dialog will own focus after this surface.
      cancellationTransfersFocus.current = true;
      closeCancellation();
      offeredAnnouncement.current = false; announcementNavigated.current = false; setAnnouncementRequested(false);
      setActionResult({ kind: 'cancel', entry: { ...target, cancellation_reason: reason } });
      if (current.current.ready) showToast('Date cancelled.');
    } catch (error) {
      if (active.current && !closed.current) {
        const message = error instanceof Error ? error.message : 'This date could not be cancelled. Please try again.';
        setCancellationError(message); setActionError(message);
      }
    } finally { requestPending.current = false; if (active.current) setActionBusy(false); }
  };
  const act = async (kind: Exclude<DateAction, 'cancel'>) => {
    const state = current.current;
    if (!active.current || closed.current || !state.ready || !state.manager || !state.entry || requestPending.current) return;
    const target = state.entry;
    if (kind === 'restore' && target.status !== 'cancelled') return;
    requestPending.current = true; setActionBusy(true); setActionError(null); setActionResult(null);
    try {
      const ok = await confirm({
        title: kind === 'restore' ? 'Restore this date?' : 'Delete this date?',
        message: kind === 'restore'
            ? `“${target.title}” will be active again, with its people and songs kept. Assigned people can respond again.`
            : `“${target.title}” and its assignments, availability responses and song selections will be removed. This cannot be undone.`,
        confirmLabel: kind === 'restore' ? 'Restore date' : 'Delete date',
        destructive: kind !== 'restore', returnFocusRef: manageRef,
      });
      const latest = current.current;
      if (!ok || !active.current || closed.current || !latest.ready || !latest.manager || !latest.entry || latest.entry.status !== target.status) return;
      if (kind === 'restore') await data.restoreRotaEntry(target.id);
      else await data.deleteRotaEntry(target.id);
      if (!active.current || closed.current) return;
      offeredAnnouncement.current = false; announcementNavigated.current = false; setAnnouncementRequested(false); setActionResult({ kind, entry: target });
      if (kind !== 'delete' && current.current.ready) showToast('Date restored.');
    } catch (error) {
      if (active.current && !closed.current) setActionError(error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.');
    } finally { requestPending.current = false; if (active.current) setActionBusy(false); }
  };

  const resultTitle = actionResult?.kind === 'delete' ? 'Date deleted' : actionResult?.kind === 'cancel' ? 'Date cancelled' : actionResult?.kind === 'restore' ? 'Date restored' : 'Availability saved';
  if (actionResult?.kind === 'delete' || (!scope.ready && (actionResult || responseSaved))) return <Screen>
    <Stack.Screen options={{ title: 'Rota' }} />
    <PageHeading title={resultTitle} description="Your change has been saved." />
    {!scope.ready ? <StatePanel compact kind="loading" title="Checking your access…" message="You can close this screen or wait to continue." /> : null}
    <Button title="Close" variant="secondary" onPress={close} />
  </Screen>;
  if (!scope.ready || !team) return <RotaAccessState scope={scope} onExit={close} exitLabel="Back to rota" />;
  if (!entry) return <Screen><Stack.Screen options={{ title: 'Rota' }} />
    {data.rotasLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading this date…" />
      : data.rotasError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this date" message={data.rotasError}
        action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} />
        : <StatePanel headingLevel={1} title="Date unavailable" message="This date may have been removed or belongs to a different team." />}
    <Button title="Back to rota" variant="secondary" onPress={() => { closed.current = true; router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } }); }} />
  </Screen>;

  const cancelled = entry.status === 'cancelled';
  const date = parseDateKey(entry.date);
  const assignments = people.flatMap((person) => person.assignments);
  const summary = availabilitySummaryForEntry(entry.id, data.rotaAssignments, data.availabilityResponses);
  const busy = actionBusy || savingResponse;
  return <Screen scrollRef={scrollRef}>
    <Stack.Screen options={{ title: 'Rota' }} />
    {actionError && !cancellationOpen ? <StatePanel compact kind="error" title="Couldn't update this date" message={actionError} /> : null}
    {data.rotasError ? <StatePanel compact kind="error" title="Couldn't refresh this date" message="These are the last details loaded. Try again for the latest changes."
      action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /> : null}
    <View style={styles.context}>
      <AppText variant="label" tone="primary" style={styles.contextLabel}>{team.name}</AppText>
      {manager ? <Button ref={manageRef} title="Manage" accessibilityLabel="Manage this date" variant="ghost" icon="options-outline"
        disabled={savingResponse} loading={actionBusy} onPress={() => setManaging(true)} /> : null}
    </View>
    <PageHeading title={entry.title} />
    <ListGroup><ListRow title={fullScheduleDate(date)} subtitle={entry.time ? formatClockTime(entry.time) : 'No time set'}
      leading={<ScheduleDateMarker date={date} label={fullScheduleDate(date)} />} /></ListGroup>
    {cancelled ? <StatePanel compact kind="info" icon="close-circle-outline" title="This date is cancelled"
      message={[`It stays in the team history. No availability response is needed.`, entry.cancellation_reason,
        entry.cancelled_by ? `Cancelled by ${userName(data.users, entry.cancelled_by)}.` : null].filter(Boolean).join('\n')} /> : null}
    {me ? <View style={styles.personal} onLayout={(event) => { responsePosition.current = event.nativeEvent.layout.y; }}>
      <AppText variant="subheading" headingLevel={2}>Your serving</AppText>
      <AppText variant="bodyBold">{me.roleSummary}</AppText>
      {!cancelled ? <>
        <AvailabilityBadge status={me.status} />
        {me.note ? <AppText tone="secondary">Your note: {me.note}</AppText> : null}
        {responseSaved ? <AppText tone="primary" accessibilityLiveRegion="polite">Availability saved.</AppText> : null}
        {responseError && !responding ? <StatePanel compact kind="error" title="Response needs attention" message={responseError} /> : null}
        <Button ref={responseRef} title={savingResponse ? 'Saving response…' : responseError ? 'Review response' : me.status === 'not_responded' ? 'Confirm availability' : 'Change availability'}
          icon="hand-left-outline" disabled={busy} loading={savingResponse} onPress={startResponding} />
      </> : <AppText tone="secondary">You do not need to respond.</AppText>}
    </View> : null}
    {entry.notes ? <View style={styles.section}><SectionHeader title="Notes for the team" /><AppText>{entry.notes}</AppText></View> : null}

    {team.type === 'choir' ? <View style={styles.section}>
      <SectionHeader title="Songs for this date" />
      {data.songsLoading && data.songs.length === 0 ? <StatePanel compact kind="loading" title="Loading selected songs…" />
        : data.songsError && data.songs.length === 0 ? <StatePanel compact kind="error" title="Couldn't load songs" message={data.songsError}
          action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} />
          : <>
            {data.songsError ? <StatePanel compact kind="error" title="Couldn't refresh songs" message="These are the last song choices loaded."
              action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} /> : null}
            {cancelled && !SONG_SECTIONS.some((section) => selectionsForEntrySection(entry.id, section, data.songSelections).length > 0)
              ? <AppText tone="secondary">No songs were selected for this date.</AppText>
              : SONG_SECTIONS.map((section) => {
              const label = songSectionLabels[section];
              const leader = sectionLeaderAssignment(assignments, section);
              const selections = selectionsForEntrySection(entry.id, section, data.songSelections);
              const allowed = !cancelled && canManageSongSectionForRotaEntry(user, entry, data.rotaAssignments, section);
              return <View key={section} style={styles.songSection}>
                <AppText variant="subheading" headingLevel={3}>{label} songs</AppText>
                {leader ? <AppText tone="secondary">Led by {userName(data.users, leader.user_id)}</AppText> : null}
                {selections.length ? <ListGroup>{selections.map((selection, index) => {
                  const song = data.songs.find((item) => item.id === selection.song_id && item.team_id === team.id && item.organisation_id === user.profile.organisation_id);
                  return song ? <ListRow key={selection.id} title={song.title} subtitle={song.artist ?? undefined}
                    leading={<View style={styles.songNumber}><AppText variant="label" tone="primary">{index + 1}</AppText></View>}
                    accessibilityLabel={`Open ${song.title}`} onPress={() => router.push({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: team.id, songId: song.id } })} />
                    : <View key={selection.id} style={styles.unavailableSong}><AppText tone="secondary">A selected song is unavailable.</AppText></View>;
                })}</ListGroup> : <AppText tone="secondary">No {label.toLowerCase()} songs selected yet.</AppText>}
                {allowed ? <Button title={selections.length ? `Change ${label.toLowerCase()} songs` : `Choose ${label.toLowerCase()} songs`}
                  variant="secondary" icon="musical-notes-outline" disabled={busy}
                  onPress={() => router.push({ pathname: '/teams/[teamId]/rota/[entryId]/select-songs', params: { teamId: team.id, entryId: entry.id, section } })} /> : null}
              </View>;
            })}
          </>}
    </View> : null}

    <View style={styles.section}>
      <SectionHeader title={cancelled ? 'Who was expected' : 'Who is serving'} />
      {!cancelled && people.length ? <View style={styles.badges}>
        {summary.available > 0 ? <Badge label={`${summary.available} available`} tone="success" /> : null}
        {summary.maybe > 0 ? <Badge label={`${summary.maybe} maybe`} tone="warning" /> : null}
        {summary.unavailable > 0 ? <Badge label={`${summary.unavailable} unavailable`} tone="danger" /> : null}
        {summary.not_responded > 0 ? <Badge label={`${summary.not_responded} not responded`} /> : null}
      </View> : null}
      {people.length ? <ListGroup>{people.map((person) => {
        const profile = data.users.find((candidate) => candidate.id === person.userId && candidate.organisation_id === user.profile.organisation_id);
        const name = profile?.full_name ?? 'Team member';
        return <View key={person.userId} style={styles.person}>
          <Avatar name={name} uri={data.getAvatarUri(profile)} size={40} />
          <View style={styles.personText}>
            <AppText variant="bodyBold">{name}{person.userId === user.profile.id ? ' (you)' : ''}</AppText>
            <AppText tone="secondary">{person.roleSummary}</AppText>
            {!cancelled ? <AvailabilityBadge status={person.status} /> : null}
            {manager && person.note ? <AppText tone="secondary">{person.note}</AppText> : null}
          </View>
        </View>;
      })}</ListGroup> : <AppText tone="secondary">No one has been added to this date yet.</AppText>}
    </View>

    {manager ? <ActionSheet visible={managing} title="Manage date" description={entry.title} returnFocusRef={manageRef} onClose={() => setManaging(false)} actions={[
      ...(!cancelled ? [
        { key: 'edit', label: 'Edit date', icon: 'create-outline' as const, disabled: busy,
          onPress: () => router.push({ pathname: '/teams/[teamId]/rota/edit', params: { teamId: team.id, entryId: entry.id } }) },
        { key: 'cancel', label: 'Cancel this date', description: 'Keep it in team history. You can restore it later.', icon: 'close-circle-outline' as const, destructive: true, disabled: busy, onPress: startCancellation },
      ] : [{ key: 'restore', label: 'Restore this date', icon: 'refresh-outline' as const, disabled: busy, onPress: () => void act('restore') }]),
      { key: 'delete', label: 'Delete this date', description: 'Permanently remove this date and its details.', icon: 'trash-outline', destructive: true, disabled: busy, onPress: () => void act('delete') },
    ]} /> : null}
    {manager && !cancelled ? <ModalSurface visible={cancellationOpen} title="Cancel this date?" returnFocusRef={manageRef}
      shouldRestoreFocus={() => !cancellationTransfersFocus.current} onClose={closeCancellation} footer={<View style={styles.sheetActions}>
        {cancellationError ? <AppText tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{cancellationError}</AppText> : null}
        <Button title="Cancel date" variant="destructive" loading={actionBusy} onPress={() => void cancelDate()} />
        <Button title="Keep date" variant="secondary" disabled={actionBusy} onPress={closeCancellation} />
      </View>}>
      <AppText variant="bodyBold">{entry.title}</AppText>
      <AppText tone="secondary">{fullScheduleDate(date)}</AppText>
      <AppText>This date will stay on the rota marked Cancelled. You can restore it later if plans change.</AppText>
      <TextField label="Reason (optional)" helper="This reason appears on the team rota." placeholder="e.g. The building is unavailable."
        value={cancellationReason} onChangeText={setCancellationReason} multiline editable={!actionBusy} />
    </ModalSurface> : null}
    {me && !cancelled ? <ModalSurface visible={responding} title="Your availability" returnFocusRef={responseRef}
      onClose={() => { if (savingResponse) setResponding(false); else discardResponse(); }} footer={<View style={styles.sheetActions}>
        {responseError ? <AppText tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{responseError}</AppText> : null}
        <Button title="Save response" loading={savingResponse} disabled={!pendingStatus} onPress={() => void saveResponse()} />
        <Button ref={responseCancelRef} title="Cancel" variant="secondary" disabled={savingResponse} onPress={() => discardResponse()} />
      </View>}>
      <AppText variant="bodyBold">{entry.title}</AppText>
      <AppText tone="secondary">{fullScheduleDate(date)}</AppText>
      {me.assignments.length > 1 ? <AppText tone="secondary">One response covers all your roles: {me.roleSummary}.</AppText> : null}
      <AppText variant="bodyBold">Can you make it?</AppText>
      <ListGroup>{RESPONSE_OPTIONS.map((status) => <ListRow key={status} title={availabilityLabels[status]}
        accessibilityRole="radio" accessibilityState={{ checked: pendingStatus === status }}
        showChevron={false} disabled={savingResponse} onPress={() => setPendingStatus(status)}
        right={<Ionicons name={pendingStatus === status ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={colors.primary} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />} />)}</ListGroup>
      <TextField label="Note (optional)" placeholder="e.g. I may be 10 minutes late." value={note} onChangeText={setNote} multiline editable={!savingResponse} />
    </ModalSurface> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  contextLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 150 },
  personal: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  section: { gap: spacing.md, marginTop: spacing.md },
  songSection: { gap: spacing.sm, paddingVertical: spacing.sm },
  songNumber: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm },
  unavailableSong: { padding: spacing.lg },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  person: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  personText: { flex: 1, gap: spacing.sm },
  sheetActions: { gap: spacing.sm },
});
