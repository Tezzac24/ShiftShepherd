import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { AppDataProvider, useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { listOrganisationMembers, setOrganisationMemberRole } from '../../../lib/supabase/services/organisationMemberships';
import { fetchTeamsDirectory, TeamsDirectory } from '../../../lib/supabase/services/teams';
import { OrganisationRoleName, SessionUser } from '../../../types';
import OrganisationMemberRoleScreen from '../OrganisationMemberRoleScreen';
import { ADMIN, adminAuth, CURRENT, deferred, MEMBER, memberProfile } from './organisationAdminFixtures';

let mockFocused = true;
let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
    useRouter: () => ({ back: jest.fn(), replace: mockReplace, push: jest.fn(), canGoBack: () => true }),
    useFocusEffect: (callback: () => void) => { const focused = mockFocused; return React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => async () => true }));
jest.mock('../../../components/Toast', () => ({ useToast: () => jest.fn() }));
// Exercise the real provider's live directory action with no client, credentials,
// subscriptions, device registration, network reads or persistent backend data.
jest.mock('../../../lib/supabase/client', () => ({ isSupabaseConfigured: true, getSupabase: () => null }));
jest.mock('../../../lib/supabase/services/organisationMemberships', () => ({ listOrganisationMembers: jest.fn(), setOrganisationMemberRole: jest.fn() }));
jest.mock('../../../lib/supabase/services/teams', () => ({ ...jest.requireActual('../../../lib/supabase/services/teams'), fetchTeamsDirectory: jest.fn() }));
jest.mock('../../../lib/supabase/services/announcements', () => ({ listAnnouncements: async () => [] }));
jest.mock('../../../lib/supabase/services/events', () => ({ listEvents: async () => [] }));
jest.mock('../../../lib/supabase/services/rotas', () => ({ fetchRotaData: async () => ({ entries: [], assignments: [], responses: [] }) }));
jest.mock('../../../lib/supabase/services/songs', () => ({ fetchSongsData: async () => ({ songs: [], selections: [] }) }));
jest.mock('../../../lib/supabase/services/chat', () => ({ listChatMessages: async () => [] }));
jest.mock('../../../lib/supabase/services/notifications', () => ({ fetchNotificationPreferences: async () => null }));
jest.mock('../../../lib/appData/useSessionChatMessaging', () => ({ useSessionChatMessaging: () => ({ reconcileNow: () => {} }) }));
jest.mock('../../../lib/appData/useSharedLiveDataFreshness', () => ({ useSharedLiveDataFreshness: () => () => {} }));

const fetchDirectory = fetchTeamsDirectory as jest.Mock;
const setRole = setOrganisationMemberRole as jest.Mock;
let currentAuth: ReturnType<typeof adminAuth> & { user: SessionUser } = { ...adminAuth(), user: ADMIN };
let published: ReturnType<typeof useAppData>;
function ObservedRole() {
  published = useAppData();
  return <OrganisationMemberRoleScreen />;
}
function Harness() {
  return <AppDataProvider key={currentAuth.user.profile.id}><ObservedRole /></AppDataProvider>;
}
function directory(): TeamsDirectory {
  return { organisation: null, users: [currentAuth.user.profile, memberProfile(MEMBER)], teams: [], memberships: [], currentOrgRole: currentAuth.user.orgRole ?? 'general_member' };
}
async function openRole() {
  const view = render(<Harness />);
  await view.findByText(mockParams.profileId === CURRENT.profile_id ? 'Daniel Okafor' : 'Ruth Johnson');
  await waitFor(() => expect(published.teamsLoading).toBe(false));
  return view;
}
function save(view: ReturnType<typeof render>, role = 'event_manager') {
  fireEvent.press(view.getByTestId(`organisation-role-${role}`));
  fireEvent.press(view.getByText('Save role'));
}
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockFocused = true;
  mockParams = { profileId: MEMBER.profile_id };
  const applySnapshot = jest.fn((profileId: string, snapshot: { orgRole?: OrganisationRoleName }) => {
    if (profileId === currentAuth.user.profile.id && snapshot.orgRole) currentAuth = {
      ...currentAuth, user: { ...currentAuth.user, orgRole: snapshot.orgRole },
    };
  });
  currentAuth = { ...adminAuth(ADMIN, { applySessionDirectorySnapshot: applySnapshot }), user: ADMIN };
  (useAuth as jest.Mock).mockImplementation(() => currentAuth);
  (useRequiredUser as jest.Mock).mockImplementation(() => currentAuth.user);
  (listOrganisationMembers as jest.Mock).mockResolvedValue([MEMBER, CURRENT]);
  setRole.mockImplementation(async (profile_id, role) => ({ profile_id, role }));
  fetchDirectory.mockImplementation(async () => directory());
});

