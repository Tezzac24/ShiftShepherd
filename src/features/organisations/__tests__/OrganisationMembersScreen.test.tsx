import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { listOrganisationMembers, removeOrganisationMember } from '../../../lib/supabase/services/organisationMemberships';
import OrganisationMembersScreen from '../OrganisationMembersScreen';
import { ADMIN, adminAuth, CURRENT, deferred, DIRECTORY, MEMBER, ORGANISATION_ID, PROFILE, REMOVED } from './organisationAdminFixtures';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockFocused = true;
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { Stack: { Screen: () => null }, useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack }),
    useFocusEffect: (callback: () => void) => { const focused = mockFocused; return React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../../../lib/supabase/services/organisationMemberships', () => ({ listOrganisationMembers: jest.fn(), removeOrganisationMember: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const mockList = listOrganisationMembers as jest.Mock;
const mockRemove = removeOrganisationMember as jest.Mock;
const confirm = jest.fn();
const toast = jest.fn();
const refreshTeams = jest.fn();
const auth = useAuth as jest.Mock;
const requiredUser = useRequiredUser as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks(); mockFocused = true; mockCanGoBack = true;
  auth.mockReturnValue(adminAuth()); requiredUser.mockReturnValue(ADMIN);
  (useAppData as jest.Mock).mockReturnValue({ organisation: { id: ORGANISATION_ID, name: 'Grace Church' }, users: [PROFILE], getAvatarUri: jest.fn(), refreshTeams });
  (useConfirm as jest.Mock).mockReturnValue(confirm); (useToast as jest.Mock).mockReturnValue(toast);
  mockList.mockResolvedValue([CURRENT, MEMBER]); confirm.mockResolvedValue(true); refreshTeams.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue({ profile_id: MEMBER.profile_id, access_status: 'removed' });
});
afterEach(() => { jest.useRealTimers(); });

it('shows loading and one meaningful accessible status while the RPC is pending', () => {
  mockList.mockReturnValue(new Promise(() => {}));
  const view = render(<OrganisationMembersScreen />);
  expect(view.getByTestId('organisation-members-loading')).toBeTruthy();
  expect(view.getAllByRole('progressbar')).toHaveLength(1);
});

it('searches the server beyond the first page and labels the bounded results honestly', async () => {
  mockList.mockImplementation(async (query) => query ? [MEMBER] : [CURRENT]);
  const view = render(<OrganisationMembersScreen />);
  await view.findByText('Daniel Okafor');
  expect(view.getByText(/Up to 200 matching people/)).toBeTruthy();
  fireEvent.changeText(view.getByLabelText('Search members'), 'ruth@example');
  await view.findByText('Ruth Johnson');
  expect(mockList).toHaveBeenCalledWith('ruth@example');
  expect(view.queryByText('Daniel Okafor')).toBeNull();
});

it('does not describe empty results as proof that a person does not exist', async () => {
  mockList.mockResolvedValue([]);
  const view = render(<OrganisationMembersScreen />);
  await view.findByText('No members in these results');
  fireEvent.changeText(view.getByLabelText('Search members'), 'nobody');
  await view.findByText('No matching results');
  expect(view.getByText(/Search results do not confirm/)).toBeTruthy();
});

it('rejects out-of-order search completions', async () => {
  const old = deferred<typeof MEMBER[]>();
  mockList.mockImplementation((query) => query === 'old' ? old.promise : Promise.resolve(query === 'new' ? [DIRECTORY] : [CURRENT]));
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(CURRENT.full_name);
  fireEvent.changeText(view.getByLabelText('Search members'), 'old');
  await waitFor(() => expect(mockList).toHaveBeenCalledWith('old'));
  fireEvent.changeText(view.getByLabelText('Search members'), 'new');
  await view.findByText(DIRECTORY.full_name);
  await act(async () => old.resolve([MEMBER]));
  expect(view.queryByText(MEMBER.full_name)).toBeNull();
});

it('keeps the query across same-account readiness and refuses calls while unresolved', async () => {
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(MEMBER.full_name);
  fireEvent.changeText(view.getByLabelText('Search members'), 'Ruth');
  auth.mockReturnValue(adminAuth(ADMIN, { accountStatus: 'loading' }));
  view.rerender(<OrganisationMembersScreen />);
  expect(view.getByDisplayValue('Ruth')).toBeTruthy();
  const count = mockList.mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(350); });
  expect(mockList).toHaveBeenCalledTimes(count);
  auth.mockReturnValue(adminAuth()); view.rerender(<OrganisationMembersScreen />);
  await waitFor(() => expect(mockList).toHaveBeenCalledWith('Ruth'));
});

it('opens management in context and passes an exact target hint into the role route', async () => {
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(MEMBER.full_name);
  expect(view.queryByText('Manage role')).toBeNull();
  fireEvent.press(view.getByText(MEMBER.full_name));
  fireEvent.press(view.getByText('Manage role'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/organisations/members/[profileId]', params: {
    profileId: MEMBER.profile_id, memberEmail: MEMBER.email, memberName: MEMBER.full_name, organisationId: ORGANISATION_ID,
  } });
});

