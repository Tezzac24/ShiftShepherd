import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import {
  searchSongs,
  selectionsForEntrySection,
  songById,
} from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageSongSectionForRotaEntry, songSectionLabels } from '../../lib/permissions';
import { SongSection } from '../../types';
import { formatFullDate, parseDateKey } from '../../utils/dates';

/**
 * Select songs for ONE section (praise or worship) of a choir rota date.
 * Only the leader assigned to that section (or the choir team leader /
 * church admin as an override) can save. Songs can be reordered with simple
 * up/down buttons — no hidden gestures.
 */
export default function SelectSongsScreen() {
  const router = useRouter();
  const { teamId, entryId, section: sectionParam } = useLocalSearchParams<{
    teamId: string;
    entryId: string;
    section?: string;
  }>();
  const user = useRequiredUser();
  const data = useAppData();
  const showToast = useToast();

  const section: SongSection = sectionParam === 'worship' ? 'worship' : 'praise';
  const sectionLabel = songSectionLabels[section];
  const otherSection: SongSection = section === 'praise' ? 'worship' : 'praise';

  const team = data.teams.find((t) => t.id === teamId);
  const entry = data.rotaEntries.find((e) => e.id === entryId);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    entry
      ? selectionsForEntrySection(entry.id, section, data.songSelections).map((s) => s.song_id)
      : [],
  );
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setSelectedIds(
      selectionsForEntrySection(entry.id, section, data.songSelections).map((s) => s.song_id),
    );
  }, [entry, section, data.songSelections]);

  if ((!team || !entry) && (data.teamsLoading || data.rotasLoading || data.songsLoading)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Select Songs' }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading song choices...</AppText>
        </View>
      </Screen>
    );
  }

  if (
    !team ||
    !entry ||
    entry.status === 'cancelled' ||
    !canManageSongSectionForRotaEntry(user, entry, data.rotaAssignments, section)
  ) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Select Songs' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message={`Only the assigned ${sectionLabel} Leader for this date (or the choir team leader) can change the ${sectionLabel.toLowerCase()} songs.`}
        />
      </Screen>
    );
  }

  // Songs already in the other section can't be added here too.
  const otherSectionIds = new Set(
    selectionsForEntrySection(entry.id, otherSection, data.songSelections).map((s) => s.song_id),
  );

  const teamSongs = team ? data.songs.filter((song) => song.team_id === team.id) : [];
  const results = searchSongs(teamSongs, query);

  const toggle = (songId: string) => {
    setSelectedIds((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId],
    );
  };

  const move = (index: number, delta: -1 | 1) => {
    setSelectedIds((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      await data.setSongSelections(entry.id, section, selectedIds, user.profile.id);
      showToast(`${sectionLabel} songs saved.`);
      router.back();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Your song choices could not be saved. Please try again.',
      );
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `${sectionLabel} Songs` }} />

      <Card>
        <AppText variant="label" tone="primary">
          {formatFullDate(parseDateKey(entry.date))}
        </AppText>
        <AppText variant="subheading">{entry.title}</AppText>
        <AppText variant="small" tone="secondary">
          Choose the {sectionLabel.toLowerCase()} songs for this date. Use the arrows to put them
          in order. The {songSectionLabels[otherSection].toLowerCase()} songs are managed
          separately.
        </AppText>
      </Card>

      {/* Selected songs, in order */}
      <SectionHeader title={`${sectionLabel} Songs (${selectedIds.length})`} />
      {selectedIds.length > 0 ? (
        <Card style={{ gap: spacing.md }}>
          {selectedIds.map((songId, i) => {
            const song = songById(data.songs, songId);
            if (!song) return null;
            return (
              <View key={songId} style={styles.selectedRow}>
                <View style={styles.orderCircle}>
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
                <IconButton
                  icon="arrow-up"
                  label={`Move ${song.title} up`}
                  disabled={i === 0}
                  onPress={() => move(i, -1)}
                />
                <IconButton
                  icon="arrow-down"
                  label={`Move ${song.title} down`}
                  disabled={i === selectedIds.length - 1}
                  onPress={() => move(i, 1)}
                />
                <IconButton
                  icon="close"
                  label={`Remove ${song.title}`}
                  danger
                  onPress={() => toggle(songId)}
                />
              </View>
            );
          })}
        </Card>
      ) : (
        <AppText tone="secondary">
          No {sectionLabel.toLowerCase()} songs selected yet — pick from the list below.
        </AppText>
      )}

      <Button
        title={saving ? 'Saving...' : `Save ${sectionLabel} Songs`}
        icon="checkmark-outline"
        loading={saving}
        disabled={saving}
        onPress={() => void handleSave()}
      />
      {saveError ? (
        <AppText tone="danger" style={styles.errorText}>
          {saveError}
        </AppText>
      ) : null}

      {/* Song database */}
      <SectionHeader title="Song Database" />
      <TextField
        placeholder="Search songs by title, artist or tag…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        accessibilityLabel="Search songs"
      />
      {data.songsLoading && teamSongs.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <AppText tone="secondary">Loading songs...</AppText>
        </View>
      ) : data.songsError && teamSongs.length === 0 ? (
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
      ) : results.length > 0 ? (
        results.map((song) => {
          const selected = selectedIds.includes(song.id);
          const inOtherSection = otherSectionIds.has(song.id);
          return (
            <Pressable
              key={song.id}
              accessibilityRole="button"
              accessibilityLabel={
                inOtherSection
                  ? `${song.title} is already in the ${songSectionLabels[otherSection].toLowerCase()} songs`
                  : selected
                    ? `Remove ${song.title} from selection`
                    : `Add ${song.title} to selection`
              }
              accessibilityState={{ selected, disabled: inOtherSection }}
              disabled={inOtherSection}
              onPress={() => toggle(song.id)}
              style={({ pressed }) => [
                styles.resultRow,
                selected && styles.resultSelected,
                inOtherSection && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={26}
                color={selected ? colors.primary : colors.borderStrong}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{song.title}</AppText>
                {song.artist ? (
                  <AppText variant="small" tone="secondary">
                    {song.artist}
                  </AppText>
                ) : null}
                {inOtherSection ? (
                  <AppText variant="small" tone="muted">
                    Already in the {songSectionLabels[otherSection].toLowerCase()} songs
                  </AppText>
                ) : null}
              </View>
              {song.tags.slice(0, 2).map((tag) => (
                <AppText key={tag} variant="small" tone="muted">
                  {tag}
                </AppText>
              ))}
            </Pressable>
          );
        })
      ) : (
        <EmptyState
          icon="search-outline"
          title="No matches"
          message={`No songs match “${query}”.`}
        />
      )}
    </Screen>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        danger && { backgroundColor: colors.dangerSoft },
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  resultSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  errorText: { textAlign: 'center' },
});
