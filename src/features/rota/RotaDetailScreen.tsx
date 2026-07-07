import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { useAppData } from '../../lib/appData/AppDataContext';
import {
  assignmentsForEntry,
  availabilityForAssignment,
  selectionsForEntry,
  songById,
  userName,
} from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canManageTeamRota,
  canSelectSongsForRota,
  canViewTeam,
  SONG_LEADER_ROLE,
} from '../../lib/permissions';
import { AvailabilityStatus } from '../../types';
import { formatClockTime, formatFullDate, parseDateKey } from '../../utils/dates';

const RESPONSE_OPTIONS: AvailabilityStatus[] = ['available', 'maybe', 'unavailable'];

export default function RotaDetailScreen() {
  const router = useRouter();
  const { teamId, entryId } = useLocalSearchParams<{ teamId: string; entryId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const confirm = useConfirm();

  const team = data.teams.find((t) => t.id === teamId);
  const entry = data.rotaEntries.find((e) => e.id === entryId);

  const myAssignment = entry
    ? assignmentsForEntry(entry.id, data.rotaAssignments).find(
        (a) => a.user_id === user.profile.id,
      )
    : undefined;
  const myResponse = myAssignment
    ? availabilityForAssignment(myAssignment.id, data.availabilityResponses)
    : undefined;

  const [responding, setResponding] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AvailabilityStatus | null>(null);
  const [note, setNote] = useState('');

  if (!team || !entry || !canViewTeam(user, team.id)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Rota' }} />
        <EmptyState
          icon="calendar-outline"
          title="Rota entry not found"
          message="This rota entry may have been removed."
        />
      </Screen>
    );
  }

  const isChoir = team.type === 'choir';
  const isLeader = canManageTeamRota(user, team.id);
  const assignments = assignmentsForEntry(entry.id, data.rotaAssignments);
  const selections = selectionsForEntry(entry.id, data.songSelections);
  const canPickSongs = isChoir && canSelectSongsForRota(user, entry, data.rotaAssignments);
  const songLeader = assignments.find((a) => a.role_name === SONG_LEADER_ROLE);

  const startResponding = () => {
    setPendingStatus(myResponse?.status === 'not_responded' ? null : (myResponse?.status ?? null));
    setNote(myResponse?.note ?? '');
    setResponding(true);
  };

  const saveResponse = () => {
    if (!myAssignment || !pendingStatus) return;
    data.setAvailability(myAssignment.id, user.profile.id, pendingStatus, note.trim() || null);
    setResponding(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete rota entry',
      message: 'Are you sure you want to delete this rota entry?',
    });
    if (ok) {
      data.deleteRotaEntry(entry.id);
      router.back();
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: entry.title }} />

      <Card>
        <Badge label={team.name} tone="primary" />
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
      {myAssignment ? (
        <Card>
          <AppText variant="subheading">Your Assignment</AppText>
          <View style={styles.metaRow}>
            <Badge label={myAssignment.role_name} tone="accent" />
            <AvailabilityBadge status={myResponse?.status ?? 'not_responded'} />
          </View>
          {myResponse?.note ? (
            <AppText variant="small" tone="secondary">
              Your note: “{myResponse.note}”
            </AppText>
          ) : null}

          {!responding ? (
            <Button
              title={
                myResponse && myResponse.status !== 'not_responded'
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
              <Button title="Save Response" onPress={saveResponse} disabled={!pendingStatus} />
              <Button title="Cancel" variant="secondary" onPress={() => setResponding(false)} />
            </View>
          )}
        </Card>
      ) : null}

      {/* Selected songs (choir) */}
      {isChoir ? (
        <>
          <SectionHeader title="Selected Songs" />
          {songLeader ? (
            <AppText variant="small" tone="secondary">
              Song leader for this date: {userName(data.users, songLeader.user_id)}
            </AppText>
          ) : null}
          {selections.length > 0 ? (
            <Card>
              {selections.map((sel, i) => {
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
              })}
            </Card>
          ) : (
            <EmptyState
              icon="musical-notes-outline"
              title="No songs selected yet"
              message={
                canPickSongs
                  ? 'You are leading songs for this date. Tap Select Songs to choose from the song database.'
                  : 'The song leader has not selected songs for this date yet.'
              }
            />
          )}
          {canPickSongs ? (
            <Button
              title={selections.length > 0 ? 'Change Selected Songs' : 'Select Songs'}
              icon="musical-notes-outline"
              onPress={() =>
                router.push({
                  pathname: '/teams/[teamId]/rota/[entryId]/select-songs',
                  params: { teamId: team.id, entryId: entry.id },
                })
              }
            />
          ) : null}
        </>
      ) : null}

      {/* Everyone assigned */}
      <SectionHeader title="Who Is Serving" />
      <Card style={{ gap: spacing.md }}>
        {assignments.length > 0 ? (
          assignments.map((a) => {
            const response = availabilityForAssignment(a.id, data.availabilityResponses);
            const status = response?.status ?? 'not_responded';
            return (
              <View key={a.id} style={styles.assignmentRow}>
                <Avatar name={userName(data.users, a.user_id)} size={40} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold">{userName(data.users, a.user_id)}</AppText>
                  <AppText variant="small" tone="secondary">
                    {a.role_name}
                  </AppText>
                  {isLeader && response?.note ? (
                    <AppText variant="small" tone="muted">
                      “{response.note}”
                    </AppText>
                  ) : null}
                </View>
                <AvailabilityBadge status={status} />
              </View>
            );
          })
        ) : (
          <AppText tone="secondary">No one has been assigned yet.</AppText>
        )}
      </Card>

      {/* Leader actions */}
      {isLeader ? (
        <View style={styles.actions}>
          <Button
            title="Edit Rota Entry"
            variant="secondary"
            icon="create-outline"
            onPress={() =>
              router.push({
                pathname: '/teams/[teamId]/rota/edit',
                params: { teamId: team.id, entryId: entry.id },
              })
            }
          />
          <Button
            title="Delete Rota Entry"
            variant="destructive"
            icon="trash-outline"
            onPress={handleDelete}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
});
