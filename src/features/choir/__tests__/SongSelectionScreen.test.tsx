import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { Button } from '../../../components/Button';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { SessionUser } from '../../../types';
import SelectSongsScreen from '../SelectSongsScreen';
import { admin, assignments, deferred, entry, makeChoirData, member, profile, secondSong, selections, singer, song, team, thirdSong } from './choirFixtures';

const mockDiscardConfirm = jest.fn().mockResolvedValue(true);
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => mockDiscardConfirm }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
let mockParams: { teamId: string; entryId: string; section?: string } = { teamId: 'choir', entryId: 'date-1' };
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const mockToast = jest.fn();
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

let data: ReturnType<typeof useAppData>;
let auth: { user: SessionUser; authMode: string; isLoading: boolean; accountStatus: string };

beforeEach(() => {
  mockDiscardConfirm.mockReset().mockResolvedValue(true);
  jest.useFakeTimers({ now: new Date(2026, 9, 1, 12) }); jest.clearAllMocks();
  mockParams = { teamId: team.id, entryId: entry.id };
  mockCanGoBack.mockReturnValue(true);
  data = makeChoirData({ rotaAssignments: [assignments[0], assignments[2]] });
  auth = { user: member, authMode: 'demo', isLoading: false, accountStatus: 'ready' };
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockImplementation(() => auth);
});
afterEach(() => { jest.useRealTimers(); });

function buttonAction(screen: ReturnType<typeof render>, title: string): () => void {
  return screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === title)!.props.onPress;
}
function rowAction(screen: ReturnType<typeof render>, title: string): () => void {
  return screen.UNSAFE_getAllByType(ListRow).find((row) => row.props.title === title)!.props.onPress;
}
function order(screen: ReturnType<typeof render>) { fireEvent.press(screen.getByRole('tab', { name: /^Song order/ })); }

