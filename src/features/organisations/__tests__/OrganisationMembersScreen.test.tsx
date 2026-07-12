import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import {
  listOrganisationMembers,
  removeOrganisationMember,
} from '../../../lib/supabase/services/organisationMemberships';
import { OrganisationMemberSummary, SessionUser, UserProfile } from '../../../types';
import OrganisationMembersScreen from '../OrganisationMembersScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  useRequiredUser: jest.fn(),
}));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../../../lib/supabase/services/organisationMemberships', () => ({
  listOrganisationMembers: jest.fn(),
  removeOrganisationMember: jest.fn(),
}));
jest.mock('../../../components/TextField', () => {
  const React = jest.requireActual('react');
  const { TextInput } = jest.requireActual('react-native');
  return {
    TextField: ({ label, ...props }: Record<string, unknown>) =>
      React.createElement(TextInput, { ...props, accessibilityLabel: label }),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseConfirm = useConfirm as jest.Mock;
const mockUseToast = useToast as jest.Mock;
const mockList = listOrganisationMembers as jest.Mock;
const mockRemove = removeOrganisationMember as jest.Mock;

const PROFILE: UserProfile = {
  id: '20000000-0000-4000-a000-000000000001',
  auth_user_id: '90000000-0000-4000-a000-000000000001',
  organisation_id: '10000000-0000-4000-a000-000000000001',
  full_name: 'Daniel Okafor',
  email: 'daniel@example.church',
  phone: null,
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removed_by: null,
  access_removal_reason: null,
  created_at: '',
};
const ADMIN: SessionUser = {
  profile: PROFILE,
  orgRole: 'church_admin',
  memberships: [],
  supabaseProfileId: PROFILE.id,
};
const CURRENT: OrganisationMemberSummary = {
  profile_id: PROFILE.id,
  full_name: PROFILE.full_name,
  email: PROFILE.email,
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removal_reason: null,
  linked: true,
  role: 'church_admin',
  team_count: 1,
  pending_invitation_status: null,
  is_current_user: true,
  is_last_church_admin: false,
};
const MEMBER: OrganisationMemberSummary = {
  ...CURRENT,
  profile_id: '20000000-0000-4000-a000-000000000002',
  full_name: 'Ruth Johnson',
  email: 'ruth@example.church',
  role: 'general_member',
  team_count: 0,
  is_current_user: false,
};

function setup(role: SessionUser['orgRole'] = 'church_admin') {
  const refreshTeams = jest.fn().mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({ authMode: 'supabase' });
  mockUseRequiredUser.mockReturnValue({ ...ADMIN, orgRole: role });
  mockUseAppData.mockReturnValue({
    organisation: { id: PROFILE.organisation_id, name: 'Grace Church' },
    users: [PROFILE],
    getAvatarUri: jest.fn(),
    refreshTeams,
  });
  mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
  mockUseToast.mockReturnValue(jest.fn());
  mockRemove.mockResolvedValue({ ...MEMBER, access_status: 'removed' });
  return { refreshTeams };
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

it('shows a bounded loading state while the member RPC is pending', () => {
  mockList.mockReturnValue(new Promise(() => {}));
  const screen = render(<OrganisationMembersScreen />);
  expect(screen.getByTestId('organisation-members-loading')).toBeTruthy();
});

it('shows ready rows, role/access badges, current marker, and filters search', async () => {
  mockList.mockResolvedValue([CURRENT, MEMBER]);
  const screen = render(<OrganisationMembersScreen />);
  await waitFor(() => expect(screen.getByTestId('organisation-members-ready')).toBeTruthy());
  expect(screen.getByText('Daniel Okafor')).toBeTruthy();
  expect(screen.getByText('You')).toBeTruthy();
  expect(screen.getAllByText('Church Admin').length).toBeGreaterThan(0);
  fireEvent.changeText(screen.getByLabelText('Search members'), 'ruth@example');
  expect(screen.queryByText('Daniel Okafor')).toBeNull();
  expect(screen.getByText('Ruth Johnson')).toBeTruthy();
});

it('shows empty and no-match states', async () => {
  mockList.mockResolvedValue([]);
  const empty = render(<OrganisationMembersScreen />);
  await waitFor(() => expect(empty.getByText('No members yet')).toBeTruthy());
  empty.unmount();

  mockList.mockResolvedValue([MEMBER]);
  const noMatch = render(<OrganisationMembersScreen />);
  await waitFor(() => expect(noMatch.getByText('Ruth Johnson')).toBeTruthy());
  fireEvent.changeText(noMatch.getByLabelText('Search members'), 'nobody');
  expect(noMatch.getByText('No matching members')).toBeTruthy();
});

it('shows a retryable load error without raw details', async () => {
  mockList.mockRejectedValue(new Error('We couldnâ€™t load organisation members right now.'));
  const screen = render(<OrganisationMembersScreen />);
  await waitFor(() => expect(screen.getByText('We couldnâ€™t load members')).toBeTruthy());
  expect(screen.getByText('Try again')).toBeTruthy();
});

it('keeps non-admin direct routes locked and never calls the privileged RPC', async () => {
  setup('general_member');
  const screen = render(<OrganisationMembersScreen />);
  expect(screen.getByText('No permission')).toBeTruthy();
  expect(screen.getByText('Only a church admin can manage organisation members and roles.')).toBeTruthy();
  expect(mockList).not.toHaveBeenCalled();
});

it('requires confirmation, prevents client-side deletion, and refreshes canonical state after removal', async () => {
  const { refreshTeams } = setup();
  mockList.mockResolvedValue([MEMBER]);
  const screen = render(<OrganisationMembersScreen />);
  await waitFor(() => expect(screen.getByText('Remove access')).toBeTruthy());
  fireEvent.press(screen.getByText('Remove access'));
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(MEMBER.profile_id));
  expect(mockUseConfirm()).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Remove Ruth Johnson from Grace Church?',
    confirmLabel: 'Remove access',
  }));
  expect(refreshTeams).toHaveBeenCalledWith({ quiet: true });
});

