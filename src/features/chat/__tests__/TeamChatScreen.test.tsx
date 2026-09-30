import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AppState, FlatList, StyleSheet } from 'react-native';

import { Button } from '../../../components/Button';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import TeamChatScreen from '../TeamChatScreen';
import { PendingChatImage } from '../useChatImageDraft';
import { makeAuth, makeData, message, PROFILE, TEAM } from './chatTestData';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockFocused = true;
let mockTeamId = 'choir';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({ teamId: mockTeamId }),
  useFocusEffect: (callback: () => (() => void) | undefined) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
  },
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
const mockPhoto: PendingChatImage = { previewUri: 'data:image/png;base64,AA==',
  file: { base64: 'AA==', mimeType: 'image/png', fileSize: 1, fileName: 'photo.png' } };
let mockPicking = false;
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 812, scale: 1, fontScale: mockFontScale }),
}));
const mockPick = jest.fn();
jest.mock('../useChatImageDraft', () => ({
  useChatImageDraft: () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [pendingImage, setPendingImage] = React.useState<PendingChatImage | null>(null);
    return { pendingImage, picking: mockPicking,
      pickImage: async () => { mockPick(); setPendingImage(mockPhoto); },
      removeImage: () => setPendingImage(null) };
  },
}));

let data: ReturnType<typeof makeData>;
let auth: ReturnType<typeof makeAuth>;
let listeners: ((state: string) => void)[];
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, 22, 12));
  mockFocused = true;
  mockTeamId = TEAM.id;
  mockPicking = false;
  mockFontScale = 1;
  data = makeData();
  auth = makeAuth();
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockImplementation(() => auth);
  listeners = [];
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as never;
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('registers only the focused team, marks its newest message and unregisters on blur', () => {
  const screen = render(<TeamChatScreen />);
  expect(data.registerActiveTeamChat).toHaveBeenCalledWith(TEAM.id);
  expect(data.refreshChat).toHaveBeenCalledTimes(1);
  expect(data.markTeamChatRead).toHaveBeenCalledWith(TEAM.id);
  expect(data.markTeamChatRead.mock.calls.every(([id]) => id === TEAM.id)).toBe(true);
  data.markTeamChatRead.mockClear();
  data.chatMessages.push(message({ id: 'later', created_at: new Date(2026, 8, 22, 10).toISOString() }));
  screen.rerender(<TeamChatScreen />);
  expect(data.markTeamChatRead).toHaveBeenCalledTimes(1);
  mockFocused = false;
  screen.rerender(<TeamChatScreen />);
  expect(data.unregisterActiveTeamChat).toHaveBeenCalledWith(TEAM.id);
  data.markTeamChatRead.mockClear();
  data.chatMessages.push(message({ id: 'blurred', created_at: new Date(2026, 8, 22, 11).toISOString() }));
  screen.rerender(<TeamChatScreen />);
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
  mockFocused = true;
  screen.rerender(<TeamChatScreen />);
  expect(data.markTeamChatRead).toHaveBeenCalledWith(TEAM.id);
  expect(data.registerActiveTeamChat).toHaveBeenCalledTimes(2);
  screen.unmount();
  expect(data.unregisterActiveTeamChat).toHaveBeenCalledTimes(2);
});

it('refreshes foreground only while focused and keeps demo chat free of live activity', () => {
  const screen = render(<TeamChatScreen />);
  const foreground = () => act(() => {
    listeners.forEach((listener) => listener('background'));
    listeners.forEach((listener) => listener('active'));
  });
  foreground();
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  mockFocused = false;
  screen.rerender(<TeamChatScreen />);
  foreground();
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  data.chatLive = false;
  data.chatRealtimeStatus = 'disconnected';
  auth.authMode = 'demo';
  mockFocused = true;
  data.registerActiveTeamChat.mockClear();
  screen.rerender(<TeamChatScreen />);
  foreground();
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  expect(data.registerActiveTeamChat).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Check for new messages' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
});

