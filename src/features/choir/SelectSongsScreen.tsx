import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { ListGroup, ListGroupContext } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { searchSongs, selectionsForEntrySection } from '../../lib/appData/selectors';
import { canManageSongSectionForRotaEntry, songSectionLabels } from '../../lib/permissions';
import { RotaEntry, Song, SongSection } from '../../types';
import { formatFullDate, parseDateKey } from '../../utils/dates';
import { matchingRotaEntry } from '../rota/rotaPresentation';
import { ChoirAccessState, ChoirScope, ChoirScopeValue } from './ChoirScope';
import { moveSong, songsForChoir, songSummary } from './choirPresentation';

type SelectionRow = { kind: 'selected'; id: string } | { kind: 'song'; song: Song };
type SelectionView = 'choose' | 'order';
interface SelectionSection { key: SelectionView; data: SelectionRow[] }

export default function SelectSongsScreen() {
  const { teamId, entryId, section: sectionParam } = useLocalSearchParams<{
    teamId: string | string[]; entryId: string | string[]; section?: string | string[];
  }>();
  const section: SongSection = sectionParam === 'worship' ? 'worship' : 'praise';
  return <ChoirScope teamId={typeof teamId === 'string' ? teamId : null} routeKey={`selection:${String(entryId)}:${section}`}>
    {(scope) => <SelectionScope scope={scope} entryId={typeof entryId === 'string' ? entryId : null} section={section} />}
  </ChoirScope>;
}

function SelectionScope({ scope, entryId, section }: { scope: ChoirScopeValue; entryId: string | null; section: SongSection }) {
  const data = useAppData();
  const entry = matchingRotaEntry(data.rotaEntries, entryId, scope.team?.id ?? null, scope.user.profile.organisation_id);
  const permitted = !!entry && canManageSongSectionForRotaEntry(scope.user, entry, data.rotaAssignments, section);
  // A resolved loss of date/section authority discards the draft. A temporary
  // account or collection readiness check keeps the editor and its order alive.
  const revoked = !!entry && (entry.status === 'cancelled' || !permitted)
    || scope.ready && !entry && !data.rotasLoading && !data.rotasError;
  return <SongSelection key={revoked ? 'revoked' : 'editor'} scope={scope} entry={entry} section={section} permitted={permitted} />;
}

