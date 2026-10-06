import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { Linking } from 'react-native';

import { ActionSheet } from '../../../components/ActionSheet';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { SessionUser } from '../../../types';
import SongDatabaseScreen from '../SongDatabaseScreen';
import SongDetailScreen from '../SongDetailScreen';
import SongFormScreen from '../SongFormScreen';
import { deferred, makeChoirData, member, profile, secondSong, singer, song, team } from './choirFixtures';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
let mockParams: { teamId: string | string[]; songId?: string | string[]; search?: string | string[] } = { teamId: 'choir' };
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const mockConfirm = jest.fn();
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));
const mockToast = jest.fn();
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

let data: ReturnType<typeof useAppData>;
let auth: { user: SessionUser | null; authMode: string; isLoading: boolean; accountStatus: string };

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 1, 12) });
  jest.clearAllMocks();
  mockParams = { teamId: team.id };
  mockCanGoBack.mockReturnValue(true);
  mockConfirm.mockResolvedValue(false);
  data = makeChoirData();
  auth = { user: member, authMode: 'demo', isLoading: false, accountStatus: 'ready' };
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockImplementation(() => auth);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

function detail() { mockParams.songId = song.id; return render(<SongDetailScreen />); }
function form(editing = true) { if (editing) mockParams.songId = song.id; return render(<SongFormScreen />); }
function manage(screen: ReturnType<typeof render>, label: string) {
  fireEvent.press(screen.getByLabelText('Manage song'));
  fireEvent.press(screen.getByRole('button', { name: label }));
}
function action(screen: ReturnType<typeof render>, title: string): () => void {
  return screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === title)!.props.onPress;
}