it('opens the existing team hub and preserves a text/photo draft while away and on return', async () => {
  const screen = render(<TeamChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Message'), 'Ask after checking the roster');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add photo' })); });
  fireEvent.press(screen.getByRole('button', { name: 'View team' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]', params: { teamId: TEAM.id } });
  expect(mockReplace).not.toHaveBeenCalled();
  mockFocused = false;
  screen.rerender(<TeamChatScreen />);
  expect(data.unregisterActiveTeamChat).toHaveBeenCalledWith(TEAM.id);
  data.markTeamChatRead.mockClear();
  data.chatMessages.push(message({ id: 'while-away', created_at: new Date(2026, 8, 22, 11).toISOString() }));
  screen.rerender(<TeamChatScreen />);
  expect(data.markTeamChatRead).not.toHaveBeenCalled();
  mockFocused = true;
  screen.rerender(<TeamChatScreen />);
  expect(data.registerActiveTeamChat).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Message caption').props.value).toBe('Ask after checking the roster');
  expect(screen.getByRole('button', { name: 'Remove selected photo' })).toBeTruthy();
  expect(data.sendChatMessage).not.toHaveBeenCalled();
});

it.each(['missing', 'other church', 'archived', 'archived metadata', 'not a member', 'unresolved'])
  ('does not activate, mark or display an inaccessible chat: %s', (scenario) => {
    if (scenario === 'missing') data.teams = [];
    if (scenario === 'other church') data.teams = [{ ...TEAM, organisation_id: 'church-b' }];
    if (scenario === 'archived') data.teams = [{ ...TEAM, archived_at: '2026-09-01' }];
    if (scenario === 'archived metadata') { data.teams = []; data.archivedTeams = [{ ...TEAM, archived_at: '2026-09-01' }]; }
    if (scenario === 'not a member') auth.user.orgRole = 'general_member';
    if (scenario === 'unresolved') auth.accountStatus = 'loading';
    const screen = render(<TeamChatScreen />);
    expect(data.registerActiveTeamChat).not.toHaveBeenCalled();
    expect(data.markTeamChatRead).not.toHaveBeenCalled();
    expect(data.refreshChat).not.toHaveBeenCalled();
    expect(screen.queryByText('Rehearsal starts at seven.')).toBeNull();
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByRole('button', { name: 'View team' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back to messages' }));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/messages');
  });

it('unregisters immediately when access is revoked and cannot send from the old handler', () => {
  const screen = render(<TeamChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Message'), 'Draft before removal');
  const oldSend = screen.UNSAFE_getAllByType(Button).find((button) => button.props.accessibilityLabel === 'Send message')!.props.onPress;
  auth.user = { ...auth.user, orgRole: 'general_member', memberships: [] };
  screen.rerender(<TeamChatScreen />);
  act(() => oldSend());
  expect(data.unregisterActiveTeamChat).toHaveBeenCalledWith(TEAM.id);
  expect(screen.getByText('No permission')).toBeTruthy();
  expect(data.sendChatMessage).not.toHaveBeenCalled();
});

it('shows directory retry separately from message retry and never calls an empty conversation a failure', () => {
  data.teams = [];
  data.teamsLoading = true;
  const screen = render(<TeamChatScreen />);
  expect(screen.getByRole('progressbar', { name: 'Loading your team…' })).toBeTruthy();
  data.teamsLoading = false;
  data.teamsError = 'Directory unavailable';
  screen.rerender(<TeamChatScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Retry team' }));
  expect(data.refreshTeams).toHaveBeenCalledTimes(1);
  data.teams = [TEAM];
  data.teamsError = null;
  data.chatMessages = [];
  data.chatLoading = true;
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByRole('progressbar', { name: 'Loading messages…' })).toBeTruthy();
  expect(screen.queryByText('No messages yet')).toBeNull();
  data.chatLoading = false;
  data.chatError = 'Messages unavailable';
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByText("Couldn't load messages")).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Retry messages' }));
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  data.chatError = null;
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByText('No messages yet')).toBeTruthy();
});

