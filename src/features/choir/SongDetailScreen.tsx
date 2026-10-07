import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName } from '../../lib/appData/selectors';
import { SongPlatform } from '../../types';
import { formatRelative } from '../../utils/dates';
import { ChoirAccessState, ChoirScope, ChoirScopeValue } from './ChoirScope';
import { matchingSong } from './choirPresentation';

const platformIcons: Record<SongPlatform, keyof typeof Ionicons.glyphMap> = {
  YouTube: 'logo-youtube', Spotify: 'musical-notes-outline', 'Apple Music': 'logo-apple', Other: 'link-outline',
};

export default function SongDetailScreen() {
  const { teamId, songId } = useLocalSearchParams<{ teamId: string | string[]; songId: string | string[] }>();
  return <ChoirScope teamId={typeof teamId === 'string' ? teamId : null} routeKey={`song:${String(songId)}`}>
    {(scope) => <SongDetail scope={scope} songId={typeof songId === 'string' ? songId : null} />}
  </ChoirScope>;
}

function SongDetail({ scope, songId }: { scope: ChoirScopeValue; songId: string | null }) {
  const { team, user } = scope;
  const router = useRouter();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const song = matchingSong(data.songs, songId, team?.id ?? null, user.profile.organisation_id);
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [openingLink, setOpeningLink] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const manageRef = useRef<View>(null);
  const active = useRef(true);
  const closed = useRef(false);
  const requestPending = useRef(false);
  const linkPending = useRef(false);
  const current = useRef({ scope, song });
  current.current = { scope, song };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!deleted || !scope.ready || !team || closed.current) return;
    closed.current = true;
    showToast('Song deleted.');
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id } });
  }, [deleted, scope.ready, team, router, showToast]);

  const close = () => {
    closed.current = true;
    if (router.canGoBack()) router.back();
    else if (team) router.replace({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id } });
    else router.replace('/(tabs)/teams');
  };
  const canAct = () => active.current && !closed.current && current.current.scope.ready && !!current.current.song && !requestPending.current;

  const edit = () => {
    const latest = current.current;
    if (!canAct() || !latest.scope.team || !latest.song) return;
    router.push({ pathname: '/teams/[teamId]/songs/edit', params: { teamId: latest.scope.team.id, songId: latest.song.id } });
  };
  const remove = async () => {
    if (!canAct() || !song) return;
    requestPending.current = true;
    try {
      const ok = await confirm({ title: 'Delete song?', message: `Delete “${song.title}”? It will also be removed from any selected songs on the rota. This cannot be undone.`, confirmLabel: 'Delete song', returnFocusRef: manageRef });
      if (!ok || !active.current || closed.current || !current.current.scope.ready || current.current.song?.id !== song.id) return;
      setDeleteError(null); setDeleting(true);
      await data.deleteSong(song.id);
      if (active.current && !closed.current) setDeleted(true);
    } catch (error) {
      if (active.current && !closed.current) setDeleteError(error instanceof Error ? error.message : 'The song could not be deleted. Please try again.');
    } finally {
      requestPending.current = false;
      if (active.current) setDeleting(false);
    }
  };
  const openLink = async (id: string) => {
    const link = current.current.song?.links.find((item) => item.id === id);
    if (!canAct() || !link || linkPending.current) return;
    linkPending.current = true; setOpeningLink(id); setLinkError(null);
    try {
      await Linking.openURL(link.url);
    } catch {
      if (active.current && !closed.current) setLinkError(id);
    } finally {
      linkPending.current = false;
      if (active.current) setOpeningLink(null);
    }
  };

  if (deleted) return <Screen><Stack.Screen options={{ title: 'Song deleted' }} />
    <PageHeading title="Song deleted" description="It has been removed from the library and selected songs." />
    {!scope.ready ? <StatePanel compact kind="loading" title="Checking your access…" /> : null}
    <Button title="Close" variant="secondary" onPress={close} />
  </Screen>;
  if (!scope.ready || !team) return <ChoirAccessState scope={scope} title="Song" />;
  if (!song) return <Screen><Stack.Screen options={{ title: 'Song' }} />
    {deleting ? <StatePanel headingLevel={1} kind="loading" title="Deleting song…" />
      : data.songsLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading this song…" />
        : data.songsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this song" message={data.songsError}
          action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} />
          : <StatePanel headingLevel={1} title="Song unavailable" message="This song may have been deleted or belongs to a different team." />}
    <Button title="Back to songs" variant="secondary" onPress={() => { closed.current = true; router.replace({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id } }); }} />
  </Screen>;

  return <Screen>
    <Stack.Screen options={{ title: 'Song' }} />
    <View style={styles.context}>
      <AppText variant="label" tone="primary" style={styles.team}>{team.name}</AppText>
      <Button ref={manageRef} title="Manage" accessibilityLabel="Manage song" variant="ghost" icon="options-outline" disabled={deleting}
        onPress={() => { if (canAct()) setManaging(true); }} />
    </View>
    <PageHeading title={song.title} description={song.artist ?? undefined} />
    {song.tags.length ? <AppText variant="small" tone="secondary">{song.tags.join(' · ')}</AppText> : null}
    {deleteError ? <StatePanel compact kind="error" title="Couldn't delete the song" message={deleteError}
      action={{ label: 'Retry delete', onPress: () => void remove() }} /> : null}
    {data.songsError ? <StatePanel compact kind="error" title="Couldn't refresh this song" message="This is the last version loaded."
      action={{ label: 'Retry songs', onPress: () => void data.refreshSongs() }} /> : null}
    {song.links.length ? <View style={styles.links}>
      <ListRow title="Music links" subtitle={`${song.links.length} ${song.links.length === 1 ? 'link' : 'links'}`}
        icon={linksOpen ? 'remove-outline' : 'add-outline'} showChevron={false} disabled={deleting} accessibilityState={{ expanded: linksOpen }}
        onPress={() => { if (canAct()) setLinksOpen((value) => !value); }} />
      {linksOpen ? <><AppText variant="small" tone="secondary">These links open outside Shift Shepherd.</AppText>
      <ListGroup>{song.links.map((link, index) => <View key={link.id}>
        <ListRow icon={platformIcons[link.platform]} title={link.platform === 'Other' ? 'Open music link' : `Open on ${link.platform}`}
          accessibilityLabel={`Open ${link.platform === 'Other' ? 'music' : link.platform} link ${index + 1}`}
          disabled={!!openingLink || deleting} accessibilityState={{ busy: openingLink === link.id }}
          showChevron={false} right={<Ionicons name="open-outline" size={22} color={colors.primary} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
          onPress={() => void openLink(link.id)} />
        {linkError === link.id ? <View style={styles.linkError}><StatePanel compact kind="error" title="Couldn't open this link"
          message="Try again, or use Manage to check the saved music link."
          action={{ label: 'Retry link', onPress: () => void openLink(link.id) }} /></View> : null}
      </View>)}</ListGroup></> : null}
    </View> : null}
    <View style={styles.section}>
      <SectionHeader title="Lyrics" />
      <AppText selectable>{song.lyrics}</AppText>
    </View>
    {song.notes ? <View style={styles.section}><SectionHeader title="Notes" /><AppText>{song.notes}</AppText></View> : null}
    <AppText variant="small" tone="muted" style={styles.attribution}>
      Added by {userName(data.users, song.added_by)} · {formatRelative(song.created_at)}
    </AppText>
    <ActionSheet visible={managing} title="Manage song" description={song.title} returnFocusRef={manageRef} onClose={() => setManaging(false)} actions={[
      { key: 'edit', label: 'Edit song', icon: 'create-outline', disabled: deleting, onPress: edit },
      { key: 'delete', label: 'Delete song', icon: 'trash-outline', destructive: true, disabled: deleting, onPress: () => void remove() },
    ]} />
  </Screen>;
}

const styles = StyleSheet.create({
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  team: { flexGrow: 1, flexShrink: 1, flexBasis: 140 },
  section: { gap: spacing.md, marginTop: spacing.md },
  links: { gap: spacing.md },
  linkError: { padding: spacing.md },
  attribution: { marginTop: spacing.lg },
});
