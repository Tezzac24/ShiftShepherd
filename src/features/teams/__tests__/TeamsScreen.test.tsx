import { fireEvent, render } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { SessionUser, UserProfile } from '../../../types';
import TeamsScreen from '../TeamsScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  useRequiredUser: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;

const PROFILE: UserProfile = {
  id: '20000000-0000-4000-a000-000000000001',
  auth_user_id: '90000000-0000-4000-a000-000000000001',
  organisation_id: '10000000-0000-4000-a000-000000000001',
  full_name: 'Church Admin',
  email: 'admin@example.church',
  phone: null,
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removed_by: null,
  access_removal_reason: null,
  created_at: '',
};

function session(role: SessionUser['orgRole']): SessionUser {
  return { profile: PROFILE, orgRole: role, memberships: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  const user = session('church_admin');
  mockUseRequiredUser.mockReturnValue(user);
  mockUseAuth.mockReturnValue({
    user,
    authMode: 'supabase',
    accountStatus: 'ready',
    isLoading: false,
  });
  mockUseAppData.mockReturnValue({
    teams: [],
    archivedTeams: [],
    teamsLoading: false,
    teamsError: null,
    refreshTeams: jest.fn(),
    rotaEntries: [],
    chatMessages: [],
    unreadByTeam: {},
    users: [PROFILE],
    getTeamAvatarUri: jest.fn(),
  });
});

describe('TeamsScreen lifecycle entry points', () => {
  it('shows an accessible New team action to a resolved church admin', () => {
    const screen = render(<TeamsScreen />);
    fireEvent.press(screen.getByLabelText('New team'));
    expect(mockPush).toHaveBeenCalledWith('/teams/new');
    expect(screen.getByLabelText('Archived teams')).toBeTruthy();
  });

  it('hides lifecycle actions from a general member', () => {
    const user = session('general_member');
    mockUseRequiredUser.mockReturnValue(user);
    mockUseAuth.mockReturnValue({
      user,
      authMode: 'supabase',
      accountStatus: 'ready',
      isLoading: false,
    });
    const screen = render(<TeamsScreen />);
    expect(screen.queryByLabelText('New team')).toBeNull();
    expect(screen.queryByLabelText('Archived teams')).toBeNull();
  });

  it('does not briefly show lifecycle actions while live authority is unresolved', () => {
    const user = session('church_admin');
    mockUseAuth.mockReturnValue({
      user,
      authMode: 'supabase',
      accountStatus: 'loading',
      isLoading: false,
    });
    const screen = render(<TeamsScreen />);
    expect(screen.queryByLabelText('New team')).toBeNull();
    expect(screen.queryByLabelText('Archived teams')).toBeNull();
  });
});
