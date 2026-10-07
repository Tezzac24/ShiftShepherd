import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { listOrganisationMembers, setOrganisationMemberRole } from '../../../lib/supabase/services/organisationMemberships';
import OrganisationMemberRoleScreen from '../OrganisationMemberRoleScreen';
import { ADMIN, adminAuth, CURRENT, deferred, DIRECTORY, MEMBER, memberProfile, ORGANISATION_ID, REMOVED } from './organisationAdminFixtures';

const mockBack = jest.fn(); const mockReplace = jest.fn(); const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockFocused = true;
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
    useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush, canGoBack: () => true }),
    useFocusEffect: (callback: () => void) => { const focused = mockFocused; return React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../../../lib/supabase/services/organisationMemberships', () => ({ listOrganisationMembers: jest.fn(), setOrganisationMemberRole: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const list = listOrganisationMembers as jest.Mock;
const setRole = setOrganisationMemberRole as jest.Mock;
const auth = useAuth as jest.Mock;
const requiredUser = useRequiredUser as jest.Mock;
const confirm = jest.fn(); const toast = jest.fn(); const refreshTeams = jest.fn();
function ariaRole(view: ReturnType<typeof render>, role: string) {
  return view.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) => node.props.testID === `organisation-role-${role}` && node.props['aria-checked'] !== undefined)[0];
}
beforeEach(() => {
  jest.clearAllMocks(); mockParams = { profileId: MEMBER.profile_id }; mockFocused = true;
  auth.mockReturnValue(adminAuth()); requiredUser.mockReturnValue(ADMIN);
  (useAppData as jest.Mock).mockReturnValue({ users: [memberProfile(MEMBER)], refreshTeams });
  (useConfirm as jest.Mock).mockReturnValue(confirm); (useToast as jest.Mock).mockReturnValue(toast);
  confirm.mockResolvedValue(true); refreshTeams.mockResolvedValue(undefined); list.mockResolvedValue([MEMBER]);
  setRole.mockImplementation(async (profile_id, role) => ({ profile_id, role }));
});

it('renders exactly the four exclusive roles with readable capabilities and native/ARIA state', async () => {
  const view = render(<OrganisationMemberRoleScreen />);
  await view.findByText('Ruth Johnson');
  for (const label of ['Church Member', 'Announcement Manager', 'Event Manager', 'Church Admin']) expect(view.getByText(label)).toBeTruthy();
  expect(view.getByText('Church role')).toBeTruthy();
  expect(view.queryByText('High privilege')).toBeNull();
  expect(view.getByText('Can create and manage church events.')).toBeTruthy();
  expect(view.queryByText(/events and categories/)).toBeNull();
  const radio = view.getByTestId('organisation-role-general_member');
  expect(radio.props.accessibilityState.checked).toBe(true); expect(ariaRole(view, 'general_member').props['aria-checked']).toBe(true);
  expect(view.getByText(/Changing it keeps their church membership and assigned team roles/)).toBeTruthy();
});

it('resolves a selected person beyond the first page using the email hint and exact ID', async () => {
  mockParams = { profileId: MEMBER.profile_id, memberEmail: MEMBER.email, organisationId: ORGANISATION_ID };
  list.mockImplementation(async (query) => query === MEMBER.email ? [MEMBER] : [CURRENT]);
  const view = render(<OrganisationMemberRoleScreen />);
  await view.findByText('Ruth Johnson'); expect(list).toHaveBeenCalledWith(MEMBER.email);
});

it('keeps old ID-only links by using the scoped directory email as a hint', async () => {
  const view = render(<OrganisationMemberRoleScreen />);
  await view.findByText('Ruth Johnson'); expect(list).toHaveBeenCalledWith(MEMBER.email);
});

it.each(['name hint', 'ID-only directory name'])('opens a linked no-email person beyond the initial 200 through %s without substituting a namesake', async (kind) => {
  const noEmail = { ...MEMBER, email: '   ' };
  mockParams = { profileId: MEMBER.profile_id, ...(kind === 'name hint' ? { memberName: MEMBER.full_name, organisationId: ORGANISATION_ID } : {}) };
  (useAppData as jest.Mock).mockReturnValue({ users: kind === 'name hint' ? [] : [memberProfile(noEmail)], refreshTeams });
  list.mockImplementation(async (query) => query === MEMBER.full_name ? [{ ...noEmail, profile_id: CURRENT.profile_id }, noEmail] : [CURRENT]);
  const view = render(<OrganisationMemberRoleScreen />);
  await view.findByText('Ruth Johnson');
  expect(list).toHaveBeenCalledWith(MEMBER.full_name); expect(view.getByText('Email not listed')).toBeTruthy();
  fireEvent.press(view.getByTestId('organisation-role-event_manager')); fireEvent.press(view.getByText('Save role'));
  await waitFor(() => expect(setRole).toHaveBeenCalledWith(MEMBER.profile_id, 'event_manager'));
});

