import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { parseDateKey } from '../../../utils/dates';
import { deferred, EVENT, makeAuth, makeData, PROFILE, TEAM } from '../../announcements/__tests__/noticeTestData';
import EventDetailScreen from '../EventDetailScreen';
import EventFormScreen from '../EventFormScreen';
import { buildEventTime, eventDetailTimes, eventDraft, eventTimeErrors, validateEventDraft } from '../eventPresentation';
import { fullScheduleDate } from '../ScheduleRows';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn(); const mockBack = jest.fn(); const mockReplace = jest.fn(); const mockCanGoBack = jest.fn(); const mockToast = jest.fn();
let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }) }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
let data: ReturnType<typeof makeData>; let auth: ReturnType<typeof makeAuth>;
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 8, 30, 12));
  data = makeData(); auth = makeAuth(); mockParams = {}; mockCanGoBack.mockReturnValue(true);
  (useAppData as jest.Mock).mockImplementation(() => data); (useAuth as jest.Mock).mockImplementation(() => auth);
  (useConfirm as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue(true));
});
afterEach(() => { jest.useRealTimers(); });
const more = (screen: ReturnType<typeof render>) => fireEvent.press(screen.getByRole('button', { name: /^More options\./ }));
const recurring = () => ({ ...EVENT, is_recurring: true, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1', recurrence_label: 'Weekly', recurrence_end_date: '2027-01-31' });

test('cold event edit waits for its own row and keeps an unsaved draft through data and readiness refresh', () => {
  mockParams = { id: EVENT.id }; data.events = []; data.eventsLoading = true;
  const screen = render(<EventFormScreen />);
  expect(screen.getByText('Loading event…')).toBeTruthy(); expect(screen.queryByLabelText('Create event')).toBeNull();
  data.eventsLoading = false; data.events = [EVENT]; screen.rerender(<EventFormScreen />);
  expect(screen.getByLabelText('Event title')).toHaveProp('value', EVENT.title);
  fireEvent.changeText(screen.getByLabelText('Event title'), 'Unsaved title');
  auth.accountStatus = 'loading'; screen.rerender(<EventFormScreen />);
  expect(screen.queryByLabelText('Event title')).toBeNull();
  auth.accountStatus = 'ready'; data.events = [{ ...EVENT, title: 'External refresh' }]; screen.rerender(<EventFormScreen />);
  expect(screen.getByLabelText('Event title')).toHaveProp('value', 'Unsaved title'); expect(data.addEvent).not.toHaveBeenCalled();
});

test('cold read failures remain retryable and missing event edits never become create forms', () => {
  mockParams = { id: EVENT.id }; data.events = []; data.eventsError = 'Offline';
  const screen = render(<EventFormScreen />);
  expect(screen.getByText("Couldn't load this event")).toBeTruthy(); fireEvent.press(screen.getByLabelText('Retry event'));
  expect(data.refreshEvents).toHaveBeenCalledTimes(1);
  data.eventsError = null; screen.rerender(<EventFormScreen />);
  expect(screen.getByText('Event unavailable')).toBeTruthy(); expect(screen.queryByLabelText('Create event')).toBeNull();
  fireEvent.press(screen.getByLabelText('Back to schedule')); expect(mockReplace).toHaveBeenCalledWith('/(tabs)/calendar');
});

test.each([['event-1', 'other'], ''])('invalid edit route never exposes creation: %j', (id) => {
  mockParams = { id }; const screen = render(<EventFormScreen />);
  expect(screen.getByText('Event unavailable')).toBeTruthy(); expect(screen.queryByLabelText('Create event')).toBeNull();
});

test('only church admins and event managers can use the form, including direct routes', () => {
  auth.user.orgRole = 'general_member';
  const screen = render(<EventFormScreen />);
  expect(screen.getByText('No permission')).toBeTruthy(); expect(screen.queryByLabelText('Event title')).toBeNull();
  auth.user.orgRole = 'announcement_manager'; screen.rerender(<EventFormScreen />);
  expect(screen.getByText('No permission')).toBeTruthy();
  auth.user.orgRole = 'event_manager'; screen.rerender(<EventFormScreen />);
  expect(screen.getByLabelText('Create event')).toBeTruthy();
});

test('unknown saved category and related team stay visibly retained without broadening chooser data', async () => {
  mockParams = { id: EVENT.id }; data.events = [{ ...EVENT, category_id: 'unknown-category', team_id: 'hidden-team' }];
  data.teams.push({ ...TEAM, id: 'other-church-team', organisation_id: 'other', name: 'Foreign team' });
  const screen = render(<EventFormScreen />); more(screen);
  expect(screen.getByRole('button', { name: 'Category: Current category (details unavailable)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Related team (optional): Current related team (details unavailable)' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: /^Related team \(optional\):/ }));
  expect(screen.queryByRole('radio', { name: 'Foreign team' })).toBeNull(); fireEvent.press(screen.getByLabelText('Close'));
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(data.updateEvent).toHaveBeenCalledWith(EVENT.id, expect.objectContaining({ category_id: 'unknown-category', team_id: 'hidden-team' })));
});

test('known archived related team blocks edit and delete while preserving readable event history', () => {
  mockParams = { id: EVENT.id }; data.events = [{ ...EVENT, team_id: TEAM.id }];
  data.archivedTeams = [{ ...TEAM, archived_at: '2026-09-30' }]; data.teams = [];
  const screen = render(<EventFormScreen />);
  expect(screen.getByText('Related team is archived')).toBeTruthy(); expect(screen.queryByLabelText('Save changes')).toBeNull();
  screen.unmount(); const detail = render(<EventDetailScreen />);
  expect(detail.getByText(EVENT.title)).toBeTruthy(); expect(detail.queryByLabelText('Manage event')).toBeNull();
});

test('required errors are visible and preserve completed lower-form fields without any write', () => {
  const screen = render(<EventFormScreen />);
  fireEvent.changeText(screen.getByLabelText('Location'), 'Saved draft location');
  fireEvent.press(screen.getByLabelText('Create event'));
  expect(screen.getByText('Please check these details')).toBeTruthy();
  expect(screen.getAllByText('Choose an end time.').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Location')).toHaveProp('value', 'Saved draft location');
  expect(data.addEvent).not.toHaveBeenCalled();
});

test('failed event save retains the draft and existing series end date, then retries the same update', async () => {
  mockParams = { id: EVENT.id }; data.events = [recurring()]; data.updateEvent.mockRejectedValueOnce(new Error('No connection.'));
  const screen = render(<EventFormScreen />);
  expect(screen.getByText('Editing the whole series')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Event title'), 'Updated series');
  fireEvent.press(screen.getByLabelText('Save changes'));
  expect(await screen.findByText('No connection.')).toBeTruthy();
  expect(screen.getByText('Couldn’t save changes')).toBeTruthy();
  expect(screen.getByLabelText('Event title')).toHaveProp('value', 'Updated series');
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(data.updateEvent).toHaveBeenLastCalledWith(EVENT.id, expect.objectContaining({ recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1', recurrence_end_date: '2027-01-31' }));
  expect(data.addEvent).not.toHaveBeenCalled();
});

test.each([
  ['Every 2 weeks', 'FREQ=WEEKLY;INTERVAL=2'],
  ['Monthly', 'FREQ=MONTHLY;INTERVAL=1'],
  ['Monthly on a weekday pattern', 'FREQ=MONTHLY;BYDAY=1SU'],
])('existing repeat choice %s preserves the series boundary', async (label, rule) => {
  mockParams = { id: EVENT.id }; data.events = [recurring()];
  const screen = render(<EventFormScreen />); more(screen);
  fireEvent.press(screen.getByRole('button', { name: /^Repeat type:/ }));
  fireEvent.press(screen.getByRole('radio', { name: new RegExp('^' + label + '\\.') }));
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(data.updateEvent).toHaveBeenCalledWith(EVENT.id, expect.objectContaining({ recurrence_rule: rule, recurrence_end_date: '2027-01-31' })));
});

test('turning repeat off clears recurrence rule, label and saved end date together', async () => {
  mockParams = { id: EVENT.id }; data.events = [recurring()];
  const screen = render(<EventFormScreen />); more(screen);
  fireEvent.press(screen.getByRole('switch', { checked: true })); fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(data.updateEvent).toHaveBeenCalledWith(EVENT.id, expect.objectContaining({ is_recurring: false, recurrence_rule: null, recurrence_label: null, recurrence_end_date: null })));
});

test('a normal create uses existing category/date/time controls and creates one base event', async () => {
  const screen = render(<EventFormScreen />);
  fireEvent.changeText(screen.getByLabelText('Event title'), '  New gathering  ');
  fireEvent.changeText(screen.getByLabelText('Location'), '  Main hall  ');
  fireEvent.press(screen.getByRole('button', { name: /^Category:/ })); fireEvent.press(screen.getByRole('radio', { name: 'Service' }));
  fireEvent.press(screen.getByRole('button', { name: /^Date:/ })); fireEvent.press(screen.getByLabelText('Next month'));
  fireEvent.press(screen.getByRole('button', { name: fullScheduleDate(parseDateKey('2026-10-04')) }));
  const timeLabel = (hour: number) => new Date(2026, 9, 4, hour).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  fireEvent.press(screen.getByRole('button', { name: /^Start time:/ })); fireEvent.press(screen.getByRole('radio', { name: timeLabel(6) }));
  fireEvent.press(screen.getByRole('button', { name: /^End time:/ })); fireEvent.press(screen.getByRole('radio', { name: timeLabel(7) }));
  fireEvent.press(screen.getByLabelText('Create event')); fireEvent.press(screen.getByLabelText('Create event'));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(data.addEvent).toHaveBeenCalledTimes(1);
  expect(data.addEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'New gathering', location: 'Main hall', start_time: new Date(2026, 9, 4, 6).toISOString(), end_time: new Date(2026, 9, 4, 7).toISOString(), team_id: null, is_recurring: false }));
});

test('cancel and successful direct edit retain occurrenceStart context', async () => {
  mockCanGoBack.mockReturnValue(false); mockParams = { id: EVENT.id, occurrenceStart: '2026-10-11T10:00:00Z' }; data.events = [recurring()];
  const screen = render(<EventFormScreen />);
  fireEvent.press(screen.getByLabelText('Cancel'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/events/[id]', params: mockParams });
  mockReplace.mockClear(); fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/events/[id]', params: mockParams }));
});

test('same-profile readiness refresh defers successful navigation and never repeats a save', async () => {
  mockCanGoBack.mockReturnValue(false);
  mockParams = { id: EVENT.id, occurrenceStart: '2026-10-11T10:00:00Z' };
  const pending = deferred<void>(); data.updateEvent.mockReturnValue(pending.promise);
  const screen = render(<EventFormScreen />); fireEvent.press(screen.getByLabelText('Save changes'));
  auth.accountStatus = 'loading'; screen.rerender(<EventFormScreen />);
  await act(async () => pending.resolve(undefined)); expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByText('Changes saved')).toBeTruthy();
  expect(screen.getByText('Your event is saved.')).toBeTruthy();
  expect(screen.getByText('Checking event permissions…')).toBeTruthy();
  expect(screen.getByLabelText('Close')).toBeTruthy();
  expect(screen.queryByLabelText('Cancel')).toBeNull();
  expect(screen.queryByLabelText('Save changes')).toBeNull();
  auth.accountStatus = 'ready'; screen.rerender(<EventFormScreen />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/events/[id]', params: mockParams });
  expect(data.updateEvent).toHaveBeenCalledTimes(1);
});

test('a saved event can close during readiness refresh without another save and retains the occurrence', async () => {
  mockCanGoBack.mockReturnValue(false);
  mockParams = { id: EVENT.id, occurrenceStart: '2026-10-11T10:00:00Z' };
  const pending = deferred<void>(); data.updateEvent.mockReturnValue(pending.promise);
  const screen = render(<EventFormScreen />); fireEvent.press(screen.getByLabelText('Save changes'));
  auth.accountStatus = 'loading'; screen.rerender(<EventFormScreen />);
  await act(async () => pending.resolve(undefined)); fireEvent.press(screen.getByLabelText('Close'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/events/[id]', params: mockParams });
  auth.accountStatus = 'ready'; screen.rerender(<EventFormScreen />);
  expect(mockReplace).toHaveBeenCalledTimes(1); expect(data.updateEvent).toHaveBeenCalledTimes(1); expect(mockToast).not.toHaveBeenCalled();
});

test.each(['profile', 'role'])('a known event result is cleared when the %s changes before readiness returns', async (boundary) => {
  mockParams = { id: EVENT.id }; const pending = deferred<void>(); data.updateEvent.mockReturnValue(pending.promise);
  const screen = render(<EventFormScreen />); fireEvent.press(screen.getByLabelText('Save changes'));
  auth.accountStatus = 'loading'; screen.rerender(<EventFormScreen />);
  await act(async () => pending.resolve(undefined)); expect(screen.getByText('Changes saved')).toBeTruthy();
  if (boundary === 'profile') auth.user = { ...auth.user, profile: { ...PROFILE, id: 'replacement' } };
  else auth.user = { ...auth.user, orgRole: 'general_member' };
  auth.accountStatus = 'ready'; screen.rerender(<EventFormScreen />);
  expect(screen.queryByText('Changes saved')).toBeNull();
  expect(mockBack).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled(); expect(data.updateEvent).toHaveBeenCalledTimes(1);
});

test('series end dates include their full local year in both detail and form', () => {
  mockParams = { id: EVENT.id, occurrenceStart: '2026-11-01T10:00:00Z' };
  data.events = [{ ...recurring(), recurrence_end_date: '2027-09-30' }];
  const endDate = 'This series ends on ' + fullScheduleDate(parseDateKey('2027-09-30')) + '.';
  expect(endDate).toContain('2027');
  const detail = render(<EventDetailScreen />);
  expect(detail.getByText(endDate)).toBeTruthy(); detail.unmount();
  const form = render(<EventFormScreen />); more(form);
  expect(form.getByText(endDate)).toBeTruthy();
});

test.each(['profile', 'role', 'route'])('a pending save result from an old %s is ignored', async (boundary) => {
  mockParams = { id: EVENT.id }; const pending = deferred<void>(); data.updateEvent.mockReturnValue(pending.promise);
  const screen = render(<EventFormScreen />); fireEvent.press(screen.getByLabelText('Save changes'));
  if (boundary === 'profile') auth.user = { ...auth.user, profile: { ...PROFILE, id: 'other-profile' } };
  if (boundary === 'role') auth.user = { ...auth.user, orgRole: 'general_member' };
  if (boundary === 'route') mockParams = { id: 'missing' };
  screen.rerender(<EventFormScreen />); await act(async () => pending.resolve(undefined));
  expect(mockBack).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled();
});

test('detail distinguishes failed/loading/missing and foreign-organisation data', () => {
  mockParams = { id: EVENT.id }; data.events = []; data.eventsLoading = true;
  const screen = render(<EventDetailScreen />); expect(screen.getByText('Loading event…')).toBeTruthy();
  data.eventsLoading = false; data.eventsError = 'Offline'; screen.rerender(<EventDetailScreen />);
  expect(screen.getByText("Couldn't load this event")).toBeTruthy(); fireEvent.press(screen.getByLabelText('Retry event'));
  expect(data.refreshEvents).toHaveBeenCalled(); data.eventsError = null; data.events = [{ ...EVENT, organisation_id: 'elsewhere' }];
  screen.rerender(<EventDetailScreen />); expect(screen.getByText('Event unavailable')).toBeTruthy();
  expect(screen.queryByText(EVENT.title)).toBeNull();
});

test('a member sees event details and descriptive team context without management', () => {
  mockParams = { id: EVENT.id }; auth.user.orgRole = 'general_member'; data.events = [{ ...EVENT, team_id: TEAM.id }];
  const screen = render(<EventDetailScreen />);
  expect(screen.getByText('Related team: ' + TEAM.name)).toBeTruthy(); expect(screen.queryByLabelText('Manage event')).toBeNull();
  data.teams = []; screen.rerender(<EventDetailScreen />); expect(screen.getByText(EVENT.title)).toBeTruthy();
  expect(screen.queryByText('Related team: ' + TEAM.name)).toBeNull();
});

test('occurrence detail recomputes the current series time and passes its route context into edit', () => {
  mockParams = { id: EVENT.id, occurrenceStart: new Date(2026, 9, 11, 9).toISOString() }; data.events = [recurring()];
  const screen = render(<EventDetailScreen />);
  expect(screen.getByText(fullScheduleDate(new Date(2026, 9, 11)))).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Manage event')); fireEvent.press(screen.getByLabelText('Edit series'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/edit', params: mockParams });
});

test('series deletion explains the whole-series consequence; cancel writes nothing and retry succeeds', async () => {
  mockParams = { id: EVENT.id }; data.events = [recurring()];
  const confirm = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true); (useConfirm as jest.Mock).mockReturnValue(confirm);
  const screen = render(<EventDetailScreen />);
  fireEvent.press(screen.getByLabelText('Manage event')); fireEvent.press(screen.getByLabelText('Delete series'));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete the whole series?', message: expect.stringContaining('All dates'), confirmLabel: 'Delete series' })));
  expect(data.deleteEvent).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByLabelText('Manage event')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: false })));
  data.deleteEvent.mockRejectedValueOnce(new Error('Not deleted.'));
  fireEvent.press(screen.getByLabelText('Manage event')); fireEvent.press(screen.getByLabelText('Delete series'));
  expect(await screen.findByText('Not deleted.')).toBeTruthy(); fireEvent.press(screen.getByLabelText('Try deleting again'));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});

