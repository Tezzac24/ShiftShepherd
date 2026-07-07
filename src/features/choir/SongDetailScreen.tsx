import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageSongs } from '../../lib/permissions';
import { SongPlatform } from '../../types';
import { formatRelative } from '../../utils/dates';

const platformIcons: Record<SongPlatform, keyof typeof Ionicons.glyphMap> = {
  YouTube: 'logo-youtube',
  Spotify: 'musical-notes-outline',
  'Apple Music': 'logo-apple',
  Other: 'link-outline',
};

export default function SongDetailScreen() {
  const router = useRouter();
  const { teamId, songId } = useLocalSearchParams<{ teamId: string; songId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const confirm = useConfirm();

  const team = data.teams.find((t) => t.id === teamId);
  const song = data.songs.find((s) => s.id === songId);

  if (!team || !song) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Song' }} />
        <EmptyState
          icon="musical-notes-outline"
          title="Song not found"
          message="This song may have been deleted."
        />
      </Screen>
    );
  }

  const canManage = canManageSongs(user, team);

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete song',
      message: 'Are you sure you want to delete this song? This action cannot be undone.',
    });
    if (ok) {
      data.deleteSong(song.id);
      router.back();
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: song.title }} />

      <Card>
        <AppText variant="heading">{song.title}</AppText>
        {song.artist ? <AppText tone="secondary">{song.artist}</AppText> : null}
        {song.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {song.tags.map((tag) => (
              <Badge key={tag} label={tag} tone="accent" />
            ))}
          </View>
        ) : null}
        <AppText variant="small" tone="muted">
          Added by {userName(data.users, song.added_by)} · {formatRelative(song.created_at)}
        </AppText>
      </Card>

      {song.links.length > 0 ? (
        <>
          <SectionHeader title="Listen" />
          <View style={styles.links}>
            {song.links.map((link) => (
              <ListRow
                key={link.id}
                icon={platformIcons[link.platform]}
                title={`Open on ${link.platform}`}
                subtitle={link.url}
                onPress={() => Linking.openURL(link.url)}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title="Lyrics" />
      <Card>
        <AppText style={styles.lyrics}>{song.lyrics}</AppText>
      </Card>

      {song.notes ? (
        <>
          <SectionHeader title="Notes" />
          <Card>
            <AppText tone="secondary">{song.notes}</AppText>
          </Card>
        </>
      ) : null}

      {canManage ? (
        <View style={styles.actions}>
          <Button
            title="Edit Song"
            variant="secondary"
            icon="create-outline"
            onPress={() =>
              router.push({
                pathname: '/teams/[teamId]/songs/edit',
                params: { teamId: team.id, songId: song.id },
              })
            }
          />
          <Button
            title="Delete Song"
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
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  links: { gap: spacing.sm },
  lyrics: { lineHeight: 28 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
