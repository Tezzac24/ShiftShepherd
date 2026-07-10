import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { AvailabilityBadge, availabilityLabels, Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import {
  availabilitySummaryForEntry,
  peopleForEntry,
  selectionsForEntrySection,
  songById,
  userName,
} from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canCancelRotaEntry,
  canManageSongSectionForRotaEntry,
  canManageTeamRota,
  canViewTeam,
  sectionLeaderAssignment,
  songSectionLabels,
} from '../../lib/permissions';
import { AvailabilityStatus, SongSection } from '../../types';
import { formatClockTime, formatFullDate, parseDateKey } from '../../utils/dates';

const RESPONSE_OPTIONS: AvailabilityStatus[] = ['available', 'maybe', 'unavailable'];
const SONG_SECTIONS: SongSection[] = ['praise', 'worship'];

export default function RotaDetailScreen() {
  const router = useRouter();
  const { teamId, entryId } = useLocalSearchParams<{ teamId: string; entryId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();

  const team = data.teams.find((t) => t.id === teamId);
  const entry = data.rotaEntries.find((e) => e.id === entryId);

  const people = entry
    ? peopleForEntry(entry.id, data.rotaAssignments, data.availabilityResponses)
    : [];
  const me = people.find((p) => p.userId === user.profile.id);

  const [responding, setResponding] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AvailabilityStatus | null>(null);
  const [note, setNote] = useState('');
  const [savingResponse, setSavingResponse] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  // One flag for cancel/restore/delete — the leader actions never run together.
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!team || !entry || !canViewTeam(user, team.id)) {
    // Live mode: don't flash "not found" while the rota/directory still loads.
    const stillLoading = data.rotasLoading || data.teamsLoading;
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Rota' }} />
        {stillLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <AppText tone="secondary">Loading the rota…</AppText>
          </View>
        ) : data.rotasError ? (
          <>
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn’t load the rota"
              message={data.rotasError}
            />
            <Button
              title="Try Again"
              variant="secondary"
              icon="refresh-outline"
              onPress={() => void data.refreshRotas()}
            />
          </>
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="Rota entry not found"
            message="This rota entry may have been removed."
          />
        )}
      </Screen>
    );
  }

  const isChoir = team.type === 'choir';
  const isLeader = canManageTeamRota(user, team.id);
  const cancelled = entry.status === 'cancelled';
  const entryAssignments = people.flatMap((p) => p.assignments);
  const summary = availabilitySummaryForEntry(
    entry.id,
    data.rotaAssignments,
    data.availabilityResponses,
  );

  const startResponding = () => {
    setPendingStatus(me && me.status !== 'not_responded' ? me.status : null);
    setNote(me?.note ?? '');
    setResponseError(null);
    setResponding(true);
  };

  const saveResponse = async () => {
    if (!me || !pendingStatus || savingResponse) return;
    setResponseError(null);
    setSavingResponse(true);
    try {
      // One human answer covers all of this person's roles on the date
      // (e.g. someone who is both Praise Leader and Worship Leader).
      for (const a of me.assignments) {
        await data.setAvailability(a.id, user.profile.id, pendingStatus, note.trim() || null);
      }
      showToast('Availability saved.');
      setResponding(false);
    } catch (error) {
      setResponseError(
        error instanceof Error
          ? error.message
          : 'Your availability could not be saved. Please try again.',
      );
    } finally {
      setSavingResponse(false);
    }
  };

  const handleCancelEntry = async () => {
    if (actionBusy) return;
    const ok = await confirm({
      title: 'Cancel this date?',
      message: `“${entry.title}” will stay on the rota marked as Cancelled, so everyone can see it is not going ahead. You can restore it later if plans change.`,
      confirmLabel: 'Cancel This Date',
    });
    if (!ok) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await data.cancelRotaEntry(entry.id, user.profile.id, null);
      showToast('This date is now marked as cancelled.');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.',
      );
      return;
    } finally {
      setActionBusy(false);
    }
    const announce = await confirm({
      title: 'Tell the team?',
      message: 'Would you like to write a team announcement so everyone hears about the cancellation? Nothing is sent without you.',
      confirmLabel: 'Write Announcement',
      destructive: false,
    });
    if (announce) {
      router.push({
        pathname: '/announcements/edit',
        params: {
          teamId: team.id,
          presetTitle: `Cancelled: ${entry.title}`,
          presetBody: `${entry.title} on ${formatFullDate(parseDateKey(entry.date))} has been cancelled. Sorry for any inconvenience — see you at the next one!`,
        },
      });
    }
  };

  const handleRestoreEntry = async () => {
    if (actionBusy) return;
    const ok = await confirm({
      title: 'Restore this date?',
      message: 'This will put the date back on the rota as normal.',
      confirmLabel: 'Restore',
      destructive: false,
    });
    if (!ok) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await data.restoreRotaEntry(entry.id);
      showToast('This date is back on the rota.');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.',
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (actionBusy) return;
    const ok = await confirm({
      title: 'Delete rota entry',
      message: 'Are you sure you want to delete this rota entry? This cannot be undone.',
    });
    if (!ok) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await data.deleteRotaEntry(entry.id);
      showToast('Rota entry deleted.');
      router.back();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'This rota entry could not be deleted. Please try again.',
      );
      setActionBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: entry.title }} />

      {cancelled ? (
        <View style={styles.cancelledBanner}>
          <Ionicons name="close-circle" size={24} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold" style={{ color: colors.danger }}>
              This {entry.title.toLowerCase().includes('rehearsal') ? 'rehearsal' : 'date'} has
              been cancelled
            </AppText>
            {entry.cancellation_reason ? (
              <AppText variant="small" tone="secondary">
                {entry.cancellation_reason}
              </AppText>
            ) : null}
            {entry.cancelled_by ? (
              <AppText variant="small" tone="muted">
                Cancelled by {userName(data.users, entry.cancelled_by)}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      <Card>
        <View style={styles.metaRow}>
          <Badge label={team.name} tone="primary" />
          {cancelled ? <Badge label="Cancelled" tone="danger" /> : null}
        </View>
        <AppText variant="heading">{entry.title}</AppText>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
          <AppText tone="secondary">{formatFullDate(parseDateKey(entry.date))}</AppText>
        </View>
        {entry.time ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
            <AppText tone="secondary">{formatClockTime(entry.time)}</AppText>
          </View>
        ) : null}
        {entry.notes ? (
          <View style={styles.metaRow}>
            <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
            <AppText tone="secondary" style={{ flex: 1 }}>
              {entry.notes}
            </AppText>
          </View>
        ) : null}
      </Card>

      {/* My availability */}
      {me ? (
        <Card>
          <AppText variant="subheading">Your Assignment</AppText>
          <View style={styles.metaRow}>
            <Badge label={me.roleSummary} tone="accent" />
            {!cancelled ? <AvailabilityBadge status={me.status} /> : null}
          </View>
          {cancelled ? (
            <AppText variant="small" tone="secondary">
              This date has been cancelled — no need to respond.
            </AppText>
          ) : (
            <>
              {me.note ? (
                <AppText variant="small" tone="secondary">
                  Your note: “{me.note}”
                </AppText>
              ) : null}

              {!responding ? (
                <Button
                  title={
                    me.status !== 'not_responded'
                      ? 'Change Your Availability'
                      : 'Confirm Availability'
                  }
                  icon="hand-left-outline"
                  onPress={startResponding}
                />
              ) : (
                <View style={styles.respondBox}>
                  <AppText variant="label">Can you make it?</AppText>
                  <View style={styles.optionsRow}>
                    {RESPONSE_OPTIONS.map((status) => {
                      const selected = pendingStatus === status;
                      return (
                        <Pressable
                          key={status}
                          accessibilityRole="button"
                          accessibilityLabel={availabilityLabels[status]}
                          accessibilityState={{ selected }}
                          onPress={() => setPendingStatus(status)}
                          style={[styles.option, selected && styles.optionSelected]}
                        >
                          <AppText
                            variant="label"
                            style={{ color: selected ? colors.white : colors.text }}
                          >
                            {availabilityLabels[status]}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextField
                    label="Add a note (optional)"
                    placeholder="e.g. I may be 10 minutes late."
                    value={note}
                    onChangeText={setNote}
                  />
                  {responseError ? (
                    <AppText tone="danger" style={styles.errorText}>
                      {responseError}
                    </AppText>
                  ) : null}
                  <Button
                    title={savingResponse ? 'Saving…' : 'Save Response'}
                    onPress={() => void saveResponse()}
                    disabled={!pendingStatus || savingResponse}
                    loading={savingResponse}
                  />
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setResponding(false)}
                    disabled={savingResponse}
                  />
                </View>
              )}
            </>
          )}
        </Card>
      ) : null}

      {/* Selected songs (choir), split into Praise and Worship */}
      {isChoir ? (
        <>
          <SectionHeader title="Selected Songs" />
          {data.songsLoading && data.songs.length === 0 ? (
            <Card>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <AppText tone="secondary">Loading selected songs...</AppText>
              </View>
            </Card>
          ) : data.songsError && data.songs.length === 0 ? (
            <>
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load songs"
                message={data.songsError}
              />
              <Button
                title="Try Again"
                variant="secondary"
                icon="refresh-outline"
                onPress={() => void data.refreshSongs()}
              />
            </>
          ) : (
            SONG_SECTIONS.map((section) => {
            const label = songSectionLabels[section];
            const leader = sectionLeaderAssignment(entryAssignments, section);
            const selections = selectionsForEntrySection(entry.id, section, data.songSelections);
            const canManage =
              !cancelled &&
              canManageSongSectionForRotaEntry(user, entry, data.rotaAssignments, section);
            return (
              <Card key={section} style={{ gap: spacing.sm }}>
                <View style={styles.sectionHeaderRow}>
                  <AppText variant="subheading">{label} Songs</AppText>
                  {leader ? (
                    <AppText variant="small" tone="secondary">
                      Led by {userName(data.users, leader.user_id)}
                    </AppText>
                  ) : null}
                </View>
                {selections.length > 0 ? (
                  selections.map((sel, i) => {
                    const song = songById(data.songs, sel.song_id);
                    if (!song) return null;
                    return (
                      <Pressable
                        key={sel.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${song.title}`}
                        onPress={() =>
                          router.push({
                            pathname: '/teams/[teamId]/songs/[songId]',
                            params: { teamId: team.id, songId: song.id },
                          })
                        }
                        style={({ pressed }) => [styles.songRow, pressed && { opacity: 0.7 }]}
                      >
                        <View style={styles.songIndex}>
                          <AppText variant="label" tone="primary">
                            {i + 1}
                          </AppText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText variant="bodyBold">{song.title}</AppText>
                          {song.artist ? (
                            <AppText variant="small" tone="secondary">
                              {song.artist}
                            </AppText>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                      </Pressable>
                    );
                  })
                ) : (
                  <AppText tone="secondary">
                    No {label.toLowerCase()} songs selected yet.
                    {canManage ? ` Tap Choose ${label} Songs to pick from the song database.` : ''}
                  </AppText>
                )}
                {canManage ? (
                  <Button
                    title={
                      selections.length > 0 ? `Change ${label} Songs` : `Choose ${label} Songs`
                    }
                    variant={selections.length > 0 ? 'secondary' : 'primary'}
                    icon="musical-notes-outline"
                    onPress={() =>
                      router.push({
                        pathname: '/teams/[teamId]/rota/[entryId]/select-songs',
                        params: { teamId: team.id, entryId: entry.id, section },
                      })
                    }
                  />
                ) : null}
              </Card>
            );
          }))}
        </>
      ) : null}

      {/* Everyone assigned + availability tracker */}
      <SectionHeader title={cancelled ? 'Who Was Expected' : 'Who Is Serving'} />
      {!cancelled && people.length > 0 ? (
        <View style={styles.summaryRow}>
          <Badge label={`${summary.available} available`} tone="success" />
          <Badge label={`${summary.maybe} maybe`} tone="warning" />
          <Badge label={`${summary.unavailable} unavailable`} tone="danger" />
          <Badge label={`${summary.not_responded} not responded`} tone="neutral" />
        </View>
      ) : null}
      <Card style={{ gap: spacing.md }}>
        {people.length > 0 ? (
          people.map((person) => (
            <View key={person.userId} style={styles.assignmentRow}>
              <Avatar
                name={userName(data.users, person.userId)}
                uri={data.getAvatarUri(data.users.find((u) => u.id === person.userId))}
                size={40}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{userName(data.users, person.userId)}</AppText>
                <AppText variant="small" tone="secondary">
                  {person.roleSummary}
                </AppText>
                {isLeader && person.note ? (
                  <AppText variant="small" tone="muted">
                    “{person.note}”
                  </AppText>
                ) : null}
              </View>
              {!cancelled ? <AvailabilityBadge status={person.status} /> : null}
            </View>
          ))
        ) : (
          <AppText tone="secondary">No one has been assigned yet.</AppText>
        )}
      </Card>

      {/* Leader actions */}
      {isLeader ? (
        <View style={styles.actions}>
          {actionError ? (
            <AppText tone="danger" style={styles.errorText}>
              {actionError}
            </AppText>
          ) : null}
          {!cancelled ? (
            <>
              <Button
                title="Edit Rota Entry"
                variant="secondary"
                icon="create-outline"
                disabled={actionBusy}
                onPress={() =>
                  router.push({
                    pathname: '/teams/[teamId]/rota/edit',
                    params: { teamId: team.id, entryId: entry.id },
                  })
                }
              />
              {canCancelRotaEntry(user, entry) ? (
                <Button
                  title="Cancel This Date"
                  variant="destructive"
                  icon="close-circle-outline"
                  loading={actionBusy}
                  disabled={actionBusy}
                  onPress={handleCancelEntry}
                />
              ) : null}
              <Button
                title="Delete Rota Entry"
                variant="ghost"
                icon="trash-outline"
                disabled={actionBusy}
                onPress={handleDelete}
              />
            </>
          ) : (
            <>
              <Button
                title="Restore This Date"
                variant="secondary"
                icon="refresh-outline"
                loading={actionBusy}
                disabled={actionBusy}
                onPress={handleRestoreEntry}
              />
              <Button
                title="Delete Rota Entry"
                variant="destructive"
                icon="trash-outline"
                disabled={actionBusy}
                onPress={handleDelete}
              />
            </>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  respondBox: { gap: spacing.sm, marginTop: spacing.xs },
  optionsRow: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  optionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget,
  },
  songIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  errorText: { textAlign: 'center' },
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
