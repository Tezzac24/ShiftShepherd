import { fireEvent, render } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../../lib/auth/AuthContext';
import { Team } from '../../../types';
import TeamSettingsScreen from '../TeamSettingsScreen';
import { useTeamAvatar } from '../useTeamAvatar';

jest.mock('../useTeamAvatar', () => ({ useTeamAvatar: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: '30000000-0000-4000-a000-000000000001' }),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useRequiredUser: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseTeamAvatar = useTeamAvatar as jest.Mock;

const TEAM: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: 'org-live',
  name: 'Choir',
  description: 'Leading worship each Sunday.',
  type: 'choir',
  avatar_url: null,
  archived_at: null,
  archived_by: null,
  created_at: '2026-07-11T00:00:00Z',
};

function avatarState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    canManage: true,
    hasPhoto: false,
    avatarUri: undefined,
    busy: null,
    changePhoto: jest.fn(),
    removePhoto: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRequiredUser.mockReturnValue({ orgRole: 'church_admin' });
  mockUseAppData.mockReturnValue({
    teams: [TEAM],
    teamsLoading: false,
    memberships: [],
    users: [],
  });
  mockUseTeamAvatar.mockReturnValue(avatarState());
});

describe('TeamSettingsScreen', () => {
  it('shows Add photo when the team has no avatar', () => {
    const screen = render(<TeamSettingsScreen />);
    expect(screen.getByTestId('team-avatar-management-controls')).toBeTruthy();
    expect(screen.getByText('Add photo')).toBeTruthy();
    expect(screen.queryByText('Change photo')).toBeNull();
    expect(screen.queryByText('Remove photo')).toBeNull();
  });

  it('shows Change and Remove when the team already has a photo', () => {
    mockUseTeamAvatar.mockReturnValue(avatarState({ hasPhoto: true }));
    const screen = render(<TeamSettingsScreen />);
    expect(screen.getByText('Change photo')).toBeTruthy();
    expect(screen.getByText('Remove photo')).toBeTruthy();
    expect(screen.queryByText('Add photo')).toBeNull();
  });

  it('blocks unauthorised users from the management controls', () => {
    mockUseTeamAvatar.mockReturnValue(avatarState({ canManage: false }));
    mockUseRequiredUser.mockReturnValue({ orgRole: 'general_member' });
    const screen = render(<TeamSettingsScreen />);
    expect(screen.queryByTestId('team-avatar-management-controls')).toBeNull();
    expect(screen.queryByText('Manage members')).toBeNull();
    expect(screen.getByText('No permission')).toBeTruthy();
  });

  it('shows a calm Manage members row to authorised users', () => {
    const screen = render(<TeamSettingsScreen />);
    fireEvent.press(screen.getByText('Manage members'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/teams/[teamId]/settings/members',
      params: { teamId: TEAM.id },
    });
  });

  it('gives church admins a dedicated team-details lifecycle route', () => {
    const screen = render(<TeamSettingsScreen />);
    fireEvent.press(screen.getByText('Edit team details'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/teams/[teamId]/edit',
      params: { teamId: TEAM.id },
    });
  });

  it('does not give a team-scoped manager organisation lifecycle controls', () => {
    mockUseRequiredUser.mockReturnValue({ orgRole: 'general_member' });
    const screen = render(<TeamSettingsScreen />);
    expect(screen.queryByText('Edit team details')).toBeNull();
  });

  it('shows a friendly not-found state for an unknown team', () => {
    mockUseAppData.mockReturnValue({ teams: [], teamsLoading: false, memberships: [], users: [] });
    const screen = render(<TeamSettingsScreen />);
    expect(screen.getByText('Team not found')).toBeTruthy();
  });
});
