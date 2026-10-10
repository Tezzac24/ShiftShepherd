import { fireEvent, render } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { SessionUser, Team, UserProfile } from '../../../types';
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

const TEAM: Team = {
  id: 'choir', organisation_id: PROFILE.organisation_id, name: 'Choir', description: 'Singing together',
  type: 'choir', avatar_url: null, archived_at: null, archived_by: null, created_at: '',
};
const OWN_MEMBERSHIP = { id: 'membership', team_id: TEAM.id, user_id: PROFILE.id, role: 'member' as const, created_at: '' };

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
    organisation: { id: PROFILE.organisation_id, name: 'Test Church' },
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
    fireEvent.press(screen.getByLabelText('Manage teams'));
    expect(screen.getByLabelText('Archived teams')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('New team'));
    expect(mockPush).toHaveBeenCalledWith('/teams/new');
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
    expect(screen.queryByLabelText('All teams')).toBeNull();
  });
});

describe('Teams directory presentation', () => {
  it('adds useful context for small collections, without showing it during refresh failure or for a long directory', () => {
    const data = mockUseAppData();
    data.teams = [TEAM];
    mockUseRequiredUser.mockReturnValue({ ...session('general_member'), memberships: [OWN_MEMBERSHIP] });
    const screen = render(<TeamsScreen />);
    expect(screen.queryByText('Singing together')).toBeNull();
    expect(screen.getByRole('header', { name: 'Your team space' })).toBeTruthy();
    data.teamsError = 'Reconnect';
    screen.rerender(<TeamsScreen />);
    expect(screen.queryByText('Your team space')).toBeNull();
    data.teamsError = null;
    data.teams = Array.from({ length: 6 }, (_, i) => ({ ...TEAM, id: `team-${i}`, name: `Team ${i}` }));
    mockUseRequiredUser.mockReturnValue(session('church_admin'));
    screen.rerender(<TeamsScreen />);
    fireEvent.press(screen.getByLabelText('All teams'));
    fireEvent.changeText(screen.getByLabelText('Search teams'), 'Team 1');
    expect(screen.getByText('Team 1')).toBeTruthy();
    expect(screen.queryByText('Your team space')).toBeNull();
    expect(screen.queryByText('Singing together')).toBeNull();
  });

  it('separates an admin’s real memberships from accessible teams and excludes archived/other-church rows', () => {
    mockUseRequiredUser.mockReturnValue({ ...session('church_admin'), memberships: [OWN_MEMBERSHIP] });
    const data = mockUseAppData();
    data.teams = [TEAM, { ...TEAM, id: 'media', name: 'Media' },
      { ...TEAM, id: 'other', name: 'Other church choir', organisation_id: 'elsewhere' },
      { ...TEAM, id: 'archived', name: 'Old choir', archived_at: '2026-09-01' }];
    const screen = render(<TeamsScreen />);
    expect(screen.getByText('Choir')).toBeTruthy();
    expect(screen.queryByText('Media')).toBeNull();
    expect(screen.getByLabelText('My teams').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText('All teams'));
    expect(screen.getByText('Media')).toBeTruthy();
    expect(screen.getByText('Not on this team')).toBeTruthy();
    expect(screen.queryByText('Other church choir')).toBeNull();
    expect(screen.queryByText('Old choir')).toBeNull();
    expect(screen.getByLabelText('All teams').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('2 teams')).toBeTruthy();
  });

  it('does not offer discovery or management to a normal member', () => {
    const user = { ...session('general_member'), memberships: [OWN_MEMBERSHIP] };
    mockUseRequiredUser.mockReturnValue(user);
    mockUseAuth.mockReturnValue({ user, authMode: 'demo' });
    mockUseAppData().teams = [TEAM, { ...TEAM, id: 'media', name: 'Media' }];
    const screen = render(<TeamsScreen />);
    expect(screen.getByText('Choir')).toBeTruthy();
    expect(screen.queryByText('Media')).toBeNull();
    expect(screen.queryByLabelText('All teams')).toBeNull();
    expect(screen.queryByLabelText('Manage teams')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^Choir\./ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]', params: { teamId: TEAM.id } });
  });

  it('searches the full accessible collection and reports the filtered count honestly', () => {
    mockUseAppData().teams = Array.from({ length: 40 }, (_, i) => ({ ...TEAM, id: `team-${i}`, name: `Team ${String(i).padStart(2, '0')}` }));
    const screen = render(<TeamsScreen />);
    fireEvent.press(screen.getByLabelText('All teams'));
    fireEvent.changeText(screen.getByLabelText('Search teams'), 'Team 39');
    expect(screen.getByText('Team 39')).toBeTruthy();
    expect(screen.getByText('1 of 40 teams')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search teams'), 'not a team');
    expect(screen.getByText('No matching teams')).toBeTruthy();
  });

  it('uses the signed avatar resolver and skips cancelled dates in its next-date context', () => {
    const data = mockUseAppData();
    data.teams = [TEAM];
    data.rotaEntries = [
      { id: 'cancelled', organisation_id: TEAM.organisation_id, team_id: TEAM.id, title: 'Cancelled rehearsal', date: '2099-01-01', status: 'cancelled' },
      { id: 'next', organisation_id: TEAM.organisation_id, team_id: TEAM.id, title: 'Sunday singing', date: '2099-01-02', status: 'active' },
    ];
    const screen = render(<TeamsScreen />);
    fireEvent.press(screen.getByLabelText('All teams'));
    expect(data.getTeamAvatarUri).toHaveBeenCalledWith(TEAM);
    expect(screen.getByText(/Sunday singing/)).toBeTruthy();
    expect(screen.queryByText(/Cancelled rehearsal/)).toBeNull();
  });

  it('distinguishes an unavailable directory from no membership and offers retry', () => {
    const data = mockUseAppData();
    data.teamsError = 'Try again when you are connected.';
    const screen = render(<TeamsScreen />);
    expect(screen.getByText("Couldn't load your teams")).toBeTruthy();
    expect(screen.queryByText('No teams to show')).toBeNull();
    fireEvent.press(screen.getByLabelText('Retry teams'));
    expect(data.refreshTeams).toHaveBeenCalledTimes(1);
  });

  it('keeps a loading directory distinct from an empty one', () => {
    mockUseAppData().teamsLoading = true;
    const screen = render(<TeamsScreen />);
    expect(screen.getByText('Loading your teams…')).toBeTruthy();
    expect(screen.queryByText('No teams to show')).toBeNull();
  });

  it('keeps Archived teams reachable from the contextual sheet', () => {
    const screen = render(<TeamsScreen />);
    fireEvent.press(screen.getByLabelText('Manage teams'));
    fireEvent.press(screen.getByLabelText('Archived teams'));
    expect(mockPush).toHaveBeenCalledWith('/teams/archived');
  });
});
