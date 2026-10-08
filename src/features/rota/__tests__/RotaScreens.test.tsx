import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';

import { ActionSheet } from '../../../components/ActionSheet';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { AvailabilityResponse, Song } from '../../../types';
import RotaDetailScreen from '../RotaDetailScreen';
import RotaFormScreen from '../RotaFormScreen';
import RotaListScreen from '../RotaListScreen';
import { admin, assignments, deferred, entry, makeData, member, profile, singer, team } from './rotaFixtures';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
let mockParams: { teamId: string; entryId?: string } = { teamId: 'choir' };
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
let auth: { user: typeof admin; authMode: string; isLoading: boolean; accountStatus: string };
const response: AvailabilityResponse = { id: 'answer', rota_assignment_id: 'role-2', user_id: profile.id, status: 'maybe', note: 'Need to leave early.', updated_at: '' };
const song: Song = { id: 'song-1', organisation_id: 'church-1', team_id: 'choir', title: 'A song for Sunday', artist: 'The choir', lyrics: 'Words',
  notes: null, tags: [], links: [], added_by: profile.id, created_at: '', updated_at: '' };

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 1, 12) });
  jest.clearAllMocks();
  mockParams = { teamId: team.id };
  mockCanGoBack.mockReturnValue(true);
  mockConfirm.mockResolvedValue(false);
  data = makeData();
  auth = { user: admin, authMode: 'demo', isLoading: false, accountStatus: 'ready' };
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockImplementation(() => auth);
});
afterEach(() => { jest.useRealTimers(); });

function openDetail() {
  mockParams.entryId = entry.id;
  return render(<RotaDetailScreen />);
}
function openForm(editing = true) {
  if (editing) mockParams.entryId = entry.id;
  return render(<RotaFormScreen />);
}
function manage(screen: ReturnType<typeof render>, name: string) {
  fireEvent.press(screen.getByLabelText('Manage this date'));
  fireEvent.press(screen.getByRole('button', { name: new RegExp('^' + name) }));
}
function choose(screen: ReturnType<typeof render>, label: RegExp, option: string) {
  fireEvent.press(screen.getByLabelText(label));
  fireEvent.press(screen.getByRole('radio', { name: option }));
}
function editDates(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByLabelText('Manage rota'));
  fireEvent.press(screen.getByRole('button', { name: /^Edit dates/ }));
}
function editDateCallback(screen: ReturnType<typeof render>): () => void {
  return screen.UNSAFE_root.findAll((row: { props: { accessibilityLabel?: string; onPress?: unknown } }) => row.props.accessibilityLabel?.startsWith('Edit Sunday morning service') === true
    && typeof row.props.onPress === 'function')[0].props.onPress;
}