it('uses a resolved read failure and its published error without undoing the confirmed role; retry clears it', async () => {
  const view = await openRole();
  fetchDirectory.mockRejectedValueOnce(new Error('A previous directory read failed.'));
  await act(async () => { await expect(published.refreshTeams()).resolves.toBeUndefined(); });
  expect(published.teamsError).toBe('A previous directory read failed.');
  const read = deferred<TeamsDirectory>();
  fetchDirectory.mockReturnValueOnce(read.promise);
  save(view);
  await view.findByText('Role saved');
  expect(view.getByRole('progressbar', { name: 'Refreshing church access…' })).toBeTruthy();
  expect(view.queryByText('Couldn’t refresh church access')).toBeNull();
  expect(published.teamsError).toBeNull();
  await act(async () => read.reject(new Error('The new directory read failed.')));
  expect(published.teamsLoading).toBe(false);
  expect(published.teamsError).toBe('The new directory read failed.');
  expect(view.getByText('Role saved')).toBeTruthy();
  expect(view.getByText('Couldn’t refresh church access')).toBeTruthy();
  expect(view.queryByText('Couldn’t confirm role change')).toBeNull();
  expect(view.queryByText('Save role')).toBeNull();

  const retry = deferred<TeamsDirectory>();
  fetchDirectory.mockReturnValueOnce(retry.promise);
  const retryButton = view.getByText('Check church access');
  fireEvent.press(retryButton); fireEvent.press(retryButton);
  expect(fetchDirectory).toHaveBeenCalledTimes(4);
  expect(published.teamsError).toBeNull();
  expect(view.queryByText('Couldn’t refresh church access')).toBeNull();
  expect(view.getByRole('progressbar', { name: 'Refreshing church access…' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Done' }).props.accessibilityState.disabled).toBe(true);
  await act(async () => retry.resolve(directory()));
  expect(view.getByText('Role saved')).toBeTruthy();
  expect(view.queryByText('Couldn’t refresh church access')).toBeNull();
  expect(view.getByRole('button', { name: 'Done' }).props.accessibilityState.disabled).toBe(false);
  expect(setRole).toHaveBeenCalledTimes(1);
});

it('keeps the saved outcome and read retry after self-demotion removes administration authority', async () => {
  mockParams = { profileId: CURRENT.profile_id };
  const view = await openRole();
  const read = deferred<TeamsDirectory>();
  fetchDirectory.mockReturnValueOnce(read.promise);
  save(view, 'general_member');
  await view.findByText('Role saved');
  currentAuth = { ...currentAuth, user: { ...currentAuth.user, orgRole: 'general_member' } };
  view.rerender(<Harness />);
  await act(async () => read.reject(new Error('Access read failed.')));
  expect(view.getByText('Role saved')).toBeTruthy();
  expect(view.queryByText('No permission')).toBeNull();
  fireEvent.press(view.getByText('Check church access'));
  await waitFor(() => expect(published.teamsError).toBeNull());
  await waitFor(() => expect(view.getByRole('button', { name: 'Done' }).props.accessibilityState.disabled).toBe(false));
  expect(fetchDirectory).toHaveBeenCalledTimes(3);
  expect(view.getByText('Role saved')).toBeTruthy();
  fireEvent.press(view.getByText('Done'));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
  expect(setRole).toHaveBeenCalledTimes(1);
});

it('does not publish a previous owner’s late refresh failure beside a replacement owner’s role form', async () => {
  const view = await openRole();
  const oldRead = deferred<TeamsDirectory>();
  fetchDirectory.mockReturnValueOnce(oldRead.promise);
  save(view);
  await view.findByText('Role saved');
  const replacement = { ...ADMIN, profile: { ...ADMIN.profile, id: 'replacement-profile', auth_user_id: 'replacement-account' }, supabaseProfileId: 'replacement-profile' };
  currentAuth = { ...adminAuth(replacement, { applySessionDirectorySnapshot: jest.fn() }), user: replacement };
  view.rerender(<Harness />);
  await view.findByText('Save role');
  await act(async () => oldRead.reject(new Error('Old owner read failed.')));
  expect(published.teamsError).toBeNull();
  expect(view.queryByText('Role saved')).toBeNull();
  expect(view.queryByText('Couldn’t refresh church access')).toBeNull();
  expect(setRole).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});