describe('section-specific song choices', () => {
  it('allows the assigned Praise Leader only their section', () => {
    const screen = render(<SelectSongsScreen />);
    expect(screen.getByLabelText('Save praise songs')).toBeTruthy();
    mockParams.section = 'worship'; screen.rerender(<SelectSongsScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
    expect(screen.queryByLabelText('Save worship songs')).toBeNull();
    expect(screen.getByLabelText('Back to date')).toBeTruthy();
  });
  it.each(['legacy', 'team-admin', 'church-admin'])('retains the %s override for both sections', (role) => {
    data.rotaAssignments = role === 'legacy' ? [{ ...assignments[0], role_name: 'Song Leader' }] : [];
    if (role === 'team-admin') auth.user = { ...member, memberships: [{ ...member.memberships[0], role: 'team_leader' }] };
    if (role === 'church-admin') auth.user = admin;
    const screen = render(<SelectSongsScreen />);
    expect(screen.getByLabelText('Save praise songs')).toBeTruthy();
    mockParams.section = 'worship'; screen.rerender(<SelectSongsScreen />);
    expect(screen.getByLabelText('Save worship songs')).toBeTruthy();
  });
  it('retains section-authorized generic-team deep links', () => {
    data.teams = [{ ...team, type: 'generic' }];
    const screen = render(<SelectSongsScreen />);
    expect(screen.getByLabelText('Save praise songs')).toBeTruthy();
  });
  it.each(['team', 'organisation', 'cancelled', 'archived', 'membership'])('refuses a %s mismatch or loss before exposing choices', (reason) => {
    if (reason === 'team') data.rotaEntries = [{ ...entry, team_id: 'other' }];
    if (reason === 'organisation') data.rotaEntries = [{ ...entry, organisation_id: 'other' }];
    if (reason === 'cancelled') data.rotaEntries = [{ ...entry, status: 'cancelled' }];
    if (reason === 'archived') data.teams = [{ ...team, archived_at: '2026-09-01' }];
    if (reason === 'membership') auth.user = { ...member, memberships: [] };
    const screen = render(<SelectSongsScreen />);
    expect(screen.queryByLabelText('Save praise songs')).toBeNull();
    expect(screen.queryByText(song.title)).toBeNull();
    expect(data.setSongSelections).not.toHaveBeenCalled();
  });
  it.each(['loading', 'error', 'missing'])('distinguishes a %s date from section denial', (state) => {
    data.rotaEntries = []; data.rotasLoading = state === 'loading'; data.rotasError = state === 'error' ? 'Offline.' : null;
    const screen = render(<SelectSongsScreen />);
    expect(screen.getByText(state === 'loading' ? 'Loading this date…' : state === 'error' ? "Couldn't load this date" : 'Date unavailable')).toBeTruthy();
    expect(screen.queryByText('No permission')).toBeNull();
    if (state === 'error') { fireEvent.press(screen.getByLabelText('Retry rota')); expect(data.refreshRotas).toHaveBeenCalledTimes(1); }
  });
  it('waits for cold song selections, retries errors, then hydrates their stored order', () => {
    data.songs = []; data.songSelections = []; data.songsLoading = true;
    const screen = render(<SelectSongsScreen />);
    expect(screen.getByText('Loading song choices…')).toBeTruthy();
    expect(screen.getByLabelText('Save praise songs').props.accessibilityState.disabled).toBe(true);
    data = { ...data, songsLoading: false, songsError: 'Offline.' }; screen.rerender(<SelectSongsScreen />);
    expect(screen.getByText("Couldn't load song choices")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry songs'));
    data = { ...data, songsLoading: false, songsError: null, songs: [song, secondSong, thirdSong], songSelections: [
      ...selections, { ...selections[0], id: 'second', song_id: secondSong.id, order_index: -1 },
    ] }; screen.rerender(<SelectSongsScreen />);
    order(screen);
    expect(screen.getByText('1. Beta song')).toBeTruthy();
    expect(screen.getByText('2. Alpha song')).toBeTruthy();
  });
  it('saves selected IDs in explicit order through the unchanged action', async () => {
    const screen = render(<SelectSongsScreen />);
    const other = screen.getByRole('checkbox', { name: 'Gamma song. Already selected for worship' });
    expect(other.props.accessibilityState.disabled).toBe(true);
    expect(screen.UNSAFE_root.findAll((node: { props: { accessibilityLabel?: string; 'aria-disabled'?: boolean } }) => node.props.accessibilityLabel === 'Gamma song. Already selected for worship' && node.props['aria-disabled'] === true)).toHaveLength(1);
    fireEvent.press(other);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
    expect(screen.UNSAFE_root.findAll((node: { props: { accessibilityLabel?: string; 'aria-checked'?: boolean } }) => node.props.accessibilityLabel === 'Beta song' && node.props['aria-checked'] === true)).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Choose songs' }).props.accessibilityState.selected).toBe(true);
    order(screen);
    fireEvent.press(screen.getByLabelText('Move Beta song up'));
    expect(screen.getByText('1. Beta song')).toBeTruthy();
    expect(screen.getByText('2. Alpha song')).toBeTruthy();
    expect(screen.getByLabelText('Move Beta song up').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('Save praise songs'));
    await waitFor(() => expect(data.setSongSelections).toHaveBeenCalledWith(entry.id, 'praise', [secondSong.id, song.id], profile.id));
    expect(data.setSongSelections).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Praise songs saved.'));
    // Notes retain the existing action's replace semantics; no new note writer.
    expect((data.setSongSelections as jest.Mock).mock.calls[0]).toHaveLength(4);
  });
  it('can remove all songs and explicitly save the empty section', async () => {
    const screen = render(<SelectSongsScreen />);
    order(screen);
    fireEvent.press(screen.getByLabelText('Remove Alpha song from praise songs'));
    expect(screen.getByText('No praise songs selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose songs' })).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save praise songs'));
    await waitFor(() => expect(data.setSongSelections).toHaveBeenCalledWith(entry.id, 'praise', [], profile.id));
  });
  it('retains search and choices across segments without automatically leaving Choose', () => {
    const screen = render(<SelectSongsScreen />);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
    fireEvent.changeText(screen.getByLabelText('Search songs'), 'unknown');
    expect(screen.getByText('No matching songs')).toBeTruthy();
    expect(screen.queryByText('1. Alpha song')).toBeNull();
    order(screen);
    expect(screen.getByText('1. Alpha song')).toBeTruthy();
    expect(screen.getByText('2. Beta song')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Choose songs' }));
    expect(screen.getByDisplayValue('unknown')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByRole('checkbox', { name: 'Beta song' }).props.accessibilityState.checked).toBe(true);
  });
  it('keeps a single virtualized surface for long selections and libraries with a reachable footer', () => {
    data.songs = Array.from({ length: 160 }, (_, i) => ({ ...song, id: 'long-' + i, title: 'Long song ' + String(i).padStart(3, '0') }));
    data.songSelections = data.songs.slice(0, 80).map((item, index) => ({ ...selections[0], id: 'selection-' + index, song_id: item.id, order_index: index }));
    const screen = render(<SelectSongsScreen />);
    expect(screen.queryAllByRole('checkbox').length).toBeLessThan(160);
    order(screen);
    expect(screen.queryAllByText(/^\d+\. Long song/).length).toBeLessThan(80);
    expect(screen.queryByText('80. Long song 079')).toBeNull();
    expect(screen.UNSAFE_getByType(Screen).props.scroll).toBe(false);
    expect(screen.UNSAFE_getByType(Screen).props.footer).toBeTruthy();
    expect(screen.getByLabelText('Save praise songs')).toBeTruthy();
  });
  it('retains unsaved choices and order through same-profile checking and fresh selections', async () => {
    auth.authMode = 'supabase';
    const screen = render(<SelectSongsScreen />);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
    order(screen);
    fireEvent.press(screen.getByLabelText('Move Beta song up'));
    auth.accountStatus = 'loading';
    data = { ...data, teams: [], rotaEntries: [], songs: [], songSelections: [] }; screen.rerender(<SelectSongsScreen />);
    expect(screen.getByText('Checking your access…')).toBeTruthy();
    auth.accountStatus = 'ready';
    data = { ...data, teams: [team], rotaEntries: [entry], songs: [song, secondSong, thirdSong], songSelections: selections };
    screen.rerender(<SelectSongsScreen />);
    expect(screen.getByText('1. Beta song')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save praise songs'));
    await waitFor(() => expect(data.setSongSelections).toHaveBeenCalledWith(entry.id, 'praise', [secondSong.id, song.id], profile.id));
  });
  it.each(['deleted', 'other-section', 'foreign-song'])('shows a %s conflict without silently dropping a draft choice', async (reason) => {
    const screen = render(<SelectSongsScreen />);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
    if (reason === 'deleted') data.songs = data.songs.filter((item) => item.id !== secondSong.id);
    if (reason === 'foreign-song') data.songs = data.songs.map((item) => item.id === secondSong.id ? { ...item, organisation_id: 'other' } : item);
    if (reason === 'other-section') data.songSelections = [...selections, { ...selections[1], id: 'conflict', song_id: secondSong.id }];
    screen.rerender(<SelectSongsScreen />);
    expect(screen.getByRole('tab', { name: 'Song order (2)' })).toBeTruthy();
    expect(screen.getByLabelText('Save praise songs').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('Review song order before saving'));
    fireEvent.press(screen.getByLabelText(reason === 'other-section' ? 'Remove Beta song from praise songs' : 'Remove Song unavailable from praise songs'));
    fireEvent.press(screen.getByLabelText('Save praise songs'));
    await waitFor(() => expect(data.setSongSelections).toHaveBeenCalledWith(entry.id, 'praise', [song.id], profile.id));
  });
  it('retains the order after a save failure and allows an explicit retry', async () => {
    (data.setSongSelections as jest.Mock).mockRejectedValueOnce(new Error('Please retry.'));
    const screen = render(<SelectSongsScreen />);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
    order(screen);
    fireEvent.press(screen.getByLabelText('Move Beta song up'));
    fireEvent.press(screen.getByLabelText('Save praise songs'));
    expect(await screen.findByText('Please retry.')).toBeTruthy();
    expect(screen.getByText('1. Beta song')).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Save praise songs'));
    await waitFor(() => expect(data.setSongSelections).toHaveBeenCalledTimes(2));
    expect((data.setSongSelections as jest.Mock).mock.calls[1][2]).toEqual([secondSong.id, song.id]);
  });
  it.each(['role', 'profile', 'cancelled', 'archived'])('tears down the draft and fences callbacks after %s loss', async (reason) => {
    const screen = render(<SelectSongsScreen />);
    const save = buttonAction(screen, 'Save praise songs');
    const toggle = rowAction(screen, 'Beta song');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
    if (reason === 'role') data.rotaAssignments = [];
    if (reason === 'profile') auth.user = { ...member, profile: singer };
    if (reason === 'cancelled') data.rotaEntries = [{ ...entry, status: 'cancelled' }];
    if (reason === 'archived') data.teams = [{ ...team, archived_at: '2026-09-01' }];
    screen.rerender(<SelectSongsScreen />);
    await act(async () => { toggle(); save(); });
    expect(data.setSongSelections).not.toHaveBeenCalled();
    expect(screen.queryByText('2. Beta song')).toBeNull();
    data = { ...data, teams: [team], rotaEntries: [entry], rotaAssignments: assignments }; auth.user = member;
    screen.rerender(<SelectSongsScreen />);
    expect(screen.getByRole('tab', { name: 'Song order (1)' })).toBeTruthy();
  });
  it('blocks duplicate saves and shows a known success through a readiness check', async () => {
    const pending = deferred<void>(); (data.setSongSelections as jest.Mock).mockReturnValue(pending.promise);
    auth.authMode = 'supabase';
    const screen = render(<SelectSongsScreen />); const save = buttonAction(screen, 'Save praise songs');
    fireEvent.press(screen.getByLabelText('Save praise songs'));
    act(() => save());
    expect(data.setSongSelections).toHaveBeenCalledTimes(1);
    auth.accountStatus = 'loading'; screen.rerender(<SelectSongsScreen />);
    await act(async () => pending.resolve());
    expect(screen.getByText('Praise songs saved')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    act(() => save());
    expect(data.setSongSelections).toHaveBeenCalledTimes(1);
    auth.accountStatus = 'ready'; screen.rerender(<SelectSongsScreen />);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('ignores a late save completion after section authority loss', async () => {
    const pending = deferred<void>(); (data.setSongSelections as jest.Mock).mockReturnValue(pending.promise);
    const screen = render(<SelectSongsScreen />); fireEvent.press(screen.getByLabelText('Save praise songs'));
    data.rotaAssignments = []; screen.rerender(<SelectSongsScreen />);
    await act(async () => pending.resolve());
    expect(mockToast).not.toHaveBeenCalled(); expect(mockBack).not.toHaveBeenCalled();
  });
  it('returns a direct selection route to its owning date without saving', () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = render(<SelectSongsScreen />); fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: entry.id } });
    expect(data.setSongSelections).not.toHaveBeenCalled();
  });
});

it.each(['add', 'remove', 'reorder'])('confirms Cancel after a song selection %s and keeps the order when dismissed', async (change) => {
  mockDiscardConfirm.mockResolvedValue(false);
  if (change === 'reorder') data.songSelections = [...selections, { ...selections[0], id: 'second', song_id: secondSong.id, order_index: 1 }];
  const screen = render(<SelectSongsScreen />);
  if (change === 'add') fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
  else {
    order(screen);
    fireEvent.press(screen.getByLabelText(change === 'remove' ? 'Remove Alpha song from praise songs' : 'Move Beta song up'));
  }
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(mockDiscardConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your song choices and order will not be saved.' }));
  expect(mockBack).not.toHaveBeenCalled();
  expect(data.setSongSelections).not.toHaveBeenCalled();
  expect(screen.getByRole('tab', { name: change === 'remove' ? 'Song order (0)' : 'Song order (2)' })).toBeTruthy();
  mockDiscardConfirm.mockResolvedValue(true);
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('ignores search and segment changes and a reverted song choice when cancelling', () => {
  const screen = render(<SelectSongsScreen />);
  fireEvent.changeText(screen.getByLabelText('Search songs'), 'Alpha');
  order(screen);
  fireEvent.press(screen.getByLabelText('Remove Alpha song from praise songs'));
  fireEvent.press(screen.getByRole('tab', { name: 'Choose songs' }));
  fireEvent.press(screen.getByRole('checkbox', { name: 'Alpha song' }));
  fireEvent.press(screen.getByLabelText('Cancel'));
  expect(mockDiscardConfirm).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('keeps a refreshed selection draft until discard is confirmed, without navigating after profile replacement', async () => {
  const pending = deferred<boolean>(); mockDiscardConfirm.mockReturnValue(pending.promise);
  const screen = render(<SelectSongsScreen />);
  fireEvent.press(screen.getByRole('checkbox', { name: 'Beta song' }));
  data = { ...data, songSelections: [] }; screen.rerender(<SelectSongsScreen />);
  fireEvent.press(screen.getByLabelText('Cancel'));
  auth.user = { ...member, profile: singer }; screen.rerender(<SelectSongsScreen />);
  await act(async () => pending.resolve(true));
  expect(mockBack).not.toHaveBeenCalled();
  expect(data.setSongSelections).not.toHaveBeenCalled();
});
