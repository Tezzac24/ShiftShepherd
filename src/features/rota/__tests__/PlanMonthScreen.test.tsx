import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { RotaEntry } from '../../../types';
import { fullScheduleDate } from '../../calendar/ScheduleRows';
import PlanMonthScreen from '../PlanMonthScreen';
import { admin, deferred, entry, makeData, member, memberships, profile, singer, team } from './rotaFixtures';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null }, useLocalSearchParams: () => ({ teamId: 'choir' }),
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const mockConfirm = jest.fn();
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));
const mockToast = jest.fn();
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

type BatchItem = Parameters<ReturnType<typeof useAppData>['addRotaEntries']>[0][number];
let data: ReturnType<typeof useAppData>;
let auth: { user: typeof admin; authMode: string; isLoading: boolean; accountStatus: string };
function createdItems(items: BatchItem[]): RotaEntry[] {
  return items.map((item, index) => ({ ...entry, ...item.input, id: 'created-' + index }));
}
function createButton(screen: ReturnType<typeof render>) { return screen.getByLabelText(/^Create \d+ dates?$/); }
function choose(screen: ReturnType<typeof render>, label: RegExp, option: string) {
  fireEvent.press(screen.getByLabelText(label));
  fireEvent.press(screen.getByRole('radio', { name: option }));
}
const firstDate = fullScheduleDate(new Date(2026, 10, 1));
const secondDate = fullScheduleDate(new Date(2026, 10, 8));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 1, 12) });
  jest.clearAllMocks(); mockCanGoBack.mockReturnValue(true); mockConfirm.mockResolvedValue(true);
  auth = { user: admin, authMode: 'demo', isLoading: false, accountStatus: 'ready' };
  data = makeData({ rotaEntries: [], addRotaEntries: jest.fn(async (items: BatchItem[]) => ({ created: createdItems(items), error: null, live: false })) });
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockImplementation(() => auth);
});
afterEach(() => jest.useRealTimers());