it('never substitutes a same-email person when the exact ID is absent', async () => {
  list.mockResolvedValue([{ ...MEMBER, profile_id: CURRENT.profile_id }]);
  const view = render(<OrganisationMemberRoleScreen />);
  await view.findByText('Couldn’t confirm this person');
  expect(view.getByText(/bounded results/)).toBeTruthy(); expect(view.queryByText('Save role')).toBeNull();
  expect(setRole).not.toHaveBeenCalled();
});

it('denies an old church selection before any lookup or mutation', () => {
  mockParams = { profileId: MEMBER.profile_id, organisationId: 'another-church' };
  const view = render(<OrganisationMemberRoleScreen />); expect(view.getByText('Different church')).toBeTruthy(); expect(list).not.toHaveBeenCalled();
});

it('blocks every final-effective-admin demotion option with matching accessible state', async () => {
  list.mockResolvedValue([{ ...MEMBER, role: 'church_admin', is_last_church_admin: true }]);
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Final church admin');
  for (const role of ['general_member', 'event_manager', 'announcement_manager']) {
    const radio = view.getByTestId(`organisation-role-${role}`);
    expect(radio.props.accessibilityState.disabled).toBe(true); expect(ariaRole(view, role).props['aria-disabled']).toBe(true);
    fireEvent.press(radio);
  }
  expect(view.queryByText('Save role')).toBeNull(); expect(setRole).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Open Members to appoint another church admin' }));
  expect(mockReplace).toHaveBeenCalledWith('/organisations/members');
});

it('keeps a full long identity in body text and a short role heading and promotion title', async () => {
  const name = 'Ruth Alexandra Johnson Adeyemi Thompson of the Northside Community';
  const email = 'ruth.alexandra.johnson.adeyemi.thompson@example.church';
  list.mockResolvedValue([{ ...MEMBER, full_name: name, email }]);
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText(name);
  expect(view.getByText(name).props.accessibilityRole).not.toBe('header');
  expect(view.getByText(email)).toBeTruthy(); expect(view.getByText('Church role').props.accessibilityRole).toBe('header');
  fireEvent.press(view.getByTestId('organisation-role-church_admin')); fireEvent.press(view.getByText('Save role'));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Make church admin?', message: expect.stringContaining(`${name}\n${email}\nGrace Church`), returnFocusRef: expect.any(Object),
  })));
});

it('guards duplicate submits and offers Done after a confirmed save', async () => {
  const save = deferred<{ profile_id: string; role: 'event_manager' }>(); setRole.mockReturnValue(save.promise);
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Ruth Johnson');
  fireEvent.press(view.getByTestId('organisation-role-event_manager'));
  fireEvent.press(view.getByText('Save role')); fireEvent.press(view.getByText('Save role'));
  expect(setRole).toHaveBeenCalledTimes(1);
  await act(async () => save.resolve({ profile_id: MEMBER.profile_id, role: 'event_manager' }));
  await view.findByText('Role saved'); expect(refreshTeams).toHaveBeenCalledWith({ quiet: true });
  fireEvent.press(view.getByText('Done')); expect(mockBack).toHaveBeenCalled();
});

it('confirms high-privilege promotion and describes self-demotion accurately', async () => {
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Ruth Johnson');
  fireEvent.press(view.getByTestId('organisation-role-church_admin')); fireEvent.press(view.getByText('Save role'));
  await waitFor(() => expect(setRole).toHaveBeenCalledWith(MEMBER.profile_id, 'church_admin'));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Make church admin?', message: expect.stringContaining('Ruth Johnson\nruth@example.church\nGrace Church') }));
  view.unmount(); jest.clearAllMocks(); mockParams = { profileId: CURRENT.profile_id }; list.mockResolvedValue([CURRENT]);
  const own = render(<OrganisationMemberRoleScreen />); await own.findByText('Daniel Okafor');
  fireEvent.press(own.getByTestId('organisation-role-general_member')); fireEvent.press(own.getByText('Save role'));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('You will no longer be able to manage members') })));
});