it.each(['connected', 'connecting', 'reconnecting', 'disconnected'])(
  'keeps one recovery action outside cached history when the connection is %s', (connection) => {
  data.chatRealtimeStatus = connection;
  data.chatError = 'Connection unavailable';
  const screen = render(<TeamChatScreen />);
  act(() => jest.advanceTimersByTime(1200));
  expect(screen.getByText("Couldn't refresh messages")).toBeTruthy();
  expect(screen.getByText('Rehearsal starts at seven.')).toBeTruthy();
  expect(screen.getByLabelText('Message')).toBeTruthy();
  expect(within(screen.UNSAFE_getByType(FlatList)).queryByText("Couldn't refresh messages")).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check for new messages' })).toBeNull();
  expect(screen.queryByRole('progressbar', { name: 'Connecting to chat' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry messages' }));
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  data.chatLoading = true;
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByRole('button', { name: 'Retry messages' }).props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(screen.getByText('Rehearsal starts at seven.')).toBeTruthy();
});

it('retains failed text and a selected photo, then clears both only after success', async () => {
  data.sendChatMessage.mockRejectedValueOnce(new Error('Please reconnect.'));
  const screen = render(<TeamChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Message'), '  Caption to keep  ');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add photo' })); });
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  expect(data.sendChatMessage).toHaveBeenCalledWith(TEAM.id, PROFILE.id, 'Caption to keep', mockPhoto.file);
  expect(screen.getByLabelText('Message caption').props.value).toBe('  Caption to keep  ');
  expect(screen.getByText("Couldn't send message")).toBeTruthy();
  expect(screen.getByText('Your draft is still here. Tap Send to try again.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove selected photo' })).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  expect(data.sendChatMessage).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Message').props.value).toBe('');
  expect(screen.queryByRole('button', { name: 'Remove selected photo' })).toBeNull();
  expect(screen.queryByText("Couldn't send message")).toBeNull();
});

