import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { searchSongs } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageSongs } from '../../lib/permissions';

export default function SongDatabaseScreen() {
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const [query, setQuery] = useState('');

  const team = data.teams.find((t) => t.id === teamId);

  if (!team || !canManageSongs(user, team)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Song Database' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="The song database is for choir members."
        />
      </Screen>
    );
  }

  const songs = searchSongs(data.songs, query);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Song Database' }} />

      <TextField
        placeholder="Search songs by title, artist or tag…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        accessibilityLabel="Search songs"
      />

      <Button
        title="Add Song"
        icon="add-circle-outline"
        onPress={() =>
          router.push({ pathname: '/teams/[teamId]/songs/edit', params: { teamId: team.id } })
        }
      />

      {songs.length > 0 ? (
        songs.map((song) => (
          <Card
            key={song.id}
            onPress={() =>
              router.push({
                pathname: '/teams/[teamId]/songs/[songId]',
                params: { teamId: team.id, songId: song.id },
              })
            }
            accessibilityLabel={`Open ${song.title}`}
            style={styles.songCard}
          >
            <View style={styles.songRow}>
              <View style={styles.noteIcon}>
                <Ionicons name="musical-note" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{song.title}</AppText>
                {song.artist ? (
                  <AppText variant="small" tone="secondary">
                    {song.artist}
                  </AppText>
                ) : null}
              </View>
              {song.links.length > 0 ? (
                <Ionicons name="link-outline" size={20} color={colors.textMuted} />
              ) : null}
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
            {song.tags.length > 0 ? (
              <View style={styles.tagRow}>
                {song.tags.map((tag) => (
                  <Badge key={tag} label={tag} tone="accent" />
                ))}
              </View>
            ) : null}
          </Card>
        ))
      ) : query ? (
        <EmptyState
          icon="search-outline"
          title="No matches"
          message={`No songs match “${query}”. Try a different search, or add it as a new song.`}
        />
      ) : (
        <EmptyState
          icon="musical-notes-outline"
          title="No songs yet"
          message="No songs have been added yet. Add the first song to the database."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  songCard: { paddingVertical: spacing.md },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