function SongSelection({ scope, entry, section, permitted }: {
  scope: ChoirScopeValue; entry?: RotaEntry; section: SongSection; permitted: boolean;
}) {
  const { team, user } = scope;
  const data = useAppData();
  const router = useRouter();
  const showToast = useToast();
  const label = songSectionLabels[section];
  const otherSection: SongSection = section === 'praise' ? 'worship' : 'praise';
  const otherLabel = songSectionLabels[otherSection];
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<SelectionView>('choose');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const active = useRef(true);
  const closed = useRef(false);
  const pending = useRef(false);
  const completed = useRef(false);
  const listRef = useRef<SectionList<SelectionRow, SelectionSection>>(null);
  const teamSongs = team ? songsForChoir(data.songs, team.id, user.profile.organisation_id) : [];
  const otherIds = new Set(entry ? selectionsForEntrySection(entry.id, otherSection, data.songSelections).map((item) => item.song_id) : []);
  const ready = scope.ready && !!entry && entry.status !== 'cancelled' && permitted;
  const current = useRef({ ready, entry, teamSongs, otherIds, selectedIds });
  current.current = { ready, entry, teamSongs, otherIds, selectedIds };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (selectedIds !== null || !ready || !entry || data.songsLoading || data.songsError) return;
    setSelectedIds(selectionsForEntrySection(entry.id, section, data.songSelections).map((item) => item.song_id));
  }, [selectedIds, ready, entry, section, data.songSelections, data.songsLoading, data.songsError]);
  useEffect(() => {
    if (!saved || !ready || !team || !entry || closed.current) return;
    closed.current = true;
    showToast(`${label} songs saved.`);
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: entry.id } });
  }, [saved, ready, team, entry, label, router, showToast]);

  const close = () => {
    closed.current = true;
    if (router.canGoBack()) router.back();
    else if (team && entry) router.replace({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: entry.id } });
    else if (team) router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
    else router.replace('/(tabs)/teams');
  };
  const editable = () => active.current && !closed.current && current.current.ready && !pending.current && !completed.current && current.current.selectedIds !== null;
  const switchView = (next: SelectionView) => {
    if (!editable()) return;
    setView(next);
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
  };
  const toggle = (songId: string) => {
    if (!editable()) return;
    const latest = current.current;
    const selected = latest.selectedIds!.includes(songId);
    if (!selected && (!latest.teamSongs.some((song) => song.id === songId) || latest.otherIds.has(songId))) return;
    setSelectedIds((previous) => previous ? selected ? previous.filter((id) => id !== songId) : [...previous, songId] : previous);
    setSaveError(null);
  };
  const move = (songId: string, delta: -1 | 1) => {
    if (!editable()) return;
    setSelectedIds((previous) => previous ? moveSong(previous, songId, delta) : previous);
  };
  const save = async () => {
    if (!editable() || !entry) return;
    const latest = current.current;
    if (latest.selectedIds!.some((id) => !latest.teamSongs.some((song) => song.id === id) || latest.otherIds.has(id))) {
      switchView('order');
      return;
    }
    pending.current = true; setSaving(true); setSaveError(null);
    try {
      await data.setSongSelections(entry.id, section, [...latest.selectedIds!], user.profile.id);
      if (active.current && !closed.current) { completed.current = true; setSaved(true); }
    } catch (error) {
      if (active.current && !closed.current) setSaveError(error instanceof Error ? error.message : 'Your song choices could not be saved. Please try again.');
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  };

  if (saved) return <Screen><Stack.Screen options={{ title: 'Songs saved' }} />
    <PageHeading eyebrow={team?.name} title={`${label} songs saved`} description="Your song order is saved for this date." />
    {!ready ? <StatePanel compact kind="loading" title="Checking your access…" message="You can close this screen or wait to continue." /> : null}
    <Button title="Close" variant="secondary" onPress={close} />
  </Screen>;
  if (!scope.ready || !team) return <ChoirAccessState scope={scope} title={`${label} songs`} onExit={close} exitLabel="Cancel" />;
  if (!entry) return <Screen><Stack.Screen options={{ title: `${label} songs` }} />
    {data.rotasLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading this date…" />
      : data.rotasError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this date" message={data.rotasError}
        action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} />
        : <StatePanel headingLevel={1} title="Date unavailable" message="This date may have been removed or belongs to a different team." />}
    <Button title="Back to rota" variant="secondary" onPress={() => { closed.current = true; router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } }); }} />
  </Screen>;
  if (entry.status === 'cancelled' || !permitted) return <Screen><Stack.Screen options={{ title: `${label} songs` }} />
    {entry.status === 'cancelled' ? <StatePanel headingLevel={1} title="This date is cancelled" message="Songs cannot be changed for a cancelled date." />
      : <StatePanel headingLevel={1} icon="lock-closed-outline" title="No permission"
        message={`Only this date's ${label} Leader, Song Leader, team admin or a church admin can change the ${label.toLowerCase()} songs.`} />}
    <Button title="Back to date" variant="secondary" onPress={close} />
  </Screen>;

  const results = searchSongs(teamSongs, query);
  const sections: SelectionSection[] = selectedIds === null ? [] : [{ key: view,
    data: view === 'order' ? selectedIds.map((id) => ({ kind: 'selected', id })) : results.map((song) => ({ kind: 'song', song })) }];
  const invalidSelection = selectedIds?.some((id) => !teamSongs.some((song) => song.id === id) || otherIds.has(id)) ?? false;

  const renderRow = (item: SelectionRow, rowIndex: number) => {
    if (item.kind === 'selected') {
      const index = selectedIds!.indexOf(item.id);
      const song = teamSongs.find((candidate) => candidate.id === item.id);
      const title = song?.title ?? 'Song unavailable';
      return <View style={styles.row}><ListGroup><View style={styles.selected}>
        <AppText variant="bodyBold">{index + 1}. {title}</AppText>
        {song?.artist ? <AppText variant="small" tone="secondary">{song.artist}</AppText> : null}
        {!song ? <AppText tone="danger">Remove this song before saving. It is no longer in this team’s library.</AppText>
          : otherIds.has(item.id) ? <AppText tone="danger">Now selected for {otherLabel.toLowerCase()}. Remove it here before saving.</AppText> : null}
        <View style={styles.orderActions}>
          <Button title="Up" accessibilityLabel={`Move ${title} up`} variant="secondary" disabled={saving || index === 0} style={styles.orderAction} onPress={() => move(item.id, -1)} />
          <Button title="Down" accessibilityLabel={`Move ${title} down`} variant="secondary" disabled={saving || index === selectedIds!.length - 1} style={styles.orderAction} onPress={() => move(item.id, 1)} />
          <Button title="Remove" accessibilityLabel={`Remove ${title} from ${label.toLowerCase()} songs`} variant="ghost" disabled={saving} style={styles.orderAction} onPress={() => toggle(item.id)} />
        </View>
      </View></ListGroup></View>;
    }
    const song = item.song;
    const checked = selectedIds!.includes(song.id);
    const inOther = otherIds.has(song.id);
    return <View style={[styles.songRow, rowIndex === 0 && styles.firstSong, rowIndex === results.length - 1 && styles.lastSong]}><ListRow title={song.title}
      subtitle={[songSummary(song), inOther ? `Selected for ${otherLabel.toLowerCase()}` : checked ? 'Selected' : null].filter(Boolean).join('\n')}
      leading={<Ionicons name={checked ? 'checkbox' : 'square-outline'} size={26} color={inOther ? colors.textMuted : colors.primary} accessible={false} aria-hidden />}
      showChevron={false} accessibilityRole="checkbox" accessibilityState={{ checked }} disabled={saving || inOther}
      accessibilityLabel={`${song.title}${inOther ? `. Already selected for ${otherLabel.toLowerCase()}` : ''}`}
      onPress={() => toggle(song.id)} /></View>;
  };

  return <Screen scroll={false} keyboard footer={<View style={styles.footer}>
    {saveError ? <View style={styles.footer}>
      <AppText tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">Couldn’t confirm the saved order.</AppText>
      <AppText variant="small" tone="secondary">Some choices may already have changed. Your order is kept here.</AppText>
      {saveError !== 'Your song choices could not be saved. Please try again.' ? <AppText variant="small" tone="danger">{saveError}</AppText> : null}
    </View> : null}
    {invalidSelection ? <Button title="Review song order before saving" variant="ghost" onPress={() => switchView('order')} /> : null}
    <View style={styles.actions}>
      <Button title="Cancel" variant="secondary" disabled={saving} onPress={close} style={styles.cancel} />
      <Button title={`Save ${label.toLowerCase()} songs`} loading={saving} disabled={selectedIds === null || invalidSelection}
        onPress={() => void save()} style={styles.save} />
    </View>
  </View>}>
    <Stack.Screen options={{ title: `${label} songs` }} />
    <ListGroupContext.Provider value><SectionList ref={listRef} sections={sections} keyExtractor={(item) => item.kind === 'selected' ? `selected:${item.id}` : `song:${item.song.id}`}
      contentContainerStyle={styles.content} stickySectionHeadersEnabled keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View style={styles.header}>
        <PageHeading eyebrow={team.name} title={`${label} songs`} />
        <AppText variant="subheading">{entry.title}</AppText>
        <AppText tone="secondary">{formatFullDate(parseDateKey(entry.date))}</AppText>
        <AppText tone="secondary">Choose songs, then review their order. {otherLabel} songs are chosen separately.</AppText>
        {data.rotasError ? <StatePanel compact kind="error" title="Couldn't refresh this date" message="Your choices are kept. Try again for the latest date and people."
          action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /> : null}
        {data.songsError ? <StatePanel compact kind="error" title={selectedIds === null ? "Couldn't load song choices" : "Couldn't refresh songs"}
          message={selectedIds === null ? data.songsError : 'Your choices are kept. Try again for the latest songs and selections.'}
          action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} />
          : selectedIds === null ? <StatePanel headingLevel={2} kind="loading" title="Loading song choices…" /> : null}
      </View>}
      renderSectionHeader={() => <View style={styles.sectionHeader}>
        <SegmentedControl label={`${label} song selection`} value={view} onChange={switchView} options={[
          { value: 'choose', label: 'Choose songs', disabled: saving },
          { value: 'order', label: `Song order (${selectedIds?.length ?? 0})`, disabled: saving },
        ]} />
        {view === 'choose' ? <TextField label="Search songs" placeholder="Title, artist or tag" value={query} onChangeText={setQuery} autoCapitalize="none" returnKeyType="search" editable={!saving} /> : null}
      </View>}
      renderSectionFooter={() => view === 'order' && selectedIds?.length === 0
        ? <StatePanel compact icon="musical-notes-outline" title={`No ${label.toLowerCase()} songs selected`} message="Choose songs from the library to build this section."
          action={{ label: 'Choose songs', onPress: () => switchView('choose') }} />
        : view === 'choose' && !results.length ? <StatePanel compact icon={query.trim() ? 'search-outline' : 'musical-notes-outline'}
            title={query.trim() ? 'No matching songs' : 'No songs yet'}
            message={query.trim() ? `No songs match “${query.trim()}”.` : 'Songs added to the library will appear here.'}
            action={query.trim() ? { label: 'Clear search', onPress: () => setQuery('') } : undefined} /> : null}
      renderItem={({ item, index }) => renderRow(item, index)} /></ListGroupContext.Provider>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: spacing.xl },
  header: { gap: spacing.sm, paddingBottom: spacing.md },
  sectionHeader: { gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.background },
  row: { paddingBottom: spacing.sm },
  songRow: { borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  firstSong: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastSong: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  selected: { padding: spacing.lg, gap: spacing.sm },
  orderActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  orderAction: { flexGrow: 1, flexBasis: 72, paddingHorizontal: spacing.sm },
  footer: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 88 },
  save: { flexGrow: 2, flexBasis: 175 },
});
