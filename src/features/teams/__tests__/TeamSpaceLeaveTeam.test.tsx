import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../../lib/auth/AuthContext';
import { SessionUser, Team, TeamMembership, UserProfile } from '../../../types';
import TeamSpaceScreen from '../TeamSpaceScreen';
import { useTeamAvatar } from '../useTeamAvatar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: '30000000-0000-4000-a000-000000000001' }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useRequiredUser: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../useTeamAvatar', () => ({ useTeamAvatar: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseConfirm = useConfirm as jest.Mock;
const mockUseToast = useToast as jest.Mock;
const mockUseTeamAvatar = useTeamAvatar as jest.Mock;

const TEAM: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: '10000000-0000-4000-a000-000000000001',
  name: 'Choir',
  description: 'Leading worship each Sunday.',
  type: 'choir',
  avatar_url: null,
  created_at: '',
};
const PROFILE: UserProfile = {
  id: '20000000-0000-4000-a000-000000000001',
  auth_user_id: '90000000-0000-4000-a000-000000000001',
  organisation_id: TEAM.organisation_id,
  full_name: 'Hannah Adeyemi',
  email: 'hannah@example.church',
  phone: null,
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removed_by: null,
  access_removal_reason: null,
  created_at: '',
};

function membership(role: TeamMembership['role'] = 'member'): TeamMembership {
  return {
    id: '40000000-0000-4000-a000-000000000001',
    team_id: TEAM.id,
    user_id: PROFILE.id,
    role,
    created_at: '',
  };
}

function session(row: TeamMembership, orgRole: SessionUser['orgRole'] = 'general_member') {
  return { profile: PROFILE, orgRole, memberships: [row], supabaseProfileId: PROFILE.id };
}

function makeData(row: TeamMembership, overrides: Record<string, unknown> = {}) {
  return {
    teams: [TEAM],
    users: [PROFILE],
    memberships: [row],
    teamsLoading: false,
    teamsError: null,
    refreshTeams: jest.fn(),
    rotaEntries: [],
    rotaAssignments: [],
    availabilityResponses: [],
    rotasLoading: false,
    rotasError: null,
    refreshRotas: jest.fn(),
    announcements: [],
    announcementsLoading: false,
    songs: [],
    songsLoading: false,
    songsError: null,
    songSelections: [],
    unreadByTeam: {},
    getAnnouncementImageUri: jest.fn(),
    getTeamAvatarUri: jest.fn(),
    leaveTeam: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  const row = membership();
  mockUseRequiredUser.mockReturnValue(session(row));
  mockUseAppData.mockReturnValue(makeData(row));
  mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
  mockUseToast.mockReturnValue(jest.fn());
  mockUseTeamAvatar.mockReturnValue({ canManage: false, avatarUri: undefined });
});

describe('TeamSpaceScreen Leave Team', () => {
  it('gives every ordinary member a discoverable action without admin controls', () => {
    const screen = render(<TeamSpaceScreen />);
    expect(screen.getByLabelText('Leave Choir')).toBeTruthy();
    expect(screen.queryByTestId('team-settings-action')).toBeNull();
    expect(screen.queryByText('Leader Actions')).toBeNull();
  });

  it('cancels without calling the service', async () => {
    const row = membership();
    const leaveTeam = jest.fn();
    mockUseAppData.mockReturnValue(makeData(row, { leaveTeam }));
    const confirm = jest.fn().mockResolvedValue(false);
    mockUseConfirm.mockReturnValue(confirm);
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(leaveTeam).not.toHaveBeenCalled();
  });

  it('prevents repeated submission while Leave Team is pending', async () => {
    let resolveLeave!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveLeave = resolve;
    });
    const row = membership();
    const leaveTeam = jest.fn().mockReturnValue(pending);
    mockUseAppData.mockReturnValue(makeData(row, { leaveTeam }));
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    await waitFor(() => expect(leaveTeam).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    expect(leaveTeam).toHaveBeenCalledTimes(1);
    await act(async () => resolveLeave());
  });

  it('shows final-admin guidance and keeps Leave disabled', () => {
    const row = membership('team_leader');
    mockUseRequiredUser.mockReturnValue(session(row));
    const leaveTeam = jest.fn();
    mockUseAppData.mockReturnValue(makeData(row, { leaveTeam }));
    const screen = render(<TeamSpaceScreen />);
    expect(
      screen.getByText('Another team admin must be appointed before you can leave.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Leave Choir').props.accessibilityState.disabled).toBe(true);
    expect(leaveTeam).not.toHaveBeenCalled();
  });

  it('updates through the service and navigates to a safe screen after success', async () => {
    const row = membership();
    const leaveTeam = jest.fn().mockResolvedValue(undefined);
    mockUseAppData.mockReturnValue(makeData(row, { leaveTeam }));
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    await waitFor(() => expect(leaveTeam).toHaveBeenCalledWith(TEAM.id));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });

  it('shows a safe no-access state after a remote membership refresh removes access', () => {
    const row = membership();
    mockUseRequiredUser.mockReturnValue({ ...session(row), memberships: [] });
    mockUseAppData.mockReturnValue(makeData(row, { memberships: [] }));
    const screen = render(<TeamSpaceScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
    expect(screen.queryByLabelText('Leave Choir')).toBeNull();
  });
});
