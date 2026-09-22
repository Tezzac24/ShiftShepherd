import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { ScrollView, View } from 'react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { NotificationPreferences } from '../../../types';
import NotificationSettingsScreen from '../NotificationSettingsScreen';
import { DevicePushRegistrationState, useDevicePushRegistration } from '../useDevicePushRegistration';

const mockToast = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: mockPush }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('../useDevicePushRegistration', () => ({ useDevicePushRegistration: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseDevice = useDevicePushRegistration as jest.Mock;
const registerDevice = jest.fn();
const refreshNotificationPrefs = jest.fn();
const updateNotificationPreferences = jest.fn();
const getNotificationPreferences = jest.fn();
const USER = { profile: { id: 'current-profile', organisation_id: 'church-hope' } };
let preferences: NotificationPreferences;
const PREFS = [
  ['announcement_notifications', 'Church announcements'],
  ['team_announcement_notifications', 'Team announcements'],
  ['chat_notifications', 'Chat messages'],
  ['rota_notifications', 'Rota updates'],
  ['event_reminders', 'Event reminders'],
  ['availability_reminders', 'Availability reminders'],
] as const;

beforeEach(() => {
  preferences = {
    id: 'current-preferences', user_id: 'current-profile',
    announcement_notifications: true, team_announcement_notifications: true,
    chat_notifications: true, rota_notifications: true, event_reminders: true, availability_reminders: true,
  };
  registerDevice.mockReset();
  refreshNotificationPrefs.mockReset().mockResolvedValue(undefined);
  updateNotificationPreferences.mockReset().mockImplementation(async (_profileId, changes) => { preferences = { ...preferences, ...changes }; });
  getNotificationPreferences.mockReset().mockImplementation(() => preferences);
  mockUseRequiredUser.mockReturnValue(USER);
  mockUseAuth.mockReturnValue({
    user: USER, authMode: 'supabase', accountStatus: 'ready',
    accountContext: {
      account: { active_profile_id: 'current-profile' },
      organisations: [{ profile: USER.profile, organisation: { id: 'church-hope', name: 'Hope Community' } }],
    },
  });
  mockUseAppData.mockReturnValue({
    organisation: { id: 'demo', name: 'Demo fallback church' },
    notificationPrefsLive: true, notificationPrefsLoading: false, notificationPrefsError: null,
    updateNotificationPreferences, getNotificationPreferences, refreshNotificationPrefs,
  });
  mockUseDevice.mockReturnValue({ state: { kind: 'notSetUp' }, register: registerDevice });
});

afterEach(() => jest.restoreAllMocks());

function toggle(screen: ReturnType<typeof render>, title: string) {
  return screen.getByRole('switch', { name: new RegExp(`^${title}\\.`) });
}

describe('Notification preferences', () => {
  it('shows six accessible full-row switches and does not write defaults or request permission on mount', () => {
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    expect(getNotificationPreferences).toHaveBeenCalledWith('current-profile');
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Current church: Hope Community')).toBeTruthy();
    expect(screen.queryByText('Demo fallback church')).toBeNull();
    expect(screen.getByText('These preferences belong to your current church profile. Your other churches have their own choices.')).toBeTruthy();
  });

  it.each(PREFS)('keeps the exact %s key and current-profile owner on one full-row tap', async (key, title) => {
    const screen = render(<NotificationSettingsScreen />);
    fireEvent.press(screen.getByText(title));
    await waitFor(() => expect(updateNotificationPreferences.mock.calls).toEqual([['current-profile', { [key]: false }]]));
    expect(toggle(screen, title)).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('shows the optimistic choice, prevents duplicate saves and keeps all rows disabled until completion', async () => {
    let finish!: () => void;
    updateNotificationPreferences.mockImplementation((_profileId, changes) => new Promise<void>((resolve) => {
      finish = () => { preferences = { ...preferences, ...changes }; resolve(); };
    }));
    const screen = render(<NotificationSettingsScreen />);
    fireEvent.press(toggle(screen, 'Chat messages'));
    expect(toggle(screen, 'Chat messages')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false, busy: true, disabled: true }));
    expect(screen.getByText('Saving your choice…')).toBeTruthy();
    for (const control of screen.getAllByRole('switch')) expect(control).toBeDisabled();
    fireEvent.press(toggle(screen, 'Chat messages'));
    fireEvent.press(toggle(screen, 'Rota updates'));
    expect(updateNotificationPreferences).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(toggle(screen, 'Chat messages')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false, busy: false, disabled: false }));
    expect(mockToast).toHaveBeenCalledWith('Notification settings saved.');
  });

  it('rolls back a failed change and preserves the error until the user retries a switch', async () => {
    updateNotificationPreferences.mockRejectedValueOnce(new Error('Please check your connection.'));
    const screen = render(<NotificationSettingsScreen />);
    fireEvent.press(toggle(screen, 'Church announcements'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Church announcements: change not saved'));
    expect(toggle(screen, 'Church announcements')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true, disabled: false }));
    expect(screen.getByText(/Your previous choice has been restored/)).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
    fireEvent.press(toggle(screen, 'Church announcements'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Notification settings saved.'));
    expect(toggle(screen, 'Church announcements')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['reveals bottom-of-screen feedback with a small scroll', 1080, 340, 832],
    ['does not move an already visible switch and feedback', 760, 340, null],
    ['keeps the retry switch visible when large feedback exceeds the viewport', 1080, 720, 1068],
  ] as const)('%s after a failed availability reminder save, then recovers on retry', async (_label, y, height, expectedOffset) => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
    const measureLayout = jest.spyOn(View.prototype, 'measureLayout').mockImplementation((_relativeNode, onSuccess) => {
      onSuccess(0, y, 335, height);
    });
    updateNotificationPreferences.mockRejectedValueOnce(new Error('Please check your connection.'));
    const screen = render(<NotificationSettingsScreen />);
    const scroller = screen.UNSAFE_getByType(ScrollView);
    fireEvent(scroller, 'layout', { nativeEvent: { layout: { height: 600 } } });
    fireEvent.scroll(scroller, { nativeEvent: { contentOffset: { y: 620 } } });
    // RN Web registers ResizeObserver at mount only. Adding onLayout after
    // failure leaves the row unobserved, even though manually firing it works.
    const originalChoice = screen.getByTestId('notification-preference-availability_reminders');
    expect(originalChoice).toHaveProp('onLayout', expect.any(Function));
    fireEvent(originalChoice, 'layout', { nativeEvent: { layout: { y: 0, height: 90 } } });
    expect(measureLayout).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.press(toggle(screen, 'Availability reminders'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Availability reminders: change not saved'));
    const failedChoice = screen.getByTestId('notification-preference-availability_reminders');
    expect(within(failedChoice).getByRole('alert')).toHaveTextContent('Availability reminders: change not saved');
    expect(within(failedChoice).getByText(/Your previous choice has been restored. Try this switch again/)).toBeTruthy();
    expect(within(failedChoice).getByRole('switch')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true, disabled: false }));
    expect(within(screen.getByTestId('notification-preference-event_reminders')).queryByRole('alert')).toBeNull();
    fireEvent(failedChoice, 'layout', { nativeEvent: { layout: { y: 0, height } } });
    if (expectedOffset === null) expect(scrollTo).not.toHaveBeenCalled();
    else expect(scrollTo).toHaveBeenCalledWith({ y: expectedOffset, animated: false });
    expect(mockToast).not.toHaveBeenCalled();

    fireEvent.press(toggle(screen, 'Availability reminders'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Notification settings saved.'));
    expect(updateNotificationPreferences.mock.calls).toEqual([
      ['current-profile', { availability_reminders: false }],
      ['current-profile', { availability_reminders: false }],
    ]);
    expect(toggle(screen, 'Availability reminders')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false, disabled: false }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('uses friendly fallback copy for an unknown save failure', async () => {
    updateNotificationPreferences.mockRejectedValueOnce('unknown');
    const screen = render(<NotificationSettingsScreen />);
    fireEvent.press(toggle(screen, 'Chat messages'));
    await waitFor(() => expect(screen.getByText(/We couldn't save your notification settings/)).toBeTruthy());
  });

  it('retains instant demo updates, hides device registration and explains demo scope', () => {
    mockUseAppData.mockReturnValue({ ...mockUseAppData(), notificationPrefsLive: false });
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), authMode: 'demo', accountContext: null });
    const screen = render(<NotificationSettingsScreen />);
    fireEvent.press(toggle(screen, 'Rota updates'));
    expect(updateNotificationPreferences).toHaveBeenCalledWith('current-profile', { rota_notifications: false });
    expect(screen.queryByText('On this device')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enable device notifications' })).toBeNull();
    expect(screen.getByText('Demo only: these choices are saved with your example data. This demo sends no device notifications.')).toBeTruthy();
    expect(registerDevice).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('states that only the two reminder kinds are undelivered while retaining their saved values', () => {
    preferences = { ...preferences, event_reminders: false, availability_reminders: true };
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByText('Church and team updates')).toBeTruthy();
    expect(screen.getByText('Event and availability reminders are not sent yet. You can still save your choices.')).toBeTruthy();
    expect(toggle(screen, 'Event reminders')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    expect(toggle(screen, 'Availability reminders')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
    expect(screen.queryByText(/delivery.*later update|once delivery is switched on|physical.*verified/i)).toBeNull();
  });

  it('loads the new active profile preferences when the scoped screen remounts', async () => {
    const original = render(<NotificationSettingsScreen />);
    original.unmount();
    mockUseRequiredUser.mockReturnValue({ profile: { id: 'next-profile', organisation_id: 'church-next' } });
    const screen = render(<NotificationSettingsScreen />);
    fireEvent.press(toggle(screen, 'Team announcements'));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith('next-profile', { team_announcement_notifications: false }));
    expect(getNotificationPreferences).toHaveBeenLastCalledWith('next-profile');
  });

  it('shows loading without editable defaults or a device opt-in action', () => {
    mockUseAppData.mockReturnValue({ ...mockUseAppData(), notificationPrefsLoading: true, notificationPrefsError: 'Previous read failed' });
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading your notification settings…' })).toBeTruthy();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Retry settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enable device notifications' })).toBeNull();
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it('keeps failed reads separate from empty/default preferences and offers the existing retry', () => {
    mockUseAppData.mockReturnValue({ ...mockUseAppData(), notificationPrefsError: 'We couldn’t read your saved choices.' });
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByText('Couldn’t load settings')).toBeTruthy();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    fireEvent.press(screen.getByRole('button', { name: 'Retry settings' }));
    expect(refreshNotificationPrefs).toHaveBeenCalledTimes(1);
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
  });
});

describe('Existing device registration presentation', () => {
  it('calls only the explicit register action after opt-in, never from a preference change', async () => {
    const screen = render(<NotificationSettingsScreen />);
    expect(registerDevice).not.toHaveBeenCalled();
    fireEvent.press(toggle(screen, 'Rota updates'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(registerDevice).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Enable device notifications' }));
    expect(registerDevice).toHaveBeenCalledTimes(1);
  });

  it('waits for hydration without offering a second registration action', () => {
    mockUseDevice.mockReturnValue({ state: { kind: 'hydrating' }, register: registerDevice });
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByRole('progressbar', { name: 'Checking this device…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable device notifications' })).toBeNull();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('describes registered state without promising verified delivery or future-only supported kinds', () => {
    mockUseDevice.mockReturnValue({ state: { kind: 'registered', registeredAt: '2026-09-22T10:00:00Z' }, register: registerDevice });
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByText('Device registered')).toBeTruthy();
    expect(screen.getByText('This device is registered for your current church. Your choices above decide which announcements, messages and rota updates are allowed.')).toBeTruthy();
    expect(screen.queryByText(/all set|later update|verified|ExpoPushToken/i)).toBeNull();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('shows denied permission guidance and delegates an explicit retry to the same lifecycle', () => {
    mockUseDevice.mockReturnValue({ state: { kind: 'permissionDenied' }, register: registerDevice });
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByText('Notifications are turned off for Shift Shepherd in your device settings. Allow them there, then try again.')).toBeTruthy();
    expect(registerDevice).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(registerDevice).toHaveBeenCalledTimes(1);
  });

  it.each<['unsupportedDevice' | 'needsDevelopmentBuild' | 'missingProjectId', string]>([
    ['unsupportedDevice', 'Unavailable on this device'],
    ['needsDevelopmentBuild', 'Unavailable in this preview'],
    ['missingProjectId', 'Notifications aren’t set up yet'],
  ])('keeps %s calm and truthful, with preferences still available', (kind, title) => {
    mockUseDevice.mockReturnValue({ state: { kind } satisfies DevicePushRegistrationState, register: registerDevice });
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Enable device notifications' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('keeps registration failure recoverable without exposing tokens', () => {
    mockUseDevice.mockReturnValue({ state: { kind: 'failed', message: 'We couldn’t register this device. Please try again.' }, register: registerDevice });
    const screen = render(<NotificationSettingsScreen />);
    expect(screen.getByText('Couldn’t enable notifications')).toBeTruthy();
    expect(screen.getByText('We couldn’t register this device. Please try again.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(registerDevice).toHaveBeenCalledTimes(1);
  });

  it('exposes working state and suppresses further permission/token requests', () => {
    mockUseDevice.mockReturnValue({ state: { kind: 'working' }, register: registerDevice });
    const screen = render(<NotificationSettingsScreen />);
    const button = screen.getByRole('button', { name: 'Setting up…' });
    expect(button).toHaveProp('accessibilityState', expect.objectContaining({ busy: true, disabled: true }));
    fireEvent.press(button);
    expect(registerDevice).not.toHaveBeenCalled();
  });
});