it('keeps removal confirmation short and names the full person and church in its body', async () => {
  const name = 'Ruth Alexandra Johnson Adeyemi Thompson of the Northside Community';
  mockList.mockResolvedValue([{ ...MEMBER, full_name: name }]);
  const view = render(<OrganisationMembersScreen />); await view.findByText(name);
  fireEvent.press(view.getByText(name)); fireEvent.press(view.getByText('Remove access'));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Remove church access?', message: expect.stringContaining(`${name}\n${MEMBER.email}\nGrace Church`),
    destructive: true, returnFocusRef: expect.any(Object),
  })));
  expect(confirm.mock.calls[0][0].message).toContain('Future duties are not reassigned automatically');
});

it.each([DIRECTORY, REMOVED])('connects the selected $full_name directly to invitation creation', async (member) => {
  mockList.mockResolvedValue([member]);
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(member.full_name);
  fireEvent.press(view.getByText(member.full_name));
  expect(view.getByText(/includes archived teams/)).toBeTruthy();
  fireEvent.press(view.getByText(member.access_status === 'removed' ? 'Invite again' : 'Invite to church'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/organisations/invitations', params: {
    targetProfileId: member.profile_id, targetEmail: member.email, targetName: member.full_name, organisationId: ORGANISATION_ID, create: '1',
  } });
  expect(view.queryByText('Manage role')).toBeNull();
});

it('routes an existing pending invitation into its current list', async () => {
  mockList.mockResolvedValue([{ ...DIRECTORY, pending_invitation_status: 'pending' }]);
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(DIRECTORY.full_name); fireEvent.press(view.getByText(DIRECTORY.full_name));
  fireEvent.press(view.getByText('View pending invitation'));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ targetProfileId: DIRECTORY.profile_id, create: '0' }) }));
});

it('keeps final-admin protection and own Leave from Profile distinct', async () => {
  mockList.mockResolvedValue([{ ...CURRENT, is_last_church_admin: true }]);
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(CURRENT.full_name); fireEvent.press(view.getByText(CURRENT.full_name));
  expect(view.getByText(/Final church admin/)).toBeTruthy();
  expect(view.queryByText('Remove access')).toBeNull();
  fireEvent.press(view.getByText('Leave from Profile'));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
  expect(mockRemove).not.toHaveBeenCalled();
});

it('confirms removal with retained history and future-duty consequences, then refreshes canonical data', async () => {
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(MEMBER.full_name); fireEvent.press(view.getByText(MEMBER.full_name));
  fireEvent.press(view.getByText('Remove access'));
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(MEMBER.profile_id));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Remove church access?', message: expect.stringContaining('Future duties are not reassigned automatically.') }));
  expect(refreshTeams).toHaveBeenCalledWith({ quiet: true });
});

it('does not turn a confirmed removal into a failed removal when refresh fails', async () => {
  refreshTeams.mockRejectedValue(new Error('Couldn’t refresh the directory.'));
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(MEMBER.full_name); fireEvent.press(view.getByText(MEMBER.full_name)); fireEvent.press(view.getByText('Remove access'));
  await view.findByText('Access removed; couldn’t refresh details');
  expect(view.getByText('Ruth Johnson no longer has access to this church.')).toBeTruthy();
  expect(view.queryByText('Couldn’t confirm access removal')).toBeNull();
});

it('fences an open confirmation after authority loss and after blur', async () => {
  const approval = deferred<boolean>(); confirm.mockReturnValue(approval.promise);
  const view = render(<OrganisationMembersScreen />);
  await view.findByText(MEMBER.full_name); fireEvent.press(view.getByText(MEMBER.full_name)); fireEvent.press(view.getByText('Remove access'));
  mockFocused = false; view.rerender(<OrganisationMembersScreen />);
  await act(async () => approval.resolve(true));
  expect(mockRemove).not.toHaveBeenCalled();
});

it.each(['general_member', 'demo'])('does not call the privileged RPC for %s', (mode) => {
  const user = { ...ADMIN, orgRole: mode === 'general_member' ? 'general_member' as const : ADMIN.orgRole };
  requiredUser.mockReturnValue(user); auth.mockReturnValue(adminAuth(user, mode === 'demo' ? { authMode: 'demo' } : {}));
  const view = render(<OrganisationMembersScreen />);
  expect(view.getByText('No permission')).toBeTruthy(); expect(mockList).not.toHaveBeenCalled();
});

it('offers an explicit safe exit for a direct denied route', () => {
  mockCanGoBack = false; const user = { ...ADMIN, orgRole: 'general_member' as const };
  requiredUser.mockReturnValue(user); auth.mockReturnValue(adminAuth(user));
  const view = render(<OrganisationMembersScreen />); fireEvent.press(view.getByText('Back to Profile'));
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('keeps a retryable read failure separate from an empty list', async () => {
  mockList.mockRejectedValue(new Error('We couldn’t load organisation members right now.'));
  const view = render(<OrganisationMembersScreen />);
  await view.findByText('We couldn’t load members'); expect(view.getByText('Try again')).toBeTruthy();
  expect(view.queryByText('No members in these results')).toBeNull();
});
