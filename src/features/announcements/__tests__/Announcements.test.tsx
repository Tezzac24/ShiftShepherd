import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import AnnouncementDetailScreen from '../AnnouncementDetailScreen';
import AnnouncementsListScreen from '../AnnouncementsListScreen';
import { announcementEventOptions } from '../announcementPresentation';
import { deferred, EVENT, makeAuth, makeData, NOTICE, PROFILE, TEAM } from './noticeTestData';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
const mockToast = jest.fn();
let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }) }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

let data: ReturnType<typeof makeData>;
let auth: ReturnType<typeof makeAuth>;
beforeEach(() => {
  jest.clearAllMocks();
  data = makeData(); auth = makeAuth(); mockParams = {};
  mockCanGoBack.mockReturnValue(true);
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockImplementation(() => auth);
  (useRequiredUser as jest.Mock).mockImplementation(() => auth.user);
  (useConfirm as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue(true));
});

test('team filtering narrows visible same-church notices, preserves pin ordering and provides all-notices exit', () => {
  mockParams = { teamId: TEAM.id };
  data.announcements = [NOTICE, { ...NOTICE, id: 'team-note', title: 'Team notice', team_id: TEAM.id, audience: 'team' },
    { ...NOTICE, id: 'pin', title: 'Pinned team notice', pinned: true, team_id: TEAM.id, audience: 'team' },
    { ...NOTICE, id: 'other-org', title: 'Hidden church', organisation_id: 'elsewhere', team_id: TEAM.id }];
  const screen = render(<AnnouncementsListScreen />);
  expect(screen.queryByText(NOTICE.title)).toBeNull();
  expect(screen.queryByText('Hidden church')).toBeNull();
  const rows = screen.getAllByRole('button', { name: /^Announcement:/ });
  expect(rows[0].props.accessibilityLabel).toMatch('Pinned team notice');
  fireEvent.press(rows[1]);
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/announcements/[id]', params: { id: 'team-note' } });
  fireEvent.press(screen.getByLabelText('New announcement'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/announcements/edit', params: { teamId: TEAM.id } });
  fireEvent.press(screen.getByLabelText('All announcements'));
  expect(mockReplace).toHaveBeenCalledWith('/announcements');
});

test.each(['missing', ['team-1', 'elsewhere'], ''])('invalid team filter never falls back to a broader feed: %j', (teamId) => {
  mockParams = { teamId };
  const screen = render(<AnnouncementsListScreen />);
  expect(screen.getByText('Team announcements unavailable')).toBeTruthy();
  expect(screen.queryByText(NOTICE.title)).toBeNull();
  expect(screen.queryByLabelText('New announcement')).toBeNull();
});

test('inaccessible and archived team filters reveal no notices, even to an old direct route', () => {
  auth.user.orgRole = 'general_member'; mockParams = { teamId: TEAM.id };
  const screen = render(<AnnouncementsListScreen />);
  expect(screen.getByText('Team announcements unavailable')).toBeTruthy();
  auth.user.orgRole = 'church_admin';
  data.archivedTeams = [{ ...TEAM, archived_at: '2026-09-30' }]; data.teams = [];
  screen.rerender(<AnnouncementsListScreen />);
  expect(screen.getByText('Team announcements unavailable')).toBeTruthy();
});

test('a member sees church and own-team notices without create or inaccessible audience leakage', () => {
  auth.user.orgRole = 'general_member';
  auth.user.memberships = [{ id: 'membership', team_id: TEAM.id, user_id: PROFILE.id, role: 'member', created_at: '' }];
  data.announcements.push({ ...NOTICE, id: 'own', title: 'Own team', team_id: TEAM.id }, { ...NOTICE, id: 'other', title: 'Other team', team_id: 'other' });
  const screen = render(<AnnouncementsListScreen />);
  expect(screen.getByText('Own team')).toBeTruthy(); expect(screen.getByText(NOTICE.title)).toBeTruthy();
  expect(screen.queryByText('Other team')).toBeNull(); expect(screen.queryByLabelText('New announcement')).toBeNull();
});

test('list and detail distinguish loading, failure and missing data and retry their read', () => {
  data.announcements = []; data.announcementsLoading = true;
  const screen = render(<AnnouncementsListScreen />);
  expect(screen.getByRole('progressbar', { name: 'Loading announcements…' })).toBeTruthy();
  data.announcementsLoading = false; data.announcementsError = 'Offline';
  screen.rerender(<AnnouncementsListScreen />);
  expect(screen.queryByText('No announcements yet')).toBeNull();
  fireEvent.press(screen.getByLabelText('Retry announcements'));
  expect(data.refreshAnnouncements).toHaveBeenCalledTimes(1);
  screen.unmount(); mockParams = { id: NOTICE.id };
  const detail = render(<AnnouncementDetailScreen />);
  expect(detail.getByText("Couldn't load this announcement")).toBeTruthy();
  fireEvent.press(detail.getByLabelText('Retry announcement'));
  expect(data.refreshAnnouncements).toHaveBeenCalledTimes(2);
  data.announcementsError = null; detail.rerender(<AnnouncementDetailScreen />);
  expect(detail.getByText('Announcement unavailable')).toBeTruthy();
  fireEvent.press(detail.getByLabelText('All announcements'));
  expect(mockReplace).toHaveBeenCalledWith('/announcements');
});

test('detail denies cross-organisation and inaccessible-team IDs without exposing title or actions', () => {
  mockParams = { id: NOTICE.id }; data.announcements = [{ ...NOTICE, organisation_id: 'other' }];
  const screen = render(<AnnouncementDetailScreen />);
  expect(screen.queryByText(NOTICE.title)).toBeNull();
  data.announcements = [{ ...NOTICE, team_id: TEAM.id }]; auth.user.orgRole = 'general_member';
  screen.rerender(<AnnouncementDetailScreen />);
  expect(screen.getByText('Announcement unavailable')).toBeTruthy();
  expect(screen.queryByLabelText('Manage announcement')).toBeNull();
});

test('detail uses signed image resolver and links only current-church events', () => {
  mockParams = { id: NOTICE.id }; data.announcements = [{ ...NOTICE, linked_event_id: EVENT.id }];
  const screen = render(<AnnouncementDetailScreen />);
  expect(data.getAnnouncementImageUri).toHaveBeenCalledWith(data.announcements[0]);
  fireEvent.press(screen.getByRole('button', { name: new RegExp('^' + EVENT.title) }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/[id]', params: { id: EVENT.id } });
  data.events = [{ ...EVENT, organisation_id: 'other' }]; screen.rerender(<AnnouncementDetailScreen />);
  expect(screen.queryByText(EVENT.title)).toBeNull();
});

test('management is contextual; delete cancellation writes nothing and failure remains recoverable', async () => {
  mockParams = { id: NOTICE.id };
  const confirm = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  (useConfirm as jest.Mock).mockReturnValue(confirm);
  data.deleteAnnouncement.mockRejectedValue(new Error('Try again later.'));
  const screen = render(<AnnouncementDetailScreen />);
  expect(screen.queryByLabelText('Delete announcement')).toBeNull();
  fireEvent.press(screen.getByLabelText('Manage announcement'));
  fireEvent.press(screen.getByLabelText('Delete announcement'));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(data.deleteAnnouncement).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByLabelText('Manage announcement')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: false })));
  fireEvent.press(screen.getByLabelText('Manage announcement'));
  fireEvent.press(screen.getByLabelText('Delete announcement'));
  expect(await screen.findByText('Try again later.')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
  data.deleteAnnouncement.mockResolvedValue(undefined);
  fireEvent.press(screen.getByLabelText('Try deleting again'));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});

test('confirmation that resolves after role loss does not delete', async () => {
  mockParams = { id: NOTICE.id }; const pending = deferred<boolean>();
  (useConfirm as jest.Mock).mockReturnValue(() => pending.promise);
  const screen = render(<AnnouncementDetailScreen />);
  fireEvent.press(screen.getByLabelText('Manage announcement')); fireEvent.press(screen.getByLabelText('Delete announcement'));
  auth.user = { ...auth.user, orgRole: 'general_member' }; screen.rerender(<AnnouncementDetailScreen />);
  await act(async () => pending.resolve(true));
  expect(data.deleteAnnouncement).not.toHaveBeenCalled();
});

test('an old-scope delete result cannot navigate or toast in a replacement account', async () => {
  mockParams = { id: NOTICE.id }; const pending = deferred<void>(); data.deleteAnnouncement.mockReturnValue(pending.promise);
  const screen = render(<AnnouncementDetailScreen />);
  fireEvent.press(screen.getByLabelText('Manage announcement')); fireEvent.press(screen.getByLabelText('Delete announcement'));
  await waitFor(() => expect(data.deleteAnnouncement).toHaveBeenCalled());
  auth.user = { ...auth.user, profile: { ...PROFILE, id: 'new-profile' } }; screen.rerender(<AnnouncementDetailScreen />);
  await act(async () => pending.resolve(undefined));
  expect(mockBack).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled();
});

test('linked-event choices retain finished or unavailable selected links and omit foreign rows', () => {
  const past = { ...EVENT, start_time: '2000-01-01T10:00:00Z', end_time: '2000-01-01T12:00:00Z' };
  expect(announcementEventOptions([past], PROFILE.organisation_id, past.id)).toContainEqual(expect.objectContaining({ label: EVENT.title + ' (finished)', value: EVENT.id, description: expect.any(String) }));
  expect(announcementEventOptions([], PROFILE.organisation_id, EVENT.id)).toContainEqual(expect.objectContaining({ label: 'Current linked event (details unavailable)', value: EVENT.id }));
  expect(announcementEventOptions([{ ...EVENT, organisation_id: 'other' }], PROFILE.organisation_id, null)).toEqual([{ label: 'No linked event', value: 'none' }]);
});
