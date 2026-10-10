import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { radius, spacing, touchTarget, type ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useDiscardChanges } from '../../components/useDiscardChanges';
import { useAppData } from '../../lib/appData/AppDataContext';
import { suggestedSongTags } from '../../lib/mockData';
import { Song, SongLink, SongPlatform } from '../../types';
import { makeId } from '../../utils/ids';
import { ChoirAccessState, ChoirScope, ChoirScopeValue } from './ChoirScope';
import { DraftLink, matchingSong, SongDraft, songDraft, SongErrors, SongField, validateSongDraft } from './choirPresentation';

const platforms: SongPlatform[] = ['YouTube', 'Spotify', 'Apple Music', 'Other'];

/** Song collaboration remains available to every choir member. */
export default function SongFormScreen() {
  const { teamId, songId } = useLocalSearchParams<{ teamId: string | string[]; songId?: string | string[] }>();
  return <ChoirScope teamId={typeof teamId === 'string' ? teamId : null} routeKey={songId === undefined ? 'new' : `edit:${String(songId)}`}>
    {(scope) => <SongForm scope={scope} songId={typeof songId === 'string' ? songId : null} editing={songId !== undefined} />}
  </ChoirScope>;
}

function SongForm({ scope, songId, editing }: { scope: ChoirScopeValue; songId: string | null; editing: boolean }) {
  const styles = useThemedStyles(createStyles);
  const { team, user } = scope;
  const router = useRouter();
  const data = useAppData();
  const showToast = useToast();
  const existing = matchingSong(data.songs, songId, team?.id ?? null, user.profile.organisation_id);
  const original = useRef<Song | undefined>(undefined);
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [errors, setErrors] = useState<SongErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [failedCreationTitle, setFailedCreationTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const nextLinkId = useRef(1);
  const active = useRef(true);
  const closed = useRef(false);
  const requestPending = useRef(false);
  const completed = useRef(false);
  const current = useRef({ ready: scope.ready, existing, failedCreationTitle });
  current.current = { ready: scope.ready, existing, failedCreationTitle };
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<TextInput>(null);
  const lyricsRef = useRef<TextInput>(null);
  const positions = useRef<Partial<Record<SongField, number>>>({});
  const heading = editing ? 'Edit song' : 'Add song';

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (draft || !scope.ready || (editing && !existing)) return;
    original.current = existing;
    setDraft(songDraft(existing));
  }, [draft, scope.ready, editing, existing]);
  useEffect(() => {
    if (!savedId || !scope.ready || !team || closed.current) return;
    closed.current = true;
    showToast(editing ? 'Song updated.' : 'Song added.');
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: team.id, songId: savedId } });
  }, [savedId, scope.ready, team, editing, router, showToast]);
  useEffect(() => { if (saveError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [saveError]);

  const close = () => {
    closed.current = true;
    if (router.canGoBack()) router.back();
    else if (team && editing && songId) router.replace({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: team.id, songId } });
    else if (team) router.replace({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id } });
    else router.replace('/(tabs)/teams');
  };
  const { requestExit, exitRef, headerLeft } = useDiscardChanges({
    value: draft, blocked: saving, saved: savedId !== null, uncertain: saveError !== null,
    message: 'Your song changes will not be saved.', onDiscard: close,
  });
  const editable = () => active.current && !closed.current && current.current.ready && !requestPending.current && !completed.current
    && (!editing || !!current.current.existing);
  const focusField = (field: SongField) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[field] ?? 0) - spacing.md), animated: false });
    (field === 'title' ? titleRef : lyricsRef).current?.focus();
  };
  const change = <K extends keyof SongDraft>(field: K, value: SongDraft[K]) => {
    if (!editable()) return;
    setDraft((previous) => previous ? { ...previous, [field]: value } : previous);
    if (field === 'title' || field === 'lyrics') setErrors((previous) => ({ ...previous, [field]: undefined }));
  };
  const updateLink = (localId: string, patch: Partial<Pick<DraftLink, 'platform' | 'url'>>) => {
    if (draft) change('links', draft.links.map((link) => link.localId === localId ? { ...link, ...patch } : link));
  };
  const checkLibrary = () => {
    const attemptedTitle = current.current.failedCreationTitle;
    if (!editable() || !team || attemptedTitle === null) return;
    void data.refreshSongs();
    // Push keeps this draft in the stack so Back can return to it. A failed
    // refresh remains visible in the library; no title-based identity inference.
    router.push({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id, search: attemptedTitle } });
  };
  const save = async () => {
    if (!editable() || !draft || !team) return;
    const validated = validateSongDraft(draft);
    setErrors(validated);
    if (Object.keys(validated).length) {
      requestAnimationFrame(() => { if (editable()) focusField(Object.keys(validated)[0] as SongField); });
      return;
    }
    setSaveError(null);
    const cleanLinks: SongLink[] = draft.links.filter((link) => link.url.trim()).map((link) => ({
      id: makeId('link'), song_id: existing?.id ?? 'pending', platform: link.platform, url: link.url.trim(),
    }));
    const record = { team_id: team.id, title: draft.title.trim(), lyrics: draft.lyrics.trim(),
      artist: draft.artist.trim() || null, notes: draft.notes.trim() || null, tags: draft.tags, links: cleanLinks,
      added_by: original.current?.added_by ?? user.profile.id };
    requestPending.current = true; setSaving(true);
    try {
      let id: string;
      if (editing && existing) { await data.updateSong(existing.id, record); id = existing.id; }
      else id = (await data.addSong(record)).id;
      if (active.current && !closed.current) { completed.current = true; setSavedId(id); }
    } catch (error) {
      if (active.current && !closed.current) {
        setSaveError(error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.');
        if (!editing) setFailedCreationTitle(record.title);
      }
    } finally {
      requestPending.current = false;
      if (active.current) setSaving(false);
    }
  };

  if (savedId) return <Screen><Stack.Screen options={{ headerLeft, title: 'Song saved' }} />
    <PageHeading title={editing ? 'Changes saved' : 'Song added'} description="Your song is saved in the team library." />
    {!scope.ready ? <StatePanel compact kind="loading" title="Checking your access…" message="You can close this screen or wait to continue." /> : null}
    <Button title="Close" variant="secondary" onPress={() => requestExit()} />
  </Screen>;
  if (!scope.ready || !team) return <ChoirAccessState scope={scope} title={heading} onExit={() => requestExit()} exitLabel="Cancel" />;
  if (editing && !existing) return <Screen><Stack.Screen options={{ headerLeft, title: heading }} />
    {data.songsLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading this song…" />
      : data.songsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this song" message={data.songsError}
        action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} />
        : <StatePanel headingLevel={1} title="Song unavailable" message="This song may have been deleted or belongs to a different team." />}
    <Button title="Back to songs" variant="secondary" onPress={() => { closed.current = true; router.replace({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id } }); }} />
  </Screen>;
  if (!draft) return <Screen><Stack.Screen options={{ headerLeft, title: heading }} /><StatePanel headingLevel={1} kind="loading" title="Preparing the song…" /></Screen>;

  const availableTags = [...new Set([...suggestedSongTags, ...draft.tags])];
  const uncertainCreation = !editing && failedCreationTitle !== null;
  return <Screen keyboard scrollRef={scrollRef} footer={<View style={styles.fields}>
    {uncertainCreation ? <Button title="Check song library" variant="primary" disabled={saving} onPress={checkLibrary} /> : null}
    <View style={styles.actions}>
      <Button ref={exitRef} title="Cancel" variant={uncertainCreation ? 'ghost' : 'secondary'} disabled={saving} onPress={() => requestExit()} style={styles.cancel} />
      <Button title={uncertainCreation ? 'Try saving again' : editing ? 'Save changes' : 'Save song'} variant={uncertainCreation ? 'secondary' : 'primary'}
        loading={saving} onPress={() => void save()} style={styles.save} />
    </View>
  </View>}>
    <Stack.Screen options={{ headerLeft, title: heading }} />
    <PageHeading eyebrow={team.name} title={heading} description="Start with the title and lyrics." />
    {saveError || uncertainCreation ? <View style={styles.fields}><StatePanel compact kind="error" title="Couldn't confirm the save"
      message={editing ? 'Some changes may already be saved. Your draft is kept here.' : 'This song may already be in the library. Check before trying again; your draft is kept here.'} />
      {saveError && saveError !== 'Your changes could not be saved. Please try again.' ? <AppText tone="danger">{saveError}</AppText> : null}
    </View> : null}
    {data.songsError && editing ? <StatePanel compact kind="error" title="Couldn't refresh this song" message="Your draft is kept. Try again for the latest library data."
      action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} /> : null}
    <FormErrorSummary errors={Object.entries(errors).filter(([, message]) => !!message).map(([key, message]) => ({ key, message: message!, onPress: () => focusField(key as SongField) }))} />
    <View onLayout={(event) => { positions.current.title = event.nativeEvent.layout.y; }}>
      <TextField ref={titleRef} label="Song title" placeholder="e.g. Amazing Grace" value={draft.title} onChangeText={(value) => change('title', value)} error={errors.title} editable={!saving} />
    </View>
    <View onLayout={(event) => { positions.current.lyrics = event.nativeEvent.layout.y; }}>
      <TextField ref={lyricsRef} label="Lyrics" placeholder="Paste or type the lyrics here" value={draft.lyrics} onChangeText={(value) => change('lyrics', value)}
        error={errors.lyrics} editable={!saving} multiline style={styles.lyrics} />
    </View>
    <ListRow title="Artist and notes (optional)" subtitle={detailsOpen ? undefined : [draft.artist, draft.notes.trim() ? 'Notes added' : null].filter(Boolean).join(' · ') || 'Artist, source or guidance for your team'}
      icon={detailsOpen ? 'remove-outline' : 'add-outline'} showChevron={false} disabled={saving} accessibilityState={{ expanded: detailsOpen }}
      onPress={() => { if (editable()) setDetailsOpen((value) => !value); }} />
    {detailsOpen ? <View style={styles.fields}>
      <TextField label="Artist / source (optional)" placeholder="e.g. John Newton" value={draft.artist} onChangeText={(value) => change('artist', value)} editable={!saving} />
      <TextField label="Notes (optional)" placeholder="e.g. Usually sung in G." value={draft.notes} onChangeText={(value) => change('notes', value)} editable={!saving} multiline />
    </View> : null}
    <ListRow title="Tags (optional)" subtitle={tagsOpen ? undefined : draft.tags.join(' · ') || 'Help people find this song'}
      icon={tagsOpen ? 'remove-outline' : 'add-outline'} showChevron={false} disabled={saving} accessibilityState={{ expanded: tagsOpen }}
      onPress={() => { if (editable()) setTagsOpen((value) => !value); }} />
    {tagsOpen ? <View style={styles.tags}>{availableTags.map((tag) => {
      const checked = draft.tags.includes(tag);
      return <Pressable key={tag} accessibilityRole="checkbox" accessibilityLabel={`Tag: ${tag}`} accessibilityState={{ checked, disabled: saving }}
        aria-checked={checked} aria-disabled={saving} disabled={saving}
        onPress={() => change('tags', checked ? draft.tags.filter((item) => item !== tag) : [...draft.tags, tag])}
        style={({ pressed }) => [styles.tag, checked && styles.checkedTag, pressed && styles.pressed]}>
        <AppText variant="label" tone={checked ? 'inverse' : 'primary'}>{checked ? '✓ ' : ''}{tag}</AppText>
      </Pressable>;
    })}</View> : null}
    <ListRow title="Music links (optional)" subtitle={linksOpen ? undefined : draft.links.length ? `${draft.links.length} ${draft.links.length === 1 ? 'link' : 'links'}` : 'YouTube, Spotify, Apple Music or another link'}
      icon={linksOpen ? 'remove-outline' : 'add-outline'} showChevron={false} disabled={saving} accessibilityState={{ expanded: linksOpen }}
      onPress={() => { if (editable()) setLinksOpen((value) => !value); }} />
    {linksOpen ? <View style={styles.fields}>
      {draft.links.map((link, index) => <ListGroup key={link.localId}><View style={styles.linkFields}>
        <AppText variant="subheading" headingLevel={2}>Link {index + 1}</AppText>
        <SelectField label={`Platform for link ${index + 1}`} value={link.platform} options={platforms.map((platform) => ({ label: platform, value: platform }))}
          onChange={(value) => updateLink(link.localId, { platform: value })} disabled={saving} />
        <TextField label={`Web address for link ${index + 1}`} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url"
          value={link.url} onChangeText={(value) => updateLink(link.localId, { url: value })} editable={!saving} />
        <Button title="Remove link" accessibilityLabel={`Remove link ${index + 1}`} variant="ghost" icon="remove-circle-outline" disabled={saving}
          onPress={() => change('links', draft.links.filter((item) => item.localId !== link.localId))} />
      </View></ListGroup>)}
      <Button title="Add music link" variant="secondary" icon="link-outline" disabled={saving}
        onPress={() => change('links', [...draft.links, { localId: `new:${nextLinkId.current++}`, platform: 'YouTube', url: '' }])} />
    </View> : null}
  </Screen>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  lyrics: { minHeight: 190 },
  fields: { gap: spacing.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  checkedTag: { backgroundColor: colors.primary },
  pressed: { borderColor: colors.text, borderWidth: 2 },
  linkFields: { padding: spacing.lg, gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 100 },
  save: { flexGrow: 2, flexBasis: 160 },
});