it('sends a photo without a caption and lets the person remove an unsent photo', async () => {
  const screen = render(<TeamChatScreen />);
  expect(screen.getByRole('button', { name: 'Send message' }).props.accessibilityState.disabled).toBe(true);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add photo' })); });
  expect(screen.getByRole('button', { name: 'Send message' }).props.accessibilityState.disabled).toBe(false);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  expect(data.sendChatMessage).toHaveBeenCalledWith(TEAM.id, PROFILE.id, '', mockPhoto.file);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add photo' })); });
  fireEvent.press(screen.getByRole('button', { name: 'Remove selected photo' }));
  expect(screen.getByLabelText('Message')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send message' }).props.accessibilityState.disabled).toBe(true);
});

it('blocks duplicate taps synchronously and allows a new send after completion', async () => {
  let complete!: () => void;
  data.sendChatMessage.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
  const screen = render(<TeamChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Message'), 'First message');
  const send = screen.UNSAFE_getAllByType(Button).find((button) => button.props.accessibilityLabel === 'Send message')!.props.onPress;
  act(() => { send(); send(); });
  expect(data.sendChatMessage).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Sending message' }).props.accessibilityState.busy).toBe(true);
  expect(screen.getByLabelText('Message').props.editable).toBe(false);
  await act(async () => { complete(); });
  fireEvent.changeText(screen.getByLabelText('Message'), 'Second message');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  expect(data.sendChatMessage).toHaveBeenCalledTimes(2);
});

it('blocks blank sends and sending while a photo selection is in progress', () => {
  const screen = render(<TeamChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Message'), '   ');
  expect(screen.getByRole('button', { name: 'Send message' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByLabelText('Message'), 'A caption');
  mockPicking = true;
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByRole('button', { name: 'Send message' }).props.accessibilityState.disabled).toBe(true);
  expect(data.sendChatMessage).not.toHaveBeenCalled();
});

it.each([[1, 53, 157], [2, 79, 287]])(
  'grows the composer with font scale %i, retains its size on failure and shrinks on clear or success', async (fontScale, minimum, maximum) => {
  mockFontScale = fontScale;
  const screen = render(<TeamChatScreen />);
  const composerHeight = () => StyleSheet.flatten(screen.getByLabelText('Message').props.style).height;
  expect(composerHeight()).toBe(minimum);
  fireEvent.changeText(screen.getByLabelText('Message'), 'A longer message to review before sending.');
  fireEvent(screen.getByLabelText('Message'), 'contentSizeChange', { nativeEvent: { contentSize: { height: 102, width: 330 } } });
  expect(composerHeight()).toBeGreaterThan(minimum);
  expect(composerHeight()).toBe(105);
  fireEvent(screen.getByLabelText('Message'), 'contentSizeChange', { nativeEvent: { contentSize: { height: 700, width: 330 } } });
  expect(composerHeight()).toBe(maximum);
  data.sendChatMessage.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  expect(composerHeight()).toBe(maximum);
  fireEvent.changeText(screen.getByLabelText('Message'), '');
  expect(composerHeight()).toBe(minimum);
  fireEvent.changeText(screen.getByLabelText('Message'), 'A new message');
  fireEvent(screen.getByLabelText('Message'), 'contentSizeChange', { nativeEvent: { contentSize: { height: 76, width: 330 } } });
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  expect(composerHeight()).toBe(minimum);
});

it.each(['account readiness', 'directory loading', 'directory failure', 'message refresh'])
  ('preserves the same-profile text/photo draft through %s', async (scenario) => {
    const screen = render(<TeamChatScreen />);
    fireEvent.changeText(screen.getByLabelText('Message'), 'Keep this draft');
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add photo' })); });
    if (scenario === 'account readiness') auth.accountStatus = 'loading';
    if (scenario === 'directory loading') { data.teams = []; data.teamsLoading = true; }
    if (scenario === 'directory failure') { data.teams = []; data.teamsError = 'Temporarily unavailable'; }
    if (scenario === 'message refresh') { data.chatMessages = []; data.chatLoading = true; }
    screen.rerender(<TeamChatScreen />);
    auth.accountStatus = 'ready';
    data.teams = [{ ...TEAM, name: 'Updated choir name' }];
    data.teamsLoading = false;
    data.teamsError = null;
    data.chatLoading = false;
    screen.rerender(<TeamChatScreen />);
    expect(screen.getByLabelText('Message caption').props.value).toBe('Keep this draft');
    expect(screen.getByRole('button', { name: 'Remove selected photo' })).toBeTruthy();
    expect(screen.getByText('Updated choir name')).toBeTruthy();
  });

it.each(['profile', 'organisation', 'team', 'mode'])
  ('discards text/photo drafts on a real %s change and ignores the old send completion', async (scenario) => {
    let complete!: () => void;
    data.sendChatMessage.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    const screen = render(<TeamChatScreen />);
    fireEvent.changeText(screen.getByLabelText('Message'), 'Old scoped draft');
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add photo' })); });
    fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
    if (scenario === 'profile') auth.user = { ...auth.user, profile: { ...PROFILE, id: 'profile-new' } };
    if (scenario === 'organisation') {
      auth.user = { ...auth.user, profile: { ...PROFILE, organisation_id: 'church-new' } };
      data.teams = [{ ...TEAM, organisation_id: 'church-new' }];
    }
    if (scenario === 'team') { mockTeamId = 'media'; data.teams.push({ ...TEAM, id: 'media', name: 'Media' }); }
    if (scenario === 'mode') { auth.authMode = 'demo'; data.chatLive = false; }
    screen.rerender(<TeamChatScreen />);
    expect(screen.getByLabelText('Message').props.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Remove selected photo' })).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Message'), 'New scoped draft');
    await act(async () => { complete(); });
    expect(screen.getByLabelText('Message').props.value).toBe('New scoped draft');
  });

it('preserves a failed draft through an account error and offers a safe exit', async () => {
  data.sendChatMessage.mockRejectedValueOnce(new Error('Offline'));
  const screen = render(<TeamChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Message'), 'Keep on error');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  auth.accountStatus = 'error';
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByText("Couldn't check chat access")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back to messages' })).toBeTruthy();
  auth.accountStatus = 'ready';
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByLabelText('Message').props.value).toBe('Keep on error');
  expect(screen.getByText("Couldn't send message")).toBeTruthy();
});

it('delays connecting UI, then shows labelled reconnect and disconnected refresh actions', () => {
  data.chatRealtimeStatus = 'connecting';
  const screen = render(<TeamChatScreen />);
  expect(screen.queryByText('Connecting…')).toBeNull();
  act(() => jest.advanceTimersByTime(1200));
  expect(screen.getByRole('progressbar', { name: 'Connecting to chat' })).toBeTruthy();
  data.chatRealtimeStatus = 'reconnecting';
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByText('Connection is slow.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Check for new messages' }));
  expect(data.refreshChat).toHaveBeenCalledTimes(2);
  data.chatLoading = true;
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByRole('button', { name: 'Check for new messages' }).props.accessibilityState.busy).toBe(true);
  data.chatLoading = false;
  data.chatRealtimeStatus = 'disconnected';
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByText('Live updates are paused.')).toBeTruthy();
  data.chatRealtimeStatus = 'connected';
  screen.rerender(<TeamChatScreen />);
  expect(screen.queryByRole('button', { name: 'Check for new messages' })).toBeNull();
});