describe('song library and access', () => {
  it('lets an ordinary member open, search and add songs with the existing routes', () => {
    const screen = render(<SongDatabaseScreen />);
    fireEvent.press(screen.getByLabelText('Add song'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs/edit', params: { teamId: team.id } });
    fireEvent.changeText(screen.getByLabelText('Search songs'), 'Another artist');
    expect(screen.getByLabelText('Open Beta song by Another artist')).toBeTruthy();
    expect(screen.queryByText('Alpha song')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search songs'), 'Custom retained tag');
    fireEvent.press(screen.getByLabelText('Open Alpha song by Our choir'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: team.id, songId: song.id } });
  });
  it.each(['library', 'detail', 'form'])('retains an authorized generic-team %s deep link', (page) => {
    data.teams = [{ ...team, type: 'generic' }];
    if (page !== 'library') mockParams.songId = song.id;
    const screen = render(page === 'library' ? <SongDatabaseScreen /> : page === 'detail' ? <SongDetailScreen /> : <SongFormScreen />);
    expect(screen.queryByText('No permission')).toBeNull();
    expect(screen.getByLabelText(page === 'library' ? 'Add song' : page === 'detail' ? 'Manage song' : 'Save changes')).toBeTruthy();
  });
  it('prefills a requested library search and keeps manual changes through same-profile readiness', () => {
    mockParams.search = song.title; auth.authMode = 'supabase';
    const screen = render(<SongDatabaseScreen />);
    expect(screen.getByDisplayValue(song.title)).toBeTruthy();
    expect(screen.getByText(song.title)).toBeTruthy();
    expect(screen.queryByText(secondSong.title)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Search songs'), 'Another artist');
    auth.accountStatus = 'loading'; screen.rerender(<SongDatabaseScreen />);
    auth.accountStatus = 'ready'; screen.rerender(<SongDatabaseScreen />);
    expect(screen.getByDisplayValue('Another artist')).toBeTruthy();
    expect(screen.getByText(secondSong.title)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search songs'), 'No matching title');
    fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByDisplayValue('')).toBeTruthy();
    expect(screen.getByText(song.title)).toBeTruthy();
  });
  it('ignores an ambiguous array search parameter and preserves normal library navigation', () => {
    mockParams.search = [song.title, secondSong.title];
    const screen = render(<SongDatabaseScreen />);
    expect(screen.getByDisplayValue('')).toBeTruthy();
    expect(screen.getByText(song.title)).toBeTruthy();
    expect(screen.getByText(secondSong.title)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add song'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs/edit', params: { teamId: team.id } });
  });
  it('keeps a prefilled search read failure explicit instead of treating it as a save result', () => {
    mockParams.search = 'Possible saved song'; data.songsError = 'The read failed.';
    const screen = render(<SongDatabaseScreen />);
    expect(screen.getByText("Couldn't refresh songs")).toBeTruthy();
    expect(screen.getByDisplayValue('Possible saved song')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry songs'));
    expect(data.refreshSongs).toHaveBeenCalledTimes(1);
    expect(data.addSong).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it.each(['archived', 'foreign', 'membership', 'removed-profile'])('denies %s access and offers a safe exit', (reason) => {
    if (reason === 'archived') data.teams = [{ ...team, archived_at: '2026-09-01' }];
    if (reason === 'foreign') data.teams = [{ ...team, organisation_id: 'other' }];
    if (reason === 'membership') auth.user = { ...member, memberships: [] };
    if (reason === 'removed-profile') auth.user = { ...member, profile: { ...profile, access_status: 'removed' } };
    const screen = render(<SongDatabaseScreen />);
    expect(screen.queryByText(song.title)).toBeNull();
    expect(screen.queryByLabelText('Add song')).toBeNull();
    fireEvent.press(screen.getByLabelText('Back to teams'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });
  it('has a safe exit while a signed-out identity is unresolved', () => {
    auth.user = null;
    const screen = render(<SongDatabaseScreen />);
    fireEvent.press(screen.getByLabelText('Back to home'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
  it.each(['loading', 'error', 'empty'])('distinguishes a %s library', (state) => {
    data.songs = []; data.songsLoading = state === 'loading'; data.songsError = state === 'error' ? 'Offline.' : null;
    const screen = render(<SongDatabaseScreen />);
    expect(screen.getByText(state === 'loading' ? 'Loading songs…' : state === 'error' ? "Couldn't load songs" : 'No songs yet')).toBeTruthy();
    if (state === 'error') { fireEvent.press(screen.getByLabelText('Retry songs')); expect(data.refreshSongs).toHaveBeenCalledTimes(1); }
  });
  it('keeps cached songs with retry and separates no search matches from no songs', () => {
    data.songsError = 'Offline.';
    const screen = render(<SongDatabaseScreen />);
    expect(screen.getByText(song.title)).toBeTruthy();
    expect(screen.getByText("Couldn't refresh songs")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search songs'), 'unknown');
    expect(screen.getByText('No matching songs')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByText(song.title)).toBeTruthy();
  });
  it('renders a bounded initial window for a long library', () => {
    data.songs = Array.from({ length: 160 }, (_, i) => ({ ...song, id: 'long-' + i, title: 'Song ' + String(i).padStart(3, '0') }));
    const screen = render(<SongDatabaseScreen />);
    expect(screen.getByText('Song 000')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Open Song/ }).length).toBeLessThan(160);
    expect(screen.queryByText('Song 159')).toBeNull();
  });
  it('fences a retained Add callback after team membership loss', () => {
    const screen = render(<SongDatabaseScreen />);
    const add = action(screen, 'Add song');
    auth.user = { ...member, memberships: [] }; screen.rerender(<SongDatabaseScreen />);
    act(() => add());
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('song reading and management', () => {
  it('shows readable lyrics, notes and labelled external links without displaying raw URLs', () => {
    const screen = detail();
    expect(screen.getByText(song.lyrics)).toBeTruthy();
    expect(screen.getByText(song.notes!)).toBeTruthy();
    expect(screen.queryByText(song.links[0].url)).toBeNull();
    expect(screen.queryByLabelText('Open YouTube link 1')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^Music links/ }));
    expect(screen.getByLabelText('Open YouTube link 1')).toBeTruthy();
    expect(screen.UNSAFE_getByType(Stack.Screen).props.options.title).toBe('Song');
    expect(screen.queryByLabelText('Delete song')).toBeNull();
    manage(screen, 'Edit song');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs/edit', params: { teamId: team.id, songId: song.id } });
  });
  it.each(['team', 'organisation'])('rejects a song from a different %s', (reason) => {
    data.songs = [{ ...song, ...(reason === 'team' ? { team_id: 'elsewhere' } : { organisation_id: 'elsewhere' }) }];
    const screen = detail();
    expect(screen.getByText('Song unavailable')).toBeTruthy();
    expect(screen.queryByText(song.lyrics)).toBeNull();
    fireEvent.press(screen.getByLabelText('Back to songs'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id } });
  });
  it('distinguishes a cold read failure from a missing song and retries', () => {
    data.songs = []; data.songsLoading = true;
    const screen = detail();
    expect(screen.getByText('Loading this song…')).toBeTruthy();
    data = { ...data, songsLoading: false, songsError: 'Offline.' }; screen.rerender(<SongDetailScreen />);
    expect(screen.getByText("Couldn't load this song")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry songs'));
    expect(data.refreshSongs).toHaveBeenCalledTimes(1);
  });
  it('recovers from external-link failure with a clear explicit retry', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('Native failure.'));
    const screen = detail();
    fireEvent.press(screen.getByRole('button', { name: /^Music links/ }));
    fireEvent.press(screen.getByLabelText('Open YouTube link 1'));
    expect(await screen.findByText("Couldn't open this link")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry link'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(2));
    expect(Linking.openURL).toHaveBeenLastCalledWith(song.links[0].url);
    expect(screen.queryByText("Couldn't open this link")).toBeNull();
  });
  it('requires confirmation and retains ordinary-member delete capability', async () => {
    const screen = detail();
    manage(screen, 'Delete song');
    await act(async () => {});
    expect(data.deleteSong).not.toHaveBeenCalled();
    mockConfirm.mockResolvedValueOnce(true);
    manage(screen, 'Delete song');
    await waitFor(() => expect(data.deleteSong).toHaveBeenCalledWith(song.id));
    expect(mockConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ confirmLabel: 'Delete song', message: expect.stringContaining('selected songs on the rota') }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('keeps a failed delete retryable without claiming success', async () => {
    mockConfirm.mockResolvedValue(true);
    (data.deleteSong as jest.Mock).mockRejectedValueOnce(new Error('Please retry.'));
    const screen = detail(); manage(screen, 'Delete song');
    expect(await screen.findByText("Couldn't delete the song")).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Retry delete'));
    await waitFor(() => expect(data.deleteSong).toHaveBeenCalledTimes(2));
    expect(mockToast).toHaveBeenCalledWith('Song deleted.');
  });
  it.each(['membership', 'profile', 'archived', 'checking'])('rechecks %s after a pending delete confirmation', async (reason) => {
    const answer = deferred<boolean>(); mockConfirm.mockReturnValue(answer.promise);
    auth.authMode = 'supabase';
    const screen = detail(); manage(screen, 'Delete song');
    if (reason === 'membership') auth.user = { ...member, memberships: [] };
    if (reason === 'profile') auth.user = { ...member, profile: singer };
    if (reason === 'archived') data.teams = [{ ...team, archived_at: '2026-09-01' }];
    if (reason === 'checking') auth.accountStatus = 'loading';
    screen.rerender(<SongDetailScreen />);
    await act(async () => answer.resolve(true));
    expect(data.deleteSong).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('rejects a stale Manage action after access becomes unresolved', () => {
    auth.authMode = 'supabase';
    const screen = detail(); fireEvent.press(screen.getByLabelText('Manage song'));
    const edit = screen.UNSAFE_getByType(ActionSheet).props.actions[0].onPress;
    auth.accountStatus = 'loading'; screen.rerender(<SongDetailScreen />);
    act(() => edit());
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('keeps a known completed deletion visible through a readiness check', async () => {
    const pending = deferred<void>(); mockConfirm.mockResolvedValue(true);
    (data.deleteSong as jest.Mock).mockReturnValue(pending.promise);
    auth.authMode = 'supabase';
    const screen = detail(); manage(screen, 'Delete song');
    await act(async () => {});
    auth.accountStatus = 'loading'; screen.rerender(<SongDetailScreen />);
    await act(async () => pending.resolve());
    expect(screen.getByText('Song deleted')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    auth.accountStatus = 'ready'; screen.rerender(<SongDetailScreen />);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('song creation and editing', () => {
  it('hydrates a cold edit only when its song loads and never becomes creation', () => {
    data.songs = []; data.songsLoading = true;
    const screen = form();
    expect(screen.UNSAFE_getByType(Stack.Screen).props.options.title).toBe('Edit song');
    expect(screen.queryByLabelText('Save song')).toBeNull();
    data = { ...data, songsLoading: false, songsError: 'Offline.' }; screen.rerender(<SongFormScreen />);
    expect(screen.getByText("Couldn't load this song")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry songs'));
    data = { ...data, songs: [song], songsError: null }; screen.rerender(<SongFormScreen />);
    expect(screen.getByDisplayValue(song.title)).toBeTruthy();
    expect(screen.getByDisplayValue(song.lyrics)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Artist and notes/ }));
    expect(screen.getByDisplayValue(song.artist!)).toBeTruthy();
    expect(screen.getByDisplayValue(song.notes!)).toBeTruthy();
    expect(data.addSong).not.toHaveBeenCalled();
  });
  it.each(['team', 'organisation', 'missing', 'malformed'])('cannot edit a %s target as a new song', (reason) => {
    if (reason === 'team') data.songs = [{ ...song, team_id: 'other' }];
    if (reason === 'organisation') data.songs = [{ ...song, organisation_id: 'other' }];
    if (reason === 'missing') data.songs = [];
    mockParams.songId = reason === 'malformed' ? [song.id, secondSong.id] : song.id;
    const screen = render(<SongFormScreen />);
    expect(screen.getByText('Song unavailable')).toBeTruthy();
    expect(screen.queryByLabelText('Save song')).toBeNull();
    expect(screen.queryByLabelText('Save changes')).toBeNull();
  });
  it('requires only title and lyrics and supports the ordinary-member add path', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = form(false);
    expect(screen.queryByLabelText('Artist / source (optional)')).toBeNull();
    fireEvent.press(screen.getByLabelText('Save song'));
    expect(screen.getAllByText('Add a song title.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Add the lyrics.').length).toBeGreaterThan(0);
    expect(data.addSong).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Song title'), '  A new song  ');
    fireEvent.changeText(screen.getByLabelText('Lyrics'), '  New words  ');
    fireEvent.press(screen.getByLabelText('Save song'));
    await waitFor(() => expect(data.addSong).toHaveBeenCalledWith({ team_id: team.id, title: 'A new song', lyrics: 'New words', artist: null, notes: null, tags: [], links: [], added_by: profile.id }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: team.id, songId: 'new-song' } }));
  });
  it('preserves edits, order and optional values through same-profile readiness and collection refresh', () => {
    auth.authMode = 'supabase';
    const screen = form();
    fireEvent.changeText(screen.getByLabelText('Song title'), 'My unsaved title');
    fireEvent.press(screen.getByRole('button', { name: /^Music links/ }));
    fireEvent.changeText(screen.getByLabelText('Web address for link 1'), 'https://example.test/unsaved');
    auth.accountStatus = 'loading'; data = { ...data, teams: [], songs: [] }; screen.rerender(<SongFormScreen />);
    expect(screen.getByText('Checking your access…')).toBeTruthy();
    auth.accountStatus = 'ready'; data = { ...data, teams: [team], songs: [{ ...song, title: 'A refreshed title' }] }; screen.rerender(<SongFormScreen />);
    expect(screen.getByDisplayValue('My unsaved title')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.test/unsaved')).toBeTruthy();
  });
  it('retains custom tags and hidden optional fields and preserves original author/creation semantics', async () => {
    const screen = form();
    fireEvent.press(screen.getByRole('button', { name: /^Tags/ }));
    const custom = screen.getByRole('checkbox', { name: 'Tag: Custom retained tag' });
    expect(custom.props.accessibilityState.checked).toBe(true);
    expect(screen.UNSAFE_root.findAll((node: { props: { accessibilityLabel?: string; 'aria-checked'?: boolean } }) => node.props.accessibilityLabel === 'Tag: Custom retained tag' && node.props['aria-checked'] === true)).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: /^Music links/ }));
    fireEvent.press(screen.getByLabelText('Add music link'));
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(data.updateSong).toHaveBeenCalledTimes(1));
    const patch = (data.updateSong as jest.Mock).mock.calls[0][1];
    expect(patch).toMatchObject({ added_by: singer.id, artist: song.artist, notes: song.notes, tags: song.tags });
    expect(patch.created_at).toBeUndefined();
    expect(patch.links).toHaveLength(1);
    expect(patch.links[0]).toEqual({ id: expect.any(String), song_id: song.id, platform: 'YouTube', url: song.links[0].url });
    expect(patch.links[0].localId).toBeUndefined();
  });
  it('keeps link rows paired after removing an earlier link', () => {
    data.songs = [{ ...song, links: [...song.links, { id: 'link-2', song_id: song.id, platform: 'Spotify', url: 'https://example.test/two' }] }];
    const screen = form();
    fireEvent.press(screen.getByRole('button', { name: /^Music links/ }));
    fireEvent.changeText(screen.getByLabelText('Web address for link 2'), 'https://example.test/new-two');
    fireEvent.press(screen.getByLabelText('Remove link 1'));
    expect(screen.getByLabelText('Platform for link 1: Spotify')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.test/new-two')).toBeTruthy();
  });
  it('retains the draft after a save failure and retries without switching to add', async () => {
    (data.updateSong as jest.Mock).mockRejectedValueOnce(new Error('Please retry.'));
    const screen = form(); fireEvent.changeText(screen.getByLabelText('Song title'), 'Keep this title');
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText("Couldn't confirm the save")).toBeTruthy();
    expect(screen.getByDisplayValue('Keep this title')).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(data.updateSong).toHaveBeenCalledTimes(2));
    expect(data.addSong).not.toHaveBeenCalled();
  });
  it('prioritizes a footer library check using the failed attempt title while keeping the edited draft for Back', async () => {
    (data.addSong as jest.Mock).mockRejectedValueOnce(new Error('Your changes could not be saved. Please try again.'));
    const screen = form(false);
    fireEvent.changeText(screen.getByLabelText('Song title'), '  Possible saved song  ');
    fireEvent.changeText(screen.getByLabelText('Lyrics'), 'My draft words');
    fireEvent.press(screen.getByLabelText('Save song'));
    expect(await screen.findByText("Couldn't confirm the save")).toBeTruthy();
    expect(screen.getByText('This song may already be in the library. Check before trying again; your draft is kept here.')).toBeTruthy();
    expect(screen.queryByLabelText('Save song')).toBeNull();
    expect(screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Check song library')!.props.variant).toBe('primary');
    expect(screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Try saving again')!.props.variant).toBe('secondary');
    expect(screen.UNSAFE_getByType(Screen).props.footer.props.children[0].props.title).toBe('Check song library');
    expect(screen.getAllByLabelText('Check song library')).toHaveLength(1);
    fireEvent.changeText(screen.getByLabelText('Song title'), 'Edited after the failed attempt');
    fireEvent.press(screen.getByLabelText('Check song library'));
    expect(data.refreshSongs).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id, search: 'Possible saved song' } });
    expect(mockBack).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
    data = { ...data, songsError: 'The refresh failed.' }; screen.rerender(<SongFormScreen />);
    expect(screen.getByDisplayValue('Edited after the failed attempt')).toBeTruthy();
    expect(screen.getByDisplayValue('My draft words')).toBeTruthy();
    expect(data.addSong).toHaveBeenCalledTimes(1);
  });
  it('keeps an explicit creation retry single-flight and searches its submitted title if it also fails', async () => {
    const pending = deferred<ReturnType<typeof makeChoirData>['songs'][number]>();
    (data.addSong as jest.Mock).mockRejectedValueOnce(new Error('Please retry.')).mockReturnValueOnce(pending.promise);
    const screen = form(false);
    fireEvent.changeText(screen.getByLabelText('Song title'), 'First attempt');
    fireEvent.changeText(screen.getByLabelText('Lyrics'), 'My words');
    fireEvent.press(screen.getByLabelText('Save song'));
    expect(await screen.findByText("Couldn't confirm the save")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Song title'), 'Second attempt');
    const retry = action(screen, 'Try saving again');
    const check = action(screen, 'Check song library');
    fireEvent.press(screen.getByLabelText('Try saving again'));
    act(() => { retry(); check(); });
    expect(data.addSong).toHaveBeenCalledTimes(2);
    expect(data.refreshSongs).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Check song library').props.accessibilityState.disabled).toBe(true);
    await act(async () => pending.reject(new Error('Please retry.')));
    fireEvent.changeText(screen.getByLabelText('Song title'), 'Later unsaved title');
    fireEvent.press(screen.getByLabelText('Check song library'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id, search: 'Second attempt' } });
    expect(data.addSong).toHaveBeenCalledTimes(2);
  });
  it('keeps the uncertain creation recovery after retry validation fails', async () => {
    (data.addSong as jest.Mock).mockRejectedValueOnce(new Error('Please retry.'));
    const screen = form(false);
    fireEvent.changeText(screen.getByLabelText('Song title'), 'Submitted title');
    fireEvent.changeText(screen.getByLabelText('Lyrics'), 'My words');
    fireEvent.press(screen.getByLabelText('Save song'));
    expect(await screen.findByText("Couldn't confirm the save")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Song title'), '');
    fireEvent.press(screen.getByLabelText('Try saving again'));
    expect(screen.getAllByText('Add a song title.').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Save song')).toBeNull();
    fireEvent.press(screen.getByLabelText('Check song library'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs', params: { teamId: team.id, search: 'Submitted title' } });
    expect(data.addSong).toHaveBeenCalledTimes(1);
  });
  it('fences retained creation-recovery callbacks after team access loss', async () => {
    (data.addSong as jest.Mock).mockRejectedValueOnce(new Error('Please retry.'));
    const screen = form(false);
    fireEvent.changeText(screen.getByLabelText('Song title'), 'Submitted title');
    fireEvent.changeText(screen.getByLabelText('Lyrics'), 'My words');
    fireEvent.press(screen.getByLabelText('Save song'));
    expect(await screen.findByText("Couldn't confirm the save")).toBeTruthy();
    const retry = action(screen, 'Try saving again'); const check = action(screen, 'Check song library');
    auth.user = { ...member, memberships: [] }; screen.rerender(<SongFormScreen />);
    act(() => { retry(); check(); });
    expect(data.addSong).toHaveBeenCalledTimes(1);
    expect(data.refreshSongs).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled();
  });
  it('records success once even when access is temporarily unresolved', async () => {
    const pending = deferred<void>(); (data.updateSong as jest.Mock).mockReturnValue(pending.promise);
    auth.authMode = 'supabase';
    const screen = form(); const save = action(screen, 'Save changes');
    fireEvent.press(screen.getByLabelText('Save changes'));
    auth.accountStatus = 'loading'; screen.rerender(<SongFormScreen />);
    await act(async () => pending.resolve());
    expect(screen.getByText('Changes saved')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    act(() => save());
    expect(data.updateSong).toHaveBeenCalledTimes(1);
    auth.accountStatus = 'ready'; screen.rerender(<SongFormScreen />);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it.each(['membership', 'profile', 'route'])('fences a stale save and replaces the draft after %s change', async (reason) => {
    const screen = form(); const save = action(screen, 'Save changes');
    fireEvent.changeText(screen.getByLabelText('Song title'), 'Discard on scope loss');
    if (reason === 'membership') auth.user = { ...member, memberships: [] };
    if (reason === 'profile') auth.user = { ...member, profile: singer };
    if (reason === 'route') mockParams.songId = secondSong.id;
    screen.rerender(<SongFormScreen />);
    await act(async () => save());
    expect(data.updateSong).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('Discard on scope loss')).toBeNull();
  });
  it('ignores a late save completion after the profile changes', async () => {
    const pending = deferred<void>(); (data.updateSong as jest.Mock).mockReturnValue(pending.promise);
    const screen = form(); fireEvent.press(screen.getByLabelText('Save changes'));
    auth.user = { ...member, profile: singer }; screen.rerender(<SongFormScreen />);
    await act(async () => pending.resolve());
    expect(mockBack).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled();
  });
  it('Cancel from a direct edit returns to its song without writing', () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = form(); fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: team.id, songId: song.id } });
    expect(data.updateSong).not.toHaveBeenCalled();
  });
});
