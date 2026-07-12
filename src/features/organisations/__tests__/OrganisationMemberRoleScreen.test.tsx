import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import {
  listOrganisationMembers,
  setOrganisationMemberRole,
} from '../../../lib/supabase/services/organisationMemberships';
import { OrganisationMemberSummary, SessionUser } from '../../../types';
import OrganisationMemberRoleScreen from '../OrganisationMemberRoleScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ profileId: '20000000-0000-4000-a000-000000000002' }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  useRequiredUser: jest.fn(),
}));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../../../lib/supabase/services/organisationMemberships', () => ({
  listOrganisationMembers: jest.fn(),
  setOrganisationMemberRole: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseConfirm = useConfirm as jest.Mock;
const mockUseToast = useToast as jest.Mock;
const mockList = listOrganisationMembers as jest.Mock;
const mockSetRole = setOrganisationMemberRole as jest.Mock;

const PROFILE_ID = '20000000-0000-4000-a000-000000000002';
const MEMBER: OrganisationMemberSummary = {
  profile_id: PROFILE_ID,
  full_name: 'Ruth Johnson',
  email: 'ruth@example.church',
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removal_reason: null,
  linked: true,
  role: 'general_member',
  team_count: 0,
  pending_invitation_status: null,
  is_current_user: false,
  is_last_church_admin: false,
};
const ADMIN = {
  profile: {
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
  },
  orgRole: 'church_admin',
  memberships: [],
  supabaseProfileId: '20000000-0000-4000-a000-000000000001',
} satisfies SessionUser;

function setup(member = MEMBER, role: SessionUser['orgRole'] = 'church_admin') {
  const refreshTeams = jest.fn().mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({ authMode: 'supabase' });
  mockUseRequiredUser.mockReturnValue({ ...ADMIN, orgRole: role });
  mockUseAppData.mockReturnValue({ refreshTeams });
  mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
  mockUseToast.mockReturnValue(jest.fn());
  mockList.mockResolvedValue([member]);
  mockSetRole.mockResolvedValue({ profile_id: PROFILE_ID, role: 'event_manager' });
  return { refreshTeams };
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

it('renders only the supported roles with clear baseline and privilege descriptions', async () => {
  const screen = render(<OrganisationMemberRoleScreen />);
  await waitFor(() => expect(screen.getByText('Role for Ruth Johnson')).toBeTruthy());
  for (const label of ['Church Member', 'Announcement Manager', 'Event Manager', 'Church Admin']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.getByText('High privilege')).toBeTruthy();
  expect(screen.getByText(/baseline role and cannot be removed/i)).toBeTruthy();
});

it('blocks every final-admin demotion option with an accessible explanation', async () => {
  setup({ ...MEMBER, role: 'church_admin', is_last_church_admin: true });
  const screen = render(<OrganisationMemberRoleScreen />);
  await waitFor(() => expect(screen.getAllByText(/final church admin/i).length).toBeGreaterThan(0));
  expect(screen.getByTestId('organisation-role-general_member').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('organisation-role-church_admin').props.accessibilityState.checked).toBe(true);
});

it('prevents duplicate submission and refreshes the canonical directory after a role change', async () => {
  const { refreshTeams } = setup();
  let resolve!: (value: unknown) => void;
  mockSetRole.mockReturnValue(new Promise((done) => { resolve = done; }));
  const screen = render(<OrganisationMemberRoleScreen />);
  await waitFor(() => expect(screen.getByText('Role for Ruth Johnson')).toBeTruthy());
  fireEvent.press(screen.getByTestId('organisation-role-event_manager'));
  fireEvent.press(screen.getByText('Save role'));
  fireEvent.press(screen.getByText('Save role'));
  expect(mockSetRole).toHaveBeenCalledTimes(1);
  resolve({ profile_id: PROFILE_ID, role: 'event_manager' });
  await waitFor(() => expect(refreshTeams).toHaveBeenCalledWith({ quiet: true }));
  expect(mockBack).toHaveBeenCalled();
});

it('requires deliberate confirmation for church-admin promotion', async () => {
  setup();
  const screen = render(<OrganisationMemberRoleScreen />);
  await waitFor(() => expect(screen.getByText('Role for Ruth Johnson')).toBeTruthy());
  fireEvent.press(screen.getByTestId('organisation-role-church_admin'));
  fireEvent.press(screen.getByText('Save role'));
  await waitFor(() => expect(mockSetRole).toHaveBeenCalledWith(PROFILE_ID, 'church_admin'));
  expect(mockUseConfirm()).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Make Ruth Johnson a church admin?',
    confirmLabel: 'Make church admin',
  }));
});

it('locks non-admin direct routes and removed/unlinked targets', async () => {
  setup(MEMBER, 'general_member');
  const locked = render(<OrganisationMemberRoleScreen />);
  expect(locked.getByText('No permission')).toBeTruthy();
  locked.unmount();

  setup({ ...MEMBER, access_status: 'removed', role: null });
  const removed = render(<OrganisationMemberRoleScreen />);
  await waitFor(() => expect(removed.getByText('Role cannot be changed')).toBeTruthy());
  expect(removed.getByText(/Invite them again/i)).toBeTruthy();
});

