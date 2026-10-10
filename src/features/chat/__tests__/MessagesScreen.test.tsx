import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import MessagesScreen from '../MessagesScreen';
import { makeAuth, makeData, message, TEAM, USER } from './chatTestData';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => (() => void) | undefined) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
  },
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

let data: ReturnType<typeof makeData>;
let listeners: ((state: string) => void)[];
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  data = makeData();
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockReturnValue(makeAuth());
  (useRequiredUser as jest.Mock).mockReturnValue(USER);
  listeners = [];
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as never;
  });
});
afterEach(() => jest.restoreAllMocks());

it('offers conversation guidance only for a healthy small collection and never changes unread state', () => {
  const screen = render(<MessagesScreen />);
  expect(screen.getByRole('header', { name: 'Good conversations start here' })).toBeTruthy();
  data.chatLoading = true;
  screen.rerender(<MessagesScreen />);
  expect(screen.queryByText('Good conversations start here')).toBeNull();
  data.chatLoading = false;
  data.chatError = 'Reconnect';
  screen.rerender(<MessagesScreen />);
  expect(screen.queryByText('Good conversations start here')).toBeNull();
  data.chatError = null;
  data.teams = Array.from({ length: 6 }, (_, i) => ({ ...TEAM, id: `team-${i}`, name: `Team ${i}` }));
  screen.rerender(<MessagesScreen />);
  fireEvent.changeText(screen.getByLabelText('Search conversations'), 'Team 1');
  expect(screen.getByText('Team 1')).toBeTruthy();
  expect(screen.queryByText('Good conversations start here')).toBeNull();
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
});

it('refreshes on focus/foreground without ever marking a conversation read', () => {
  const screen = render(<MessagesScreen />);
  expect(screen.getByLabelText('Current church: Community Church')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Community Choir, 3 unread messages/ })).toBeTruthy();
  expect(data.refreshChat).toHaveBeenCalledTimes(1);
  expect(data.refreshUnreadSummary).toHaveBeenCalledTimes(1);
  act(() => { listeners.forEach((listener) => listener('background')); listeners.forEach((listener) => listener('active')); });
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  expect(data.refreshUnreadSummary).toHaveBeenCalledTimes(2);
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
  expect(data.registerActiveTeamChat).not.toHaveBeenCalled();
  mockFocused = false;
  screen.rerender(<MessagesScreen />);
  act(() => { listeners.forEach((listener) => listener('background')); listeners.forEach((listener) => listener('active')); });
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByRole('button', { name: /Community Choir, 3 unread messages/ }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/chat', params: { teamId: TEAM.id } });
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
});

it('does not refresh live data in demo mode', () => {
  data.chatLive = false;
  render(<MessagesScreen />);
  expect(data.refreshChat).not.toHaveBeenCalled();
  expect(data.refreshUnreadSummary).not.toHaveBeenCalled();
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
});

it.each([
  [0, /^Community Choir\. /],
  [1, /^Community Choir, 1 unread message\. /],
  [2, /^Community Choir, 2 unread messages\. /],
])('announces an authoritative unread count of %i with matching grammar', (unread, label) => {
  data.unreadByTeam = { [TEAM.id]: unread as number };
  const screen = render(<MessagesScreen />);
  expect(screen.getByRole('button', { name: label as RegExp })).toBeTruthy();
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
});

it('uses existing team photos and orders rows by recent messages', () => {
  data.teams = [TEAM, { ...TEAM, id: 'media', name: 'Media' }];
  data.chatMessages.push(message({ id: 'recent', team_id: 'media', created_at: '2030-01-01T00:00:00Z' }));
  const screen = render(<MessagesScreen />);
  const rows = screen.getAllByRole('button');
  expect(rows[0].props.accessibilityLabel).toMatch(/^Media/);
  expect(rows[1].props.accessibilityLabel).toMatch(/^Community Choir/);
  expect(data.getTeamAvatarUri).toHaveBeenCalledWith(TEAM);
});

