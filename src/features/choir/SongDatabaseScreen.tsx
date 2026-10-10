import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../../constants/theme';
import { Button } from '../../components/Button';
import { ListGroupContext } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { searchSongs } from '../../lib/appData/selectors';
import { ChoirAccessState, ChoirScope, ChoirScopeValue } from './ChoirScope';
import { matchingSong, songsForChoir, songSummary } from './choirPresentation';

export default function SongDatabaseScreen() {
  const { teamId, search } = useLocalSearchParams<{ teamId: string | string[]; search?: string | string[] }>();
  const initialQuery = typeof search === 'string' ? search : '';
  return <ChoirScope teamId={typeof teamId === 'string' ? teamId : null} routeKey={`library:${initialQuery}`}>
    {(scope) => <SongLibrary scope={scope} initialQuery={initialQuery} />}
  </ChoirScope>;
}

function SongLibrary({ scope, initialQuery }: { scope: ChoirScopeValue; initialQuery: string }) {
  const { team, user } = scope;
  const data = useAppData();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initialQuery);
  const active = useRef(true);
  const current = useRef({ scope, songs: data.songs });
  current.current = { scope, songs: data.songs };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const open = (songId?: string) => {
    const latest = current.current;
    if (!active.current || !latest.scope.ready || !latest.scope.team) return;
    if (songId && !matchingSong(latest.songs, songId, latest.scope.team.id, latest.scope.user.profile.organisation_id)) return;
    if (songId) router.push({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: latest.scope.team.id, songId } });
    else router.push({ pathname: '/teams/[teamId]/songs/edit', params: { teamId: latest.scope.team.id } });
  };

  if (!scope.ready || !team) return <ChoirAccessState scope={scope} />;
  const teamSongs = songsForChoir(data.songs, team.id, user.profile.organisation_id);
  const songs = searchSongs(teamSongs, query);
  const empty = teamSongs.length === 0;

  return <Screen scroll={false}>
    <Stack.Screen options={{ title: 'Songs' }} />
    <ListGroupContext.Provider value><FlatList data={songs} keyExtractor={(song) => song.id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(spacing.lg, insets.bottom) }]}
      ListHeaderComponent={<View style={styles.header}>
        <PageHeading eyebrow={team.name} title="Songs" action={<Button title="Add song" icon="add-outline" onPress={() => open()} />} />
        <TextField label="Search songs" placeholder="Title, artist or tag" value={query} onChangeText={setQuery} autoCapitalize="none" returnKeyType="search" />
        {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh the team" message={data.teamsError}
          action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} /> : null}
        {data.songsError && !empty ? <StatePanel compact kind="error" title="Couldn't refresh songs" message="These are the last songs loaded. Try again for the latest changes."
          action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} /> : null}
      </View>}
      renderItem={({ item, index }) => <View style={[styles.songRow, index === 0 && styles.firstRow, index === songs.length - 1 && styles.lastRow]}>
        <ListRow title={item.title} subtitle={songSummary(item)} accessibilityLabel={`Open ${item.title}${item.artist ? ` by ${item.artist}` : ''}`}
          onPress={() => open(item.id)} /></View>}
      ListEmptyComponent={empty && data.songsLoading ? <StatePanel headingLevel={2} kind="loading" title="Loading songs…" />
        : empty && data.songsError ? <StatePanel headingLevel={2} kind="error" title="Couldn't load songs" message={data.songsError}
          action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} />
          : query.trim() ? <StatePanel headingLevel={2} icon="search-outline" title="No matching songs" message={`No songs match “${query.trim()}”. Try another title, artist or tag.`}
            action={{ label: 'Clear search', onPress: () => setQuery('') }} />
            : <StatePanel headingLevel={2} icon="musical-notes-outline" title="No songs yet" message="Add the first song for your team using Add song above." />} /></ListGroupContext.Provider>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  songRow: { borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  firstRow: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastRow: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
});