test('delete confirmation cannot act after permission loss', async () => {
  mockParams = { id: EVENT.id }; const pending = deferred<boolean>(); (useConfirm as jest.Mock).mockReturnValue(() => pending.promise);
  const screen = render(<EventDetailScreen />); fireEvent.press(screen.getByLabelText('Manage event')); fireEvent.press(screen.getByLabelText('Delete event'));
  auth.user = { ...auth.user, orgRole: 'general_member' }; screen.rerender(<EventDetailScreen />);
  await act(async () => pending.resolve(true)); expect(data.deleteEvent).not.toHaveBeenCalled();
});

test('a changed past time is refused while an unchanged past start remains editable', () => {
  const past = { ...EVENT, start_time: new Date(2026, 8, 20, 10).toISOString(), end_time: new Date(2026, 8, 20, 12).toISOString() };
  const draft = eventDraft(past);
  expect(eventTimeErrors(draft, past)).toEqual({});
  expect(eventTimeErrors({ ...draft, startTime: '09:00' }, past).startTime).toMatch('already passed');
  expect(eventTimeErrors({ ...draft, endTime: '10:00' }, past).endTime).toMatch('after start');
  expect(buildEventTime(draft.dateKey!, draft.startTime!)).toBe(past.start_time);
});

test('a newly chosen team that disappears must be reselected; an original unresolved relation is retained', () => {
  const draft = { ...eventDraft(EVENT), teamId: 'gone' };
  expect(validateEventDraft(draft, EVENT, []).teamId).toMatch('active related team');
  expect(validateEventDraft(draft, { ...EVENT, team_id: 'gone' }, []).teamId).toBeUndefined();
});

test('invalid occurrence params retain base times and valid occurrence days use the current time', () => {
  const event = recurring();
  expect(eventDetailTimes(event, 'invalid').start.toISOString()).toBe(EVENT.start_time);
  const times = eventDetailTimes(event, new Date(2026, 9, 11, 8).toISOString());
  expect(times.start.getDate()).toBe(11); expect(times.start.getHours()).toBe(10); expect(times.end.getHours()).toBe(12);
});

test.each(['Event title', 'Location', 'Description (optional)'])('keeps event changes to %s when discard is dismissed', async (field) => {
  const confirm = jest.fn().mockResolvedValue(false); (useConfirm as jest.Mock).mockReturnValue(confirm);
  mockParams = { id: EVENT.id };
  const screen = render(<EventFormScreen />);
  fireEvent.changeText(screen.getByLabelText(field), 'My unsaved event');
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your event changes will not be saved.' }));
  expect(screen.getByDisplayValue('My unsaved event')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled(); expect(data.updateEvent).not.toHaveBeenCalled();
});