it('does not scroll history on arrival but scrolls near-bottom arrivals and an own send', async () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => undefined);
  const screen = render(<TeamChatScreen />);
  const list = screen.UNSAFE_getByType(FlatList);
  scroll.mockClear();
  act(() => list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1200 } } }));
  act(() => list.props.onContentSizeChange(300, 1300));
  expect(scroll).not.toHaveBeenCalled();
  act(() => list.props.onScroll({ nativeEvent: { contentOffset: { y: 840 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1300 } } }));
  act(() => list.props.onContentSizeChange(300, 1400));
  expect(scroll).toHaveBeenLastCalledWith({ animated: false });
  scroll.mockClear();
  act(() => list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1400 } } }));
  fireEvent.changeText(screen.getByLabelText('Message'), 'My new message');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Send message' })); });
  act(() => jest.advanceTimersByTime(50));
  expect(scroll).toHaveBeenLastCalledWith({ animated: false });
});

it('keeps the latest message anchored through layout changes without moving a reader of history', () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => undefined);
  const screen = render(<TeamChatScreen />);
  const list = screen.UNSAFE_getByType(FlatList);
  const layout = (height: number) => act(() => list.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 375, height } } }));
  scroll.mockClear();
  act(() => list.props.onScroll({ nativeEvent: { contentOffset: { y: 790 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1200 } } }));
  fireEvent.changeText(screen.getByLabelText('Message'), 'A draft that grows');
  fireEvent(screen.getByLabelText('Message'), 'contentSizeChange', { nativeEvent: { contentSize: { height: 154, width: 330 } } });
  layout(296);
  expect(scroll).toHaveBeenLastCalledWith({ animated: false });
  scroll.mockClear();
  act(() => list.props.onScroll({ nativeEvent: { contentOffset: { y: 100 }, layoutMeasurement: { height: 296 }, contentSize: { height: 1200 } } }));
  data.chatError = 'Refresh unavailable';
  screen.rerender(<TeamChatScreen />);
  layout(196);
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Message'), '');
  layout(300);
  expect(scroll).not.toHaveBeenCalled();
  act(() => list.props.onScroll({ nativeEvent: { contentOffset: { y: 850 }, layoutMeasurement: { height: 300 }, contentSize: { height: 1200 } } }));
  data.chatError = null;
  screen.rerender(<TeamChatScreen />);
  layout(460);
  expect(scroll).toHaveBeenLastCalledWith({ animated: false });
});

it('shows full team and sender context with local day separators and a photo failure fallback', () => {
  const longName = 'Community Welcome and Pastoral Support Across All Campuses';
  data.teams = [{ ...TEAM, name: longName }];
  data.chatMessages = [message({ created_at: new Date(2026, 8, 21, 18).toISOString() }),
    message({ id: 'mine', sender_id: PROFILE.id, body: 'My message', attachment: {
      id: 'image', message_id: 'mine', file_url: 'private/photo.png', file_type: 'image/png',
      file_name: 'photo.png', file_size_bytes: 1, created_at: '',
    } })];
  const screen = render(<TeamChatScreen />);
  expect(screen.getByText(longName)).toBeTruthy();
  expect(screen.getByText('Sam Williams')).toBeTruthy();
  expect(screen.getByText('You')).toBeTruthy();
  expect(screen.getByText('Yesterday')).toBeTruthy();
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByLabelText('Photo unavailable')).toBeTruthy();
  expect(data.getChatAttachmentUri).toHaveBeenCalledWith(data.chatMessages[1]);
  expect(screen.queryByText(/Unread messages/)).toBeNull();
});

it('shows an unavailable photo after image failure and retries only when its resolved URI changes', () => {
  data.chatMessages = [message({ attachment: {
    id: 'image', message_id: 'message-a', file_url: 'private/photo.png', file_type: 'image/png',
    file_name: 'photo.png', file_size_bytes: 1, created_at: '',
  } })];
  data.getChatAttachmentUri.mockReturnValue('data:image/png;base64,first');
  const screen = render(<TeamChatScreen />);
  fireEvent(screen.getByLabelText('Chat photo'), 'error', { nativeEvent: { error: 'Unavailable' } });
  expect(screen.getByLabelText('Photo unavailable')).toBeTruthy();
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByLabelText('Photo unavailable')).toBeTruthy();
  data.getChatAttachmentUri.mockReturnValue('data:image/png;base64,replacement');
  screen.rerender(<TeamChatScreen />);
  expect(screen.getByLabelText('Chat photo')).toBeTruthy();
  expect(screen.queryByLabelText('Photo unavailable')).toBeNull();
});