describe('Plan the month', () => {
  it('offers the current and next three months, defaulting to next month', () => {
    const screen = render(<PlanMonthScreen />);
    expect(screen.getByLabelText('Month: November 2026')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Month: November 2026'));
    expect(screen.getAllByRole('radio').map((option) => option.props.accessibilityLabel)).toEqual(['October 2026', 'November 2026', 'December 2026', 'January 2027']);
  });
  it('creates every Sunday through exactly one ordered batch, then closes', async () => {
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(data.addRotaEntries).toHaveBeenCalledTimes(1); expect(data.addRotaEntry).not.toHaveBeenCalled();
    const items: BatchItem[] = (data.addRotaEntries as jest.Mock).mock.calls[0][0];
    expect(items.map((item) => item.input.date)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
    expect(items.every((item) => item.input.title === 'Sunday Morning Service' && item.input.time === '09:15' && item.assignments.length === 0)).toBe(true);
    expect(mockToast).toHaveBeenCalledWith('5 dates created.');
  });
  it('includes weekly rehearsals for every choir member in the same ordered batch', async () => {
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(screen.getByRole('switch', { name: /^Weekly rehearsal/ }));
    expect(screen.getByRole('switch', { name: /^Weekly rehearsal/ }).props.accessibilityState.checked).toBe(true);
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(data.addRotaEntries).toHaveBeenCalledTimes(1));
    const items: BatchItem[] = (data.addRotaEntries as jest.Mock).mock.calls[0][0];
    expect(items.filter((item) => item.input.title === 'Choir Rehearsal')).toHaveLength(4);
    for (const rehearsal of items.filter((item) => item.input.title === 'Choir Rehearsal')) {
      expect(rehearsal.input.time).toBe('17:00');
      expect(rehearsal.assignments).toHaveLength(memberships.length);
      expect(rehearsal.assignments).toEqual(expect.arrayContaining(memberships.map(({ user_id }) => ({ user_id, role_name: 'Choir Member' }))));
    }
    expect(items.map((item) => item.input.date)).toEqual([...items.map((item) => item.input.date)].sort());
  });
  it('uses defaults, permits one person in both sections, and applies individual-date overrides only to that date', async () => {
    const screen = render(<PlanMonthScreen />);
    choose(screen, /^Usual praise leader:/, profile.full_name);
    choose(screen, /^Usual worship leader:/, profile.full_name);
    fireEvent.press(screen.getByLabelText('Change people for ' + secondDate));
    choose(screen, /^Praise leader ·/, singer.full_name);
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(data.addRotaEntries).toHaveBeenCalledTimes(1));
    const items: BatchItem[] = (data.addRotaEntries as jest.Mock).mock.calls[0][0];
    expect(items[0].assignments).toEqual([{ user_id: profile.id, role_name: 'Praise Leader' }, { user_id: profile.id, role_name: 'Worship Leader' }]);
    expect(items[1].assignments).toEqual([{ user_id: singer.id, role_name: 'Praise Leader' }, { user_id: profile.id, role_name: 'Worship Leader' }]);
    expect(items[2].assignments).toEqual(items[0].assignments);
  });
  it('can return an individual date to the usual people', async () => {
    const screen = render(<PlanMonthScreen />);
    choose(screen, /^Usual praise leader:/, profile.full_name);
    fireEvent.press(screen.getByLabelText('Change people for ' + secondDate));
    choose(screen, /^Praise leader ·/, singer.full_name);
    fireEvent.press(screen.getByLabelText('Use usual people'));
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(data.addRotaEntries).toHaveBeenCalledTimes(1));
    const items: BatchItem[] = (data.addRotaEntries as jest.Mock).mock.calls[0][0];
    expect(items[1].assignments).toEqual([{ user_id: profile.id, role_name: 'Praise Leader' }]);
  });
  it('excludes existing dates, including cancellations, and requires a deliberate include for duplicates', async () => {
    data.rotaEntries = [{ ...entry, status: 'cancelled' }];
    const screen = render(<PlanMonthScreen />);
    expect(screen.getByLabelText('Create 4 dates')).toBeTruthy();
    const dateSwitch = screen.getByRole('switch', { name: new RegExp('^' + firstDate) });
    expect(dateSwitch.props.accessibilityState.checked).toBe(false);
    fireEvent.press(dateSwitch);
    expect(screen.getByText('Another entry will be created for this date.')).toBeTruthy();
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(data.addRotaEntries).toHaveBeenCalledTimes(1));
    expect(mockConfirm.mock.calls[0][0].message).toContain('deliberately included 1 date already on the rota');
    expect((data.addRotaEntries as jest.Mock).mock.calls[0][0]).toHaveLength(5);
  });
  it('honours a manually excluded date', async () => {
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(screen.getByRole('switch', { name: new RegExp('^' + firstDate) }));
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(data.addRotaEntries).toHaveBeenCalledTimes(1));
    expect((data.addRotaEntries as jest.Mock).mock.calls[0][0].map((item: BatchItem) => item.input.date)).not.toContain('2026-11-01');
  });
  it('shows a partial result with its exact created prefix and no repeat submission', async () => {
    (data.addRotaEntries as jest.Mock).mockImplementation(async (items: BatchItem[]) => ({
      created: createdItems(items.slice(0, 2)), error: new Error('Please check your connection.'), live: false,
    }));
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    expect(await screen.findByText('2 of 5 dates created')).toBeTruthy();
    expect(screen.getByText('Please check your connection.')).toBeTruthy();
    expect(screen.getByText(team.name)).toBeTruthy();
    expect(screen.getByText(firstDate)).toBeTruthy(); expect(screen.getByText(secondDate)).toBeTruthy();
    expect(screen.queryByLabelText(/^Create/)).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('View rota'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
    expect(data.addRotaEntries).toHaveBeenCalledTimes(1);
  });
  it('describes one saved date and one remaining date accurately after a partial batch', async () => {
    data.rotaEntries = ['2026-11-15', '2026-11-22', '2026-11-29'].map((date) => ({ ...entry, id: date, date }));
    (data.addRotaEntries as jest.Mock).mockImplementation(async (items: BatchItem[]) => ({
      created: createdItems(items.slice(0, 1)), error: new Error('Please check your connection.'), live: false,
    }));
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    expect(await screen.findByText('1 of 2 dates created')).toBeTruthy();
    expect(screen.getByText('The saved date is already on the rota. Check it before creating the remaining date.')).toBeTruthy();
    expect(screen.getByText('Date created')).toBeTruthy();
    expect(screen.getByText(team.name)).toBeTruthy();
    expect(screen.queryByLabelText(/^Create/)).toBeNull();
  });
  it('keeps singular successful result copy and team context through an access refresh', async () => {
    const pending = deferred<{ created: RotaEntry[]; error: null; live: boolean }>();
    (data.addRotaEntries as jest.Mock).mockReturnValue(pending.promise);
    data.rotaEntries = ['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'].map((date) => ({ ...entry, id: date, date }));
    auth.authMode = 'supabase';
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(screen.getByLabelText('Create 1 date'));
    await waitFor(() => expect(data.addRotaEntries).toHaveBeenCalledTimes(1));
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({ title: 'Create 1 date?', confirmLabel: 'Create date' });
    auth = { ...auth, accountStatus: 'loading' };
    data = { ...data, teams: [], teamsLoading: true };
    screen.rerender(<PlanMonthScreen />);
    const items = (data.addRotaEntries as jest.Mock).mock.calls[0][0] as BatchItem[];
    await act(async () => pending.resolve({ created: createdItems(items), error: null, live: true }));
    expect(screen.getByText('1 date created')).toBeTruthy();
    expect(screen.getByText('Your date is saved on the team rota.')).toBeTruthy();
    expect(screen.getByText('Date created')).toBeTruthy();
    expect(screen.getByText(team.name)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('retains the plan for a deliberate retry after a known zero-save failure', async () => {
    (data.addRotaEntries as jest.Mock).mockResolvedValueOnce({ created: [], error: new Error('Nothing was created. Please retry.'), live: false });
    const screen = render(<PlanMonthScreen />);
    choose(screen, /^Usual praise leader:/, singer.full_name);
    fireEvent.press(createButton(screen));
    expect(await screen.findByText('Nothing was created. Please retry.')).toBeTruthy();
    expect(screen.getByLabelText('Usual praise leader: Hannah Adeyemi')).toBeTruthy();
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(data.addRotaEntries).toHaveBeenCalledTimes(2);
  });
  it('does not claim zero saves or offer a blind retry if the action throws without a result', async () => {
    (data.addRotaEntries as jest.Mock).mockRejectedValue(new Error('Unexpected interruption'));
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    expect(await screen.findByText('Could not confirm the result')).toBeTruthy();
    expect(screen.queryByLabelText(/^Create/)).toBeNull();
    expect(screen.getByLabelText('View rota')).toBeTruthy();
  });
  it('creates nothing when confirmation is declined', async () => {
    mockConfirm.mockResolvedValue(false);
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(data.addRotaEntries).not.toHaveBeenCalled();
  });
  it('prevents duplicate submissions while confirmation is pending', async () => {
    const pending = deferred<boolean>(); mockConfirm.mockReturnValue(pending.promise);
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen)); fireEvent.press(createButton(screen));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(true));
    expect(data.addRotaEntries).toHaveBeenCalledTimes(1);
  });
  it('requires at least one included date', () => {
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(screen.getByRole('switch', { name: /^Sunday services/ }));
    fireEvent.press(screen.getByLabelText('Create dates'));
    expect(screen.getAllByText('Include at least one date. Turn on Sunday services or rehearsals, then check the dates below.')).toHaveLength(2);
    expect(mockConfirm).not.toHaveBeenCalled();
  });
  it('retains defaults and overrides across a same-profile authority check', () => {
    auth.authMode = 'supabase';
    const screen = render(<PlanMonthScreen />);
    choose(screen, /^Usual praise leader:/, singer.full_name);
    fireEvent.press(screen.getByRole('switch', { name: new RegExp('^' + firstDate) }));
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<PlanMonthScreen />);
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<PlanMonthScreen />);
    expect(screen.getByLabelText('Usual praise leader: Hannah Adeyemi')).toBeTruthy();
    expect(screen.getByLabelText('Create 4 dates')).toBeTruthy();
  });
  it('refuses a stale confirmation after another date or membership arrives', async () => {
    const pending = deferred<boolean>(); mockConfirm.mockReturnValue(pending.promise);
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    data = { ...data, rotaEntries: [entry] }; screen.rerender(<PlanMonthScreen />);
    await act(async () => pending.resolve(true));
    expect(data.addRotaEntries).not.toHaveBeenCalled();
    expect(screen.getByText('The team or dates changed while you were reviewing. Check the plan before creating it.')).toBeTruthy();
  });
  it('fences a pending confirmation after actual scope loss', async () => {
    const pending = deferred<boolean>(); mockConfirm.mockReturnValue(pending.promise);
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    auth = { ...auth, user: member }; screen.rerender(<PlanMonthScreen />);
    await act(async () => pending.resolve(true));
    expect(data.addRotaEntries).not.toHaveBeenCalled();
  });
  it('keeps a known result while authority resolves and closes without creating again', async () => {
    const pending = deferred<{ created: RotaEntry[]; error: null; live: boolean }>();
    (data.addRotaEntries as jest.Mock).mockReturnValue(pending.promise);
    auth.authMode = 'supabase';
    const screen = render(<PlanMonthScreen />);
    fireEvent.press(createButton(screen));
    await waitFor(() => expect(data.addRotaEntries).toHaveBeenCalledTimes(1));
    auth = { ...auth, accountStatus: 'loading' }; screen.rerender(<PlanMonthScreen />);
    const items = (data.addRotaEntries as jest.Mock).mock.calls[0][0] as BatchItem[];
    await act(async () => pending.resolve({ created: createdItems(items), error: null, live: true }));
    expect(screen.getByText('5 dates created')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Close'));
    auth = { ...auth, accountStatus: 'ready' }; screen.rerender(<PlanMonthScreen />);
    expect(mockBack).toHaveBeenCalledTimes(1); expect(mockToast).not.toHaveBeenCalled();
    expect(data.addRotaEntries).toHaveBeenCalledTimes(1);
  });
  it('rejects non-choir teams and ordinary members', () => {
    data.teams = [{ ...team, type: 'generic' }];
    const screen = render(<PlanMonthScreen />);
    expect(screen.queryByLabelText(/^Create/)).toBeNull();
    data.teams = [team]; auth.user = member;
    screen.rerender(<PlanMonthScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
  });
  it('distinguishes a failed existing-date read from an empty month', () => {
    data.rotasError = 'Could not read dates.';
    const screen = render(<PlanMonthScreen />);
    expect(screen.getByText("Couldn't check existing dates")).toBeTruthy();
    expect(screen.queryByLabelText(/^Create/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Retry rota'));
    expect(data.refreshRotas).toHaveBeenCalledTimes(1);
  });
});

it('keeps a changed month pattern when discard is dismissed and skips a reverted pattern', async () => {
  mockConfirm.mockResolvedValue(false);
  const screen = render(<PlanMonthScreen />);
  fireEvent.press(screen.getByRole('switch', { name: /Weekly rehearsal/ }));
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your month plan, date choices and people will not be saved.' }));
  expect(mockBack).not.toHaveBeenCalled(); expect(data.addRotaEntries).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('switch', { name: /Weekly rehearsal/ }));
  fireEvent.press(screen.getByLabelText('Cancel'));
  expect(mockConfirm).toHaveBeenCalledTimes(1); expect(mockBack).toHaveBeenCalledTimes(1);
});