describe('team rota list', () => {
  it('groups a person’s roles and uses the existing first responded status', () => {
    auth.user = member;
    data.availabilityResponses = [response];
    const screen = render(<RotaListScreen />);
    const row = screen.getByRole('button', { name: /Sunday morning service.*Praise Leader & Worship Leader.*Your response: Maybe/s });
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: entry.id } });
    expect(screen.queryByLabelText('Manage rota')).toBeNull();
  });
  it('retains cancelled upcoming dates and discloses past history', () => {
    data.rotaEntries = [{ ...entry, status: 'cancelled' }, { ...entry, id: 'past', date: '2026-09-13', title: 'Past rehearsal', status: 'cancelled' }];
    const screen = render(<RotaListScreen />);
    expect(screen.getByRole('button', { name: /Sunday morning service.*Cancelled/s })).toBeTruthy();
    expect(screen.queryByText('Response needed')).toBeNull();
    expect(screen.queryByText('Past rehearsal')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^Past dates/ }));
    expect(screen.getByRole('button', { name: /Past rehearsal.*Cancelled/s })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Past dates/ }).props.accessibilityState.expanded).toBe(true);
  });
  it('exposes creation and choir planning through labelled Manage', () => {
    const screen = render(<RotaListScreen />);
    fireEvent.press(screen.getByLabelText('Manage rota'));
    fireEvent.press(screen.getByRole('button', { name: /^Plan the month/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/plan-month', params: { teamId: team.id } });
  });
  it('renders a bounded initial window for a long rota instead of mounting every date', () => {
    data.rotaEntries = Array.from({ length: 160 }, (_, index) => ({ ...entry, id: `date-${index}`, title: `Serving date ${index + 1}` }));
    const screen = render(<RotaListScreen />);
    expect(screen.getByText('Serving date 1')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Serving date/ }).length).toBeLessThan(160);
    expect(screen.queryByText('Serving date 160')).toBeNull();
  });
  it('uses singular person and song copy', () => {
    data.rotaAssignments = [assignments[2]];
    data.songSelections = [{ id: 'selection', rota_entry_id: entry.id, song_id: song.id, section: 'praise', order_index: 0, selected_by: profile.id, notes: null }];
    const screen = render(<RotaListScreen />);
    expect(screen.getByRole('button', { name: /1 person serving.*1 song selected/s })).toBeTruthy();
  });
  it('opens edits from the same list only after choosing Edit dates, and Done restores reading', () => {
    const screen = render(<RotaListScreen />);
    expect(screen.UNSAFE_getByType(Stack.Screen).props.options.title).toBe('Rota');
    expect(screen.UNSAFE_getByType(Screen).props.footer).toBeUndefined();
    fireEvent.press(screen.getByRole('button', { name: /^Sunday morning service/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: entry.id } });
    editDates(screen);
    expect(screen.UNSAFE_getByType(Stack.Screen).props.options.title).toBe('Edit dates');
    expect(screen.UNSAFE_getByType(Screen).props.footer.props.title).toBe('Done');
    expect(screen.getAllByLabelText('Done')).toHaveLength(1);
    expect(screen.getByText('Choose a date below to edit its details or people. Select Done to return to reading the rota.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Edit Sunday morning service/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teams/[teamId]/rota/edit', params: { teamId: team.id, entryId: entry.id } });
    fireEvent.press(screen.getByLabelText('Done'));
    fireEvent.press(screen.getByRole('button', { name: /^Sunday morning service/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: entry.id } });
    expect(screen.queryByLabelText('Done')).toBeNull();
    expect(screen.UNSAFE_getByType(Stack.Screen).props.options.title).toBe('Rota');
    expect(screen.UNSAFE_getByType(Screen).props.footer).toBeUndefined();
  });
  it('retains Edit dates through same-profile checking while rejecting navigation until ready', () => {
    auth.authMode = 'supabase';
    const screen = render(<RotaListScreen />);
    editDates(screen);
    const open = editDateCallback(screen);
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<RotaListScreen />);
    act(() => open());
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Checking your access…')).toBeTruthy();
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<RotaListScreen />);
    expect(screen.getByLabelText('Done')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Edit Sunday morning service/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/edit', params: { teamId: team.id, entryId: entry.id } });
  });
  it('rejects entering edit mode from a stale Manage choice while authority is unresolved', () => {
    auth.authMode = 'supabase';
    const screen = render(<RotaListScreen />);
    fireEvent.press(screen.getByLabelText('Manage rota'));
    const start = screen.UNSAFE_getByType(ActionSheet).props.actions.find((action: { key: string }) => action.key === 'edit')!.onPress;
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<RotaListScreen />);
    act(() => start());
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<RotaListScreen />);
    expect(screen.queryByLabelText('Done')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it.each(['profile', 'role'])('resets Edit dates and rejects old row callbacks after %s loss', (change) => {
    const screen = render(<RotaListScreen />);
    editDates(screen);
    const open = editDateCallback(screen);
    auth = { ...auth, user: change === 'role' ? member : { ...admin, profile: singer } };
    screen.rerender(<RotaListScreen />);
    act(() => open());
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Done')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^Sunday morning service/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: entry.id } });
    if (change === 'role') expect(screen.queryByLabelText('Manage rota')).toBeNull();
  });
  it('shows a cached-date refresh failure with retry without losing the list', () => {
    data.rotasError = 'Connection unavailable.';
    const screen = render(<RotaListScreen />);
    expect(screen.getByText('Sunday morning service')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Retry rota' }));
    expect(data.refreshRotas).toHaveBeenCalledTimes(1);
  });
  it.each(['loading', 'error', 'empty'])('distinguishes %s without dates', (state) => {
    data.rotaEntries = [];
    data.rotasLoading = state === 'loading';
    data.rotasError = state === 'error' ? 'Offline.' : null;
    const screen = render(<RotaListScreen />);
    expect(screen.getByText(state === 'loading' ? 'Loading the rota…' : state === 'error' ? "Couldn't load the rota" : 'No upcoming dates')).toBeTruthy();
  });
  it.each(['archived', 'foreign', 'denied'])('rejects %s team access with a safe exit', (reason) => {
    if (reason === 'archived') data.teams = [{ ...team, archived_at: '2026-09-01' }];
    if (reason === 'foreign') data.teams = [{ ...team, organisation_id: 'other' }];
    if (reason === 'denied') auth.user = { ...member, memberships: [] };
    const screen = render(<RotaListScreen />);
    expect(screen.queryByText('Sunday morning service')).toBeNull();
    fireEvent.press(screen.getByLabelText('Back to teams'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });
});

describe('rota date form', () => {
  it('keeps completed name and role rows compact and only opens one editor', () => {
    const screen = openForm();
    expect(screen.getByLabelText('Edit person 1: Sarah Williams, Praise Leader')).toBeTruthy();
    expect(screen.getByLabelText('Edit person 2: Sarah Williams, Worship Leader')).toBeTruthy();
    expect(screen.queryByLabelText(/^Person 1:/)).toBeNull();
    fireEvent.press(screen.getByLabelText(/^Edit person 1:/));
    expect(screen.getByLabelText('Person 1: Sarah Williams')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Edit person 2:/));
    expect(screen.queryByLabelText(/^Person 1:/)).toBeNull();
    expect(screen.getByLabelText('Role for person 2: Worship Leader')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Done editing person 2'));
    expect(screen.queryByLabelText(/^Person 2:/)).toBeNull();
  });
  it('opens new rows and reveals an incomplete row again when validation fails', () => {
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Add person or role'));
    expect(screen.getByLabelText('Person 4: Choose a team member')).toBeTruthy();
    choose(screen, /^Role for person 4:/, 'Backup Vocal');
    fireEvent.press(screen.getByLabelText(/^Edit person 1:/));
    expect(screen.queryByLabelText(/^Person 4:/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Save changes'));
    act(() => jest.advanceTimersByTime(50));
    expect(data.updateRotaEntry).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Person 4: Choose a team member')).toBeTruthy();
    expect(screen.getByLabelText('Role for person 4: Backup Vocal')).toBeTruthy();
    expect(screen.queryByLabelText(/^Person 1:/)).toBeNull();
    expect(screen.getAllByText('Choose both a person and a role for person 4.').length).toBeGreaterThan(0);
  });
  it('opens a completed duplicate row for correction when validation fails', () => {
    data.rotaAssignments = [...assignments, { ...assignments[0], id: 'duplicate' }];
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Save changes'));
    act(() => jest.advanceTimersByTime(50));
    expect(data.updateRotaEntry).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Person 4: Sarah Williams')).toBeTruthy();
    expect(screen.getByLabelText('Role for person 4: Praise Leader')).toBeTruthy();
    expect(screen.getAllByText('This person already has this role. Choose a different role or remove the extra row.').length).toBeGreaterThan(0);
  });
  it('keeps edited row values when a preceding row is removed and sends only person-role pairs', async () => {
    const screen = openForm();
    fireEvent.press(screen.getByLabelText(/^Edit person 2:/));
    choose(screen, /^Person 2:/, singer.full_name);
    fireEvent.press(screen.getByLabelText(/^Edit person 1:/));
    fireEvent.press(screen.getByLabelText(/^Remove person 1:/));
    fireEvent.press(screen.getByLabelText('Edit person 1: Hannah Adeyemi, Worship Leader'));
    expect(screen.getByLabelText('Person 1: Hannah Adeyemi')).toBeTruthy();
    expect(screen.getByLabelText('Role for person 1: Worship Leader')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(data.updateRotaEntry).toHaveBeenCalledWith(entry.id, expect.anything(), [
      { user_id: singer.id, role_name: 'Worship Leader' }, { user_id: singer.id, role_name: 'Choir Member' },
    ]));
  });
  it('keeps saved notes collapsed until requested, without repeating the note above the field', () => {
    const screen = openForm();
    expect(screen.getByText('Notes added')).toBeTruthy();
    expect(screen.queryByDisplayValue(entry.notes!)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^Notes \(optional\)/ }));
    expect(screen.getByDisplayValue(entry.notes!)).toBeTruthy();
    expect(screen.queryByText('Notes added')).toBeNull();
    expect(screen.getAllByDisplayValue(entry.notes!)).toHaveLength(1);
  });
  it('waits for a cold edit then hydrates exactly once', async () => {
    data.rotaEntries = []; data.rotasLoading = true;
    const screen = openForm();
    expect(screen.getByText('Loading this date…')).toBeTruthy();
    expect(screen.queryByLabelText('Save date')).toBeNull();
    data = makeData();
    screen.rerender(<RotaFormScreen />);
    expect(await screen.findByDisplayValue(entry.title)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Title / service name'), 'My unfinished edit');
    data = { ...data, rotaEntries: [{ ...entry, title: 'Refreshed title' }] };
    screen.rerender(<RotaFormScreen />);
    expect(screen.getByDisplayValue('My unfinished edit')).toBeTruthy();
    expect(screen.queryByDisplayValue('Refreshed title')).toBeNull();
  });
  it('distinguishes failed and missing edits and never changes them into creation', () => {
    data.rotaEntries = []; data.rotasError = 'Read failed.';
    const screen = openForm();
    expect(screen.getByText("Couldn't load this date")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry rota'));
    expect(data.refreshRotas).toHaveBeenCalledTimes(1);
    data = { ...data, rotasError: null };
    screen.rerender(<RotaFormScreen />);
    expect(screen.getByText('Date unavailable')).toBeTruthy();
    expect(screen.queryByLabelText('Save date')).toBeNull();
  });
  it('rejects a child from another team or church even for an admin', () => {
    data.rotaEntries = [{ ...entry, team_id: 'media' }];
    const screen = openForm();
    expect(screen.getByText('Date unavailable')).toBeTruthy();
    data.rotaEntries = [{ ...entry, organisation_id: 'other' }];
    screen.rerender(<RotaFormScreen />);
    expect(screen.getByText('Date unavailable')).toBeTruthy();
    expect(data.addRotaEntry).not.toHaveBeenCalled();
  });
  it('retains the draft across same-profile authority checking and preserves the original author', async () => {
    const screen = openForm();
    fireEvent.changeText(screen.getByLabelText('Title / service name'), 'Retained draft');
    auth = { ...auth, authMode: 'supabase', accountStatus: 'ready' };
    // Establish live scope before making the live draft.
    screen.rerender(<RotaFormScreen />);
    fireEvent.changeText(screen.getByLabelText('Title / service name'), 'Retained live draft');
    auth = { ...auth, accountStatus: 'loading' };
    screen.rerender(<RotaFormScreen />);
    expect(screen.getByText('Checking your access…')).toBeTruthy();
    auth = { ...auth, accountStatus: 'ready' };
    screen.rerender(<RotaFormScreen />);
    expect(screen.getByDisplayValue('Retained live draft')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(data.updateRotaEntry).toHaveBeenCalledWith(entry.id, expect.objectContaining({ title: 'Retained live draft', created_by: singer.id, time: '09:17' }),
      assignments.map(({ user_id, role_name }) => ({ user_id, role_name })));
  });
  it('retains an assigned person outside membership and the legacy Song Leader role', () => {
    data.memberships = [];
    data.rotaAssignments = [{ ...assignments[0], role_name: 'Song Leader' }];
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Edit person 1: Sarah Williams, Song Leader'));
    expect(screen.getByLabelText('Person 1: Sarah Williams (currently assigned)')).toBeTruthy();
    expect(screen.getByLabelText('Role for person 1: Song Leader')).toBeTruthy();
  });
  it('pairs people and roles in the payload and rejects a missing counterpart', async () => {
    data.rotaAssignments = [];
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Add person or role'));
    choose(screen, /^Person 1:/, singer.full_name);
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(data.updateRotaEntry).not.toHaveBeenCalled();
    expect(screen.getAllByText('Choose both a person and a role for person 1.').length).toBeGreaterThan(0);
    choose(screen, /^Role for person 1:/, 'Praise Leader');
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(data.updateRotaEntry).toHaveBeenCalledWith(entry.id, expect.anything(), [{ user_id: singer.id, role_name: 'Praise Leader' }]));
  });
  it('adds only missing choir people without replacing existing leadership or adding duplicates', async () => {
    data.rotaAssignments = assignments.slice(0, 2);
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Add all choir members'));
    fireEvent.press(screen.getByLabelText('Add all choir members'));
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(data.updateRotaEntry).toHaveBeenCalledTimes(1));
    expect((data.updateRotaEntry as jest.Mock).mock.calls[0][2]).toEqual(assignments.map(({ user_id, role_name }) => ({ user_id, role_name })));
  });
  it('shows required fields after an empty create without making a write', () => {
    const screen = openForm(false);
    fireEvent.press(screen.getByLabelText('Save date'));
    expect(screen.getAllByText('Add a title for this date.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Choose a date.').length).toBeGreaterThan(0);
    expect(data.addRotaEntry).not.toHaveBeenCalled();
  });
  it('keeps failed drafts and enables an explicit retry', async () => {
    (data.updateRotaEntry as jest.Mock).mockRejectedValueOnce(new Error('Please try again.'));
    const screen = openForm();
    fireEvent.changeText(screen.getByLabelText('Title / service name'), 'Still here');
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText('Please try again.')).toBeTruthy();
    expect(screen.getByDisplayValue('Still here')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });
  it('keeps a known save visible through an authority refresh, then leaves exactly once', async () => {
    const pending = deferred<void>();
    (data.updateRotaEntry as jest.Mock).mockReturnValue(pending.promise);
    auth = { ...auth, authMode: 'supabase' };
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Save changes'));
    auth = { ...auth, accountStatus: 'loading' };
    screen.rerender(<RotaFormScreen />);
    await act(async () => pending.resolve());
    expect(screen.getByText('Changes saved')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    auth = { ...auth, accountStatus: 'ready' };
    screen.rerender(<RotaFormScreen />);
    expect(mockBack).toHaveBeenCalledTimes(1);
    screen.rerender(<RotaFormScreen />);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('Close after saving fences a later readiness result before actual unmount', async () => {
    const pending = deferred<void>();
    (data.updateRotaEntry as jest.Mock).mockReturnValue(pending.promise);
    auth = { ...auth, authMode: 'supabase' };
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Save changes'));
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<RotaFormScreen />);
    await act(async () => pending.resolve());
    fireEvent.press(screen.getByLabelText('Close'));
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<RotaFormScreen />);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });
  it('fences a save completion after profile change', async () => {
    const pending = deferred<void>();
    (data.updateRotaEntry as jest.Mock).mockReturnValue(pending.promise);
    const screen = openForm();
    fireEvent.press(screen.getByLabelText('Save changes'));
    auth = { ...auth, user: { ...admin, profile: singer } }; screen.rerender(<RotaFormScreen />);
    await act(async () => pending.resolve());
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
  it('returns directly opened forms to the owning rota or date', () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = openForm(false);
    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
  });
});

describe('rota detail and own availability', () => {
  it('only summarizes nonzero counts while retaining every person’s status', () => {
    const screen = openDetail();
    expect(screen.getByText('2 not responded')).toBeTruthy();
    expect(screen.queryByText('0 available')).toBeNull();
    expect(screen.queryByText('0 maybe')).toBeNull();
    expect(screen.queryByText('0 unavailable')).toBeNull();
    expect(screen.getAllByText('Not responded')).toHaveLength(3);
  });
  it('leads with all own roles, current saved response and note', () => {
    auth.user = member; data.availabilityResponses = [response];
    const screen = openDetail();
    expect(screen.getAllByText('Praise Leader & Worship Leader')).toHaveLength(2);
    expect(screen.getByText('Your note: Need to leave early.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Change availability'));
    expect(screen.getByRole('radio', { name: 'Maybe' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByDisplayValue('Need to leave early.')).toBeTruthy();
  });
  it('writes one optional-note response to every own role, never another person’s role', async () => {
    auth.user = member;
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    fireEvent.press(screen.getByRole('radio', { name: 'Available' }));
    fireEvent.press(screen.getByLabelText('Save response'));
    await waitFor(() => expect(data.setAvailability).toHaveBeenCalledTimes(2));
    expect(data.setAvailability).toHaveBeenNthCalledWith(1, 'role-1', profile.id, 'available', null);
    expect(data.setAvailability).toHaveBeenNthCalledWith(2, 'role-2', profile.id, 'available', null);
    expect(mockToast).toHaveBeenCalledWith('Availability saved.');
  });
  it('trims a note, retains it after failure, and reports a partially written multi-role response', async () => {
    (data.setAvailability as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Please retry.'));
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    fireEvent.press(screen.getByRole('radio', { name: 'Maybe' }));
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), '  I may arrive late.  ');
    fireEvent.press(screen.getByLabelText('Save response'));
    expect(await screen.findByText('1 of 2 roles saved. Please retry.')).toBeTruthy();
    expect(screen.getByDisplayValue('  I may arrive late.  ')).toBeTruthy();
    expect(data.setAvailability).toHaveBeenNthCalledWith(1, 'role-1', profile.id, 'maybe', 'I may arrive late.');
    expect(mockToast).not.toHaveBeenCalled();
  });
  it('dismisses a draft response without writing', () => {
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    fireEvent.press(screen.getByRole('radio', { name: 'Unavailable' }));
    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(data.setAvailability).not.toHaveBeenCalled();
  });
  it('closes a pending response sheet while the one save completes and stays visible on the date', async () => {
    const pending = deferred<void>();
    (data.setAvailability as jest.Mock).mockReturnValueOnce(pending.promise);
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    fireEvent.press(screen.getByRole('radio', { name: 'Available' }));
    fireEvent.press(screen.getByLabelText('Save response'));
    fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByLabelText('Note (optional)')).toBeNull();
    const mainAction = screen.getByLabelText('Saving response…');
    expect(mainAction.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(mainAction);
    expect(data.setAvailability).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    expect(data.setAvailability).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Availability saved.')).toBeTruthy();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });
  it('keeps the submitted choice and note for review when a closed sheet fails, with no automatic retry', async () => {
    const pending = deferred<void>();
    (data.setAvailability as jest.Mock).mockReturnValueOnce(pending.promise);
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    fireEvent.press(screen.getByRole('radio', { name: 'Maybe' }));
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), '  Please keep my draft.  ');
    fireEvent.press(screen.getByLabelText('Save response'));
    fireEvent.press(screen.getByLabelText('Close'));
    await act(async () => pending.reject(new Error('The response could not be saved.')));
    expect(screen.getByText('Response needs attention')).toBeTruthy();
    expect(screen.getByText('The response could not be saved.')).toBeTruthy();
    expect(data.setAvailability).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Review response'));
    expect(screen.getByDisplayValue('  Please keep my draft.  ')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Maybe' }).props.accessibilityState.checked).toBe(true);
    expect(data.setAvailability).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Save response'));
    await waitFor(() => expect(data.setAvailability).toHaveBeenCalledTimes(3));
    expect(data.setAvailability).toHaveBeenNthCalledWith(2, 'role-1', profile.id, 'maybe', 'Please keep my draft.');
    expect(mockToast).toHaveBeenCalledWith('Availability saved.');
  });
  it('only assigned people respond, while an admin’s retained assignment still works without membership', () => {
    data.rotaAssignments = [assignments[2]];
    const screen = openDetail();
    expect(screen.queryByLabelText('Confirm availability')).toBeNull();
    auth = { ...auth, user: { ...admin, memberships: [] } };
    data.rotaAssignments = assignments;
    screen.rerender(<RotaDetailScreen />);
    expect(screen.getByLabelText('Confirm availability')).toBeTruthy();
  });
  it('keeps a response draft across same-profile access checking', () => {
    auth = { ...auth, authMode: 'supabase' };
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    fireEvent.press(screen.getByRole('radio', { name: 'Maybe' }));
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Keep this note');
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<RotaDetailScreen />);
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<RotaDetailScreen />);
    expect(screen.getByDisplayValue('Keep this note')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Maybe' }).props.accessibilityState.checked).toBe(true);
  });
  it('stops later role writes after cancellation or assignment change', async () => {
    const pending = deferred<void>();
    (data.setAvailability as jest.Mock).mockReturnValueOnce(pending.promise);
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    fireEvent.press(screen.getByRole('radio', { name: 'Available' }));
    fireEvent.press(screen.getByLabelText('Save response'));
    data = { ...data, rotaEntries: [{ ...entry, status: 'cancelled' }] };
    screen.rerender(<RotaDetailScreen />);
    await act(async () => pending.resolve());
    expect(data.setAvailability).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Save response')).toBeNull();
  });
  it('rejects cross-team and cross-church child IDs', () => {
    data.rotaEntries = [{ ...entry, team_id: 'other' }];
    const screen = openDetail();
    expect(screen.getByText('Date unavailable')).toBeTruthy();
    expect(screen.queryByLabelText('Manage this date')).toBeNull();
    data.rotaEntries = [{ ...entry, organisation_id: 'other' }];
    screen.rerender(<RotaDetailScreen />);
    expect(screen.getByText('Date unavailable')).toBeTruthy();
  });
});

describe('date management and choir section links', () => {
  it('confirms cancellation separately from the optional announcement draft', async () => {
    mockConfirm.mockResolvedValue(false);
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    expect(screen.getByText('Cancel this date?')).toBeTruthy();
    expect(screen.getByText('This reason appears on the team rota.')).toBeTruthy();
    expect(screen.getByLabelText('Keep date')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel')).toBeNull();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(data.cancelRotaEntry).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Cancel date'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(data.cancelRotaEntry).toHaveBeenCalledWith(entry.id, profile.id, null);
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({ title: 'Write an announcement?', cancelLabel: 'Not now', destructive: false, message: expect.stringContaining('Post announcement') });
    expect(mockPush).not.toHaveBeenCalled();
  });
  it.each(['  The building is unavailable.  ', ''])('only opens a factual announcement draft with the submitted reason after the separate choice: %s', async (reason) => {
    mockConfirm.mockResolvedValue(true);
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    fireEvent.changeText(screen.getByLabelText('Reason (optional)'), reason);
    fireEvent.press(screen.getByLabelText('Cancel date'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/announcements/edit', params: expect.objectContaining({ teamId: team.id, presetTitle: 'Cancelled: Sunday morning service', presetBody: expect.stringContaining('has been cancelled') }) });
    const body = mockPush.mock.calls[0][0].params.presetBody;
    expect(body).not.toMatch(/next one|inconvenience|notification|push/i);
    if (reason.trim()) expect(body).toContain('\n\nReason: The building is unavailable.');
    else expect(body).not.toContain('Reason:');
    expect(data.addRotaEntry).not.toHaveBeenCalled();
  });
  it('keeps the date without writing or offering an announcement when Keep date is chosen', () => {
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    const submit = screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Cancel date')!.props.onPress;
    fireEvent.changeText(screen.getByLabelText('Reason (optional)'), 'A reason that is not submitted');
    fireEvent.press(screen.getByLabelText('Keep date'));
    act(() => submit());
    expect(screen.queryByLabelText('Reason (optional)')).toBeNull();
    expect(data.cancelRotaEntry).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });
  it.each([
    ['  The building is unavailable.  ', 'The building is unavailable.'],
    ['   ', null],
  ])('passes the optional cancellation reason through the existing action: %s', async (draftReason, savedReason) => {
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    fireEvent.changeText(screen.getByLabelText('Reason (optional)'), draftReason!);
    fireEvent.press(screen.getByLabelText('Cancel date'));
    await waitFor(() => expect(data.cancelRotaEntry).toHaveBeenCalledWith(entry.id, profile.id, savedReason));
  });
  it('retains a failed cancellation reason for an explicit retry, including after closing the sheet', async () => {
    (data.cancelRotaEntry as jest.Mock).mockRejectedValueOnce(new Error('The date could not be cancelled.'));
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    fireEvent.changeText(screen.getByLabelText('Reason (optional)'), '  Please keep this explanation.  ');
    fireEvent.press(screen.getByLabelText('Cancel date'));
    expect(await screen.findByText('The date could not be cancelled.')).toBeTruthy();
    expect(screen.getByDisplayValue('  Please keep this explanation.  ')).toBeTruthy();
    expect(mockConfirm).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Close'));
    manage(screen, 'Cancel this date');
    expect(screen.getByDisplayValue('  Please keep this explanation.  ')).toBeTruthy();
    expect(data.cancelRotaEntry).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Cancel date'));
    await waitFor(() => expect(data.cancelRotaEntry).toHaveBeenCalledTimes(2));
    expect(data.cancelRotaEntry).toHaveBeenLastCalledWith(entry.id, profile.id, 'Please keep this explanation.');
  });
  it('submits a pending cancellation only once and disables changing the reason or choosing Keep date', async () => {
    const pending = deferred<void>();
    (data.cancelRotaEntry as jest.Mock).mockReturnValue(pending.promise);
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    fireEvent.press(screen.getByLabelText('Cancel date'));
    fireEvent.press(screen.getByLabelText('Cancel date'));
    expect(data.cancelRotaEntry).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Reason (optional)').props.editable).toBe(false);
    expect(screen.getByLabelText('Keep date').props.accessibilityState.disabled).toBe(true);
    await act(async () => pending.resolve());
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });
  it('rejects a stale cancellation submit after the date is cancelled elsewhere', () => {
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    const submit = screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Cancel date')!.props.onPress;
    data = { ...data, rotaEntries: [{ ...entry, status: 'cancelled' }] };
    screen.rerender(<RotaDetailScreen />);
    act(() => submit());
    expect(screen.queryByLabelText('Reason (optional)')).toBeNull();
    expect(data.cancelRotaEntry).not.toHaveBeenCalled();
  });
  it('keeps cancellation explanation and history, permits restore, and disables participation', async () => {
    data.rotaEntries = [{ ...entry, status: 'cancelled', cancellation_reason: 'Building unavailable', cancelled_by: singer.id }];
    mockConfirm.mockResolvedValue(true);
    const screen = openDetail();
    expect(screen.getByText(/Building unavailable/)).toBeTruthy();
    expect(screen.getByText('Who was expected')).toBeTruthy();
    expect(screen.queryByLabelText('Confirm availability')).toBeNull();
    expect(screen.queryByLabelText('Choose praise songs')).toBeNull();
    expect(screen.getByText('No songs were selected for this date.')).toBeTruthy();
    expect(screen.queryByText('Praise songs')).toBeNull();
    expect(screen.queryByText('Worship songs')).toBeNull();
    manage(screen, 'Restore this date');
    await waitFor(() => expect(data.restoreRotaEntry).toHaveBeenCalledWith(entry.id));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0].destructive).toBe(false);
  });
  it('confirms deletion and returns direct links to the team rota', async () => {
    mockCanGoBack.mockReturnValue(false); mockConfirm.mockResolvedValue(true);
    const screen = openDetail();
    manage(screen, 'Delete this date');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } }));
    expect(data.deleteRotaEntry).toHaveBeenCalledWith(entry.id);
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({ title: 'Delete this date?', destructive: true, message: expect.stringContaining('cannot be undone') });
  });
  it('shows an action failure without losing the date', async () => {
    mockConfirm.mockResolvedValue(true);
    (data.restoreRotaEntry as jest.Mock).mockRejectedValue(new Error('Could not restore.'));
    data.rotaEntries = [{ ...entry, status: 'cancelled' }];
    const screen = openDetail();
    manage(screen, 'Restore this date');
    expect(await screen.findByText('Could not restore.')).toBeTruthy();
    expect(screen.getByText(entry.title)).toBeTruthy();
  });
  it('fences an open cancellation confirmation when team authority is lost', () => {
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    const submit = screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Cancel date')!.props.onPress;
    auth = { ...auth, user: member }; screen.rerender(<RotaDetailScreen />);
    act(() => submit());
    expect(data.cancelRotaEntry).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Manage this date')).toBeNull();
  });
  it('preserves the reason through readiness checking but refuses a submit while authority is unresolved', async () => {
    auth = { ...auth, authMode: 'supabase' };
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    fireEvent.changeText(screen.getByLabelText('Reason (optional)'), 'Keep this reason during checking');
    const submit = screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Cancel date')!.props.onPress;
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<RotaDetailScreen />);
    act(() => submit());
    expect(data.cancelRotaEntry).not.toHaveBeenCalled();
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<RotaDetailScreen />);
    expect(screen.getByDisplayValue('Keep this reason during checking')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Cancel date'));
    await waitFor(() => expect(data.cancelRotaEntry).toHaveBeenCalledWith(entry.id, profile.id, 'Keep this reason during checking'));
  });
  it('suppresses a stale cancellation result and announcement offer after a profile switch', async () => {
    const pending = deferred<void>();
    (data.cancelRotaEntry as jest.Mock).mockReturnValue(pending.promise);
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    fireEvent.press(screen.getByLabelText('Cancel date'));
    auth = { ...auth, user: { ...admin, profile: singer } }; screen.rerender(<RotaDetailScreen />);
    await act(async () => pending.resolve());
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('preserves a successful cancellation through checking, and Close suppresses the later draft offer', async () => {
    const pending = deferred<void>();
    (data.cancelRotaEntry as jest.Mock).mockReturnValue(pending.promise);
    mockConfirm.mockResolvedValue(true); auth = { ...auth, authMode: 'supabase' };
    const screen = openDetail();
    manage(screen, 'Cancel this date');
    fireEvent.press(screen.getByLabelText('Cancel date'));
    await waitFor(() => expect(data.cancelRotaEntry).toHaveBeenCalledTimes(1));
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<RotaDetailScreen />);
    await act(async () => pending.resolve());
    expect(screen.getByText('Date cancelled')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close'));
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<RotaDetailScreen />);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['Praise Leader', true, false], ['Worship Leader', false, true], ['Song Leader', true, true], ['Choir Member', false, false],
  ])('keeps section authority for %s', (roleName, praise, worship) => {
    auth.user = member;
    data.rotaAssignments = [{ ...assignments[0], role_name: String(roleName) }];
    const screen = openDetail();
    expect(!!screen.queryByLabelText('Choose praise songs')).toBe(praise);
    expect(!!screen.queryByLabelText('Choose worship songs')).toBe(worship);
  });
  it('lets team admins override both song sections and opens the exact section route', () => {
    auth.user = { ...admin, orgRole: 'general_member' };
    data.rotaAssignments = [];
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Choose worship songs'));
    expect(screen.getByLabelText('Choose praise songs')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]/select-songs', params: { teamId: team.id, entryId: entry.id, section: 'worship' } });
  });
  it('keeps selected songs readable on cancellation and rejects mismatched song children', () => {
    data.rotaEntries = [{ ...entry, status: 'cancelled' }];
    data.songs = [song];
    data.songSelections = [{ id: 'selection', rota_entry_id: entry.id, song_id: song.id, section: 'praise', order_index: 0, selected_by: profile.id, notes: null }];
    const screen = openDetail();
    fireEvent.press(screen.getByLabelText('Open A song for Sunday'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/songs/[songId]', params: { teamId: team.id, songId: song.id } });
    data.songs = [{ ...song, team_id: 'other' }]; screen.rerender(<RotaDetailScreen />);
    expect(screen.queryByLabelText('Open A song for Sunday')).toBeNull();
  });
});
