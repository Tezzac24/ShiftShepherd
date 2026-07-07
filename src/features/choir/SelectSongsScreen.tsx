import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { searchSongs, selectionsForEntry, songById } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canSelectSongsForRota } from '../../lib/permissions';
import { formatFullDate, parseDateKey } from '../../utils/dates';

/**
 * Select songs for a choir rota date. Only the assigned song leader for the
 * date (or the choir team leader / church admin as an override) can save.
 * Songs can be reordered with simple up/down buttons — no hidden gestures.
 */
export default function SelectSongsScreen() {
  const router = useRouter();
  const { teamId, entryId } = useLocalSearchParams<{ teamId: string; entryId: string }>();
  const user = useRequiredUser();
  const data = useAppData();

  const team = data.teams.find((t) => t.id === teamId);
  const entry = data.rotaEntries.find((e) => e.id === entryId);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    entry ? selectionsForEntry(entry.id, data.songSelections).map((s) => s.song_id) : [],
  );
  const [query, setQuery] = useState('');

  if (!team || !entry || !canSelectSongsForRota(user, entry, data.rotaAssignments)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Select Songs' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only the assigned song leader for this date (or the choir team leader) can select songs."
        />
      </Screen>
    );
  }

  const results = searchSongs(data.songs, query);

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

  const handleSave = () => {
    data.setSongSelections(entry.id, selectedIds, user.profile.id);
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Select Songs' }} />

      <Card>
        <AppText variant="label" tone="primary">
          {formatFullDate(parseDateKey(entry.date))}
        </AppText>
        <AppText variant="subheading">{entry.title}</AppText>
        <AppText variant="small" tone="secondary">
          Choose the songs for this date. Use the arrows to put them in order.
        </AppText>
      </Card>

      {/* Selected songs, in order */}
      <SectionHeader title={`Selected Songs (${selectedIds.length})`} />
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
        <AppText tone="secondary">No songs selected yet — pick from the list below.</AppText>
      )}

      <Button title="Save Selected Songs" icon="checkmark-outline" onPress={handleSave} />

      {/* Song database */}
      <SectionHeader title="Song Database" />
      <TextField
        placeholder="Search songs by title, artist or tag…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        accessibilityLabel="Search songs"
      />
      {results.length > 0 ? (
        results.map((song) => {
          const selected = selectedIds.includes(song.id);
          return (
            <Pressable
              key={song.id}
              accessibilityRole="button"
              accessibilityLabel={
                selected ? `Remove ${song.title} from selection` : `Add ${song.title} to selection`
              }
              accessibilityState={{ selected }}
              onPress={() => toggle(song.id)}
              style={({ pressed }) => [
                styles.resultRow,
                selected && styles.resultSelected,
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
});
