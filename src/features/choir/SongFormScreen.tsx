import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageSongs } from '../../lib/permissions';
import { suggestedSongTags } from '../../lib/mockData';
import { SongLink, SongPlatform } from '../../types';
import { makeId } from '../../utils/ids';

interface DraftLink {
  platform: SongPlatform;
  url: string;
}

const PLATFORMS: SongPlatform[] = ['YouTube', 'Spotify', 'Apple Music', 'Other'];

/** Add/edit song — any choir member can do this. */
export default function SongFormScreen() {
  const router = useRouter();
  const { teamId, songId } = useLocalSearchParams<{ teamId: string; songId?: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const showToast = useToast();

  const team = data.teams.find((t) => t.id === teamId);
  const existing = songId ? data.songs.find((s) => s.id === songId) : undefined;
  const editing = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [artist, setArtist] = useState(existing?.artist ?? '');
  const [lyrics, setLyrics] = useState(existing?.lyrics ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [links, setLinks] = useState<DraftLink[]>(
    existing?.links.map((l) => ({ platform: l.platform, url: l.url })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if ((!team || (songId && !existing)) && (data.teamsLoading || data.songsLoading)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: editing ? 'Edit Song' : 'Add Song' }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading song details...</AppText>
        </View>
      </Screen>
    );
  }

  if (!team || !canManageSongs(user, team)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Songs' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="You do not have permission to do that."
        />
      </Screen>
    );
  }

  if (songId && !existing) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit Song' }} />
        <EmptyState
          icon="musical-notes-outline"
          title="Song not found"
          message={data.songsError ?? 'This song may have been deleted.'}
        />
        {data.songsError ? (
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshSongs()}
          />
        ) : null}
      </Screen>
    );
  }

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const updateLink = (index: number, patch: Partial<DraftLink>) => {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim() || !lyrics.trim()) {
      setError('Please add at least a song title and lyrics (or a placeholder).');
      return;
    }
    const songIdForLinks = existing?.id ?? 'pending';
    const cleanLinks: SongLink[] = links
      .filter((l) => l.url.trim())
      .map((l) => ({
        id: makeId('link'),
        song_id: songIdForLinks,
        platform: l.platform,
        url: l.url.trim(),
      }));

    const record = {
      team_id: team.id,
      title: title.trim(),
      artist: artist.trim() || null,
      lyrics: lyrics.trim(),
      notes: notes.trim() || null,
      tags,
      links: cleanLinks,
      added_by: existing?.added_by ?? user.profile.id,
    };
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await data.updateSong(existing.id, record);
        showToast('Song updated.');
      } else {
        await data.addSong(record);
        showToast('Song added.');
      }
      router.back();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Your changes could not be saved. Please try again.',
      );
      setSaving(false);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editing ? 'Edit Song' : 'Add Song' }} />

      <TextField label="Song title" placeholder="e.g. Amazing Grace" value={title} onChangeText={setTitle} />
      <TextField
        label="Artist / source (optional)"
        placeholder="e.g. John Newton"
        value={artist}
        onChangeText={setArtist}
      />
      <TextField
        label="Lyrics"
        placeholder="Paste or type the lyrics here…"
        value={lyrics}
        onChangeText={setLyrics}
        multiline
        style={styles.lyricsInput}
      />
      <TextField
        label="Notes (optional)"
        placeholder="e.g. Usually sung in G. Verse 1 acapella."
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <AppText variant="label">Tags (optional)</AppText>
      <View style={styles.tagRow}>
        {suggestedSongTags.map((tag) => {
          const selected = tags.includes(tag);
          return (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={`Tag: ${tag}`}
              accessibilityState={{ selected }}
              onPress={() => toggleTag(tag)}
              style={[styles.tag, selected && styles.tagSelected]}
            >
              <AppText variant="label" style={{ color: selected ? colors.white : colors.accent }}>
                {tag}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="label" style={{ marginTop: spacing.sm }}>
        Music links (optional)
      </AppText>
      {links.map((link, i) => (
        <Card key={i} style={styles.linkCard}>
          <View style={styles.linkHeader}>
            <AppText variant="label" tone="primary">
              Link {i + 1}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove link ${i + 1}`}
              onPress={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
              hitSlop={12}
            >
              <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
            </Pressable>
          </View>
          <SelectField
            label="Platform"
            value={link.platform}
            options={PLATFORMS.map((p) => ({ label: p, value: p }))}
            onChange={(v) => updateLink(i, { platform: v })}
          />
          <TextField
            label="Web address"
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
            value={link.url}
            onChangeText={(v) => updateLink(i, { url: v })}
          />
        </Card>
      ))}
      <Button
        title="Add Music Link"
        variant="secondary"
        icon="link-outline"
        onPress={() => setLinks((prev) => [...prev, { platform: 'YouTube', url: '' }])}
      />

      {error ? (
        <AppText tone="danger" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Song'}
          icon="checkmark-outline"
          loading={saving}
          disabled={saving}
          onPress={() => void handleSave()}
        />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => router.back()}
          disabled={saving}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  lyricsInput: { minHeight: 160 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    minHeight: touchTarget - 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagSelected: { backgroundColor: colors.accent },
  linkCard: { gap: spacing.md },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