it('offers search for a long list and keeps the full team name', () => {
  const longName = 'Community Welcome and Pastoral Support Across All Campuses';
  data.teams = Array.from({ length: 7 }, (_, index) => ({ ...TEAM, id: `team-${index}`, name: index === 6 ? longName : `Team ${index}` }));
  const screen = render(<MessagesScreen />);
  fireEvent.changeText(screen.getByLabelText('Search conversations'), 'pastoral');
  expect(screen.getByText(longName)).toBeTruthy();
  expect(screen.getByText('1 of 7 conversations')).toBeTruthy();
  expect(screen.queryByText('Team 0')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Search conversations'), 'unmatched');
  expect(screen.getByText('No matching conversations')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open Teams' })).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Search conversations'), '');
  expect(screen.getByText('Team 0')).toBeTruthy();
});

it('distinguishes directory loading, read failure and a genuinely empty directory', () => {
  data.teams = [];
  data.teamsLoading = true;
  const screen = render(<MessagesScreen />);
  expect(screen.getByRole('progressbar', { name: 'Loading your teams…' })).toBeTruthy();
  expect(screen.queryByText('No team chats yet')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open Teams' })).toBeNull();
  data.teamsLoading = false;
  data.teamsError = 'Please reconnect.';
  screen.rerender(<MessagesScreen />);
  expect(screen.getByText("Couldn't load your teams")).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open Teams' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry teams' }));
  expect(data.refreshTeams).toHaveBeenCalledTimes(1);
  data.teamsError = null;
  screen.rerender(<MessagesScreen />);
  expect(screen.getByText('No team chats yet')).toBeTruthy();
});

it.each(['general_member', 'announcement_manager', 'event_manager'])(
  'directs a %s with no accessible conversations to an admin without suggesting self-join or team creation', (orgRole) => {
  (useRequiredUser as jest.Mock).mockReturnValue({ ...USER, orgRole, memberships: [] });
  const screen = render(<MessagesScreen />);
  expect(screen.getByText('No team chats yet')).toBeTruthy();
  expect(screen.getByText('Ask a team admin or church admin to add you to a team.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open Teams' })).toBeNull();
  expect(screen.queryByText(TEAM.name)).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
});

it.each([false, true])('offers the existing Teams route to an empty church admin, with archived teams: %s', (hasArchivedTeams) => {
  data.teams = [];
  data.archivedTeams = hasArchivedTeams ? [{ ...TEAM, archived_at: '2026-09-01' }] : [];
  const screen = render(<MessagesScreen />);
  expect(screen.getByText(hasArchivedTeams ? 'Create a team or restore an archived team in Teams.'
    : 'Create a team in Teams to start a conversation.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Open Teams' }));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/teams');
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
  expect(data.registerActiveTeamChat).not.toHaveBeenCalled();
});

it('distinguishes message loading and failure from a conversation with no messages', () => {
  data.chatMessages = [];
  data.chatLoading = true;
  const screen = render(<MessagesScreen />);
  expect(screen.getByText('Loading messages…')).toBeTruthy();
  data.chatLoading = false;
  data.chatError = 'Cannot fetch messages';
  screen.rerender(<MessagesScreen />);
  expect(screen.getByText('Messages unavailable')).toBeTruthy();
  expect(screen.queryByText('No messages yet')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry messages' }));
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  data.chatError = null;
  screen.rerender(<MessagesScreen />);
  expect(screen.getByText('No messages yet')).toBeTruthy();
});

it('keeps saved previews visible and distinguishes a refresh error', () => {
  data.chatError = 'Network unavailable';
  data.teamsError = 'Directory unavailable';
  const screen = render(<MessagesScreen />);
  expect(screen.getByText('Sam Williams: Rehearsal starts at seven.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry messages' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry teams' })).toBeTruthy();
  expect(screen.queryByText('No team chats yet')).toBeNull();
});