it('retains the draft across same-account refresh and checks a changed final-admin flag', async () => {
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Ruth Johnson');
  fireEvent.press(view.getByTestId('organisation-role-event_manager'));
  auth.mockReturnValue(adminAuth(ADMIN, { accountStatus: 'loading' })); view.rerender(<OrganisationMemberRoleScreen />);
  expect(ariaRole(view, 'event_manager').props['aria-checked']).toBe(true);
  expect(view.getByRole('button', { name: 'Save role' }).props.accessibilityState.disabled).toBe(true);
  list.mockResolvedValue([{ ...MEMBER, role: 'church_admin', is_last_church_admin: true }]);
  auth.mockReturnValue(adminAuth()); view.rerender(<OrganisationMemberRoleScreen />); await view.findByText('Final church admin');
  expect(view.queryByText('Save role')).toBeNull(); expect(setRole).not.toHaveBeenCalled();
});

it('shows a confirmed save even when directory refresh fails or self-demotion removes management', async () => {
  refreshTeams.mockRejectedValue(new Error('read failed'));
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Ruth Johnson');
  fireEvent.press(view.getByTestId('organisation-role-event_manager')); fireEvent.press(view.getByText('Save role'));
  await view.findByText('Couldn’t refresh church access'); expect(view.getByText('Role saved')).toBeTruthy();
  const demoted = { ...ADMIN, orgRole: 'general_member' as const };
  requiredUser.mockReturnValue(demoted); auth.mockReturnValue(adminAuth(demoted)); view.rerender(<OrganisationMemberRoleScreen />);
  expect(view.getByText('Role saved')).toBeTruthy(); expect(view.queryByText('No permission')).toBeNull();
  fireEvent.press(view.getByText('Done')); expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
});

it('uses outcome-uncertain recovery and keeps the role choice after an unknown save failure', async () => {
  setRole.mockRejectedValue(new Error('We couldn’t reach the server.'));
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Ruth Johnson');
  fireEvent.press(view.getByTestId('organisation-role-event_manager')); fireEvent.press(view.getByText('Save role'));
  await view.findByText('Couldn’t confirm role change'); expect(view.getByText(/may already be saved/)).toBeTruthy();
  expect(ariaRole(view, 'event_manager').props['aria-checked']).toBe(true);
});

it('fences confirmation after authority loss and ignores late saves after blur', async () => {
  const approval = deferred<boolean>(); confirm.mockReturnValue(approval.promise);
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Ruth Johnson');
  fireEvent.press(view.getByTestId('organisation-role-church_admin')); fireEvent.press(view.getByText('Save role'));
  const demoted = { ...ADMIN, orgRole: 'general_member' as const }; requiredUser.mockReturnValue(demoted); auth.mockReturnValue(adminAuth(demoted));
  view.rerender(<OrganisationMemberRoleScreen />); await act(async () => approval.resolve(true)); expect(setRole).not.toHaveBeenCalled();
});

it('ignores a role result after the screen loses focus', async () => {
  const save = deferred<{ profile_id: string; role: 'event_manager' }>(); setRole.mockReturnValue(save.promise);
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Ruth Johnson');
  fireEvent.press(view.getByTestId('organisation-role-event_manager')); fireEvent.press(view.getByText('Save role'));
  mockFocused = false; view.rerender(<OrganisationMemberRoleScreen />);
  await act(async () => save.resolve({ profile_id: MEMBER.profile_id, role: 'event_manager' }));
  expect(toast).not.toHaveBeenCalled(); expect(refreshTeams).not.toHaveBeenCalled(); expect(mockBack).not.toHaveBeenCalled();
});

it.each([REMOVED, DIRECTORY])('offers the exact $full_name invitation path instead of role writes', async (member) => {
  mockParams = { profileId: member.profile_id }; list.mockResolvedValue([member]);
  (useAppData as jest.Mock).mockReturnValue({ users: [memberProfile(member)], refreshTeams });
  const view = render(<OrganisationMemberRoleScreen />); await view.findByText('Role cannot be changed');
  fireEvent.press(view.getByText('Invite to church')); expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ targetProfileId: member.profile_id }) }));
  expect(setRole).not.toHaveBeenCalled();
});
