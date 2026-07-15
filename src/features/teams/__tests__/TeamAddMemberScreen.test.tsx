import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { SessionUser, Team, TeamMembership, UserProfile } from '../../../types';
import TeamAddMemberScreen from '../TeamAddMemberScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: '30000000-0000-4000-a000-000000000001' }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  useRequiredUser: jest.fn(),
}));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../../../components/TextField', () => {
  const React = jest.requireActual('react');
  const { TextInput } = jest.requireActual('react-native');
  return {
    TextField: ({ label, accessibilityLabel, ...props }: Record<string, unknown>) =>
      React.createElement(TextInput, {
        ...props,
        accessibilityLabel: accessibilityLabel ?? label,
      }),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseToast = useToast as jest.Mock;

const TEAM: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: '10000000-0000-4000-a000-000000000001',
  name: 'Choir',
  description: '',
  type: 'choir',
  avatar_url: null,
  archived_at: null,
  archived_by: null,
  created_at: '2026-07-11T00:00:00Z',
};

function person(id: string, name: string): UserProfile {
  return {
    id,
    auth_user_id: `90000000-0000-4000-a000-00000000000${id.slice(-1)}`,
    organisation_id: TEAM.organisation_id,
    full_name: name,
    email: `${name.split(' ')[0]?.toLowerCase()}@example.church`,
    phone: null,
    avatar_url: null,
    access_status: 'active',
    access_removed_at: null,
    access_removed_by: null,
    access_removal_reason: null,
    created_at: '2026-07-11T00:00:00Z',
  };
}

const LEADER = person('20000000-0000-4000-a000-000000000001', 'Sarah Williams');
const CANDIDATE = person('20000000-0000-4000-a000-000000000002', 'Ruth Johnson');
const LEADER_MEMBERSHIP: TeamMembership = {
  id: '40000000-0000-4000-a000-000000000001',
  team_id: TEAM.id,
  user_id: LEADER.id,
  role: 'team_leader',
  created_at: '2026-07-11T00:00:00Z',
};
const LEADER_SESSION: SessionUser = {
  profile: LEADER,
  orgRole: 'general_member',
  memberships: [LEADER_MEMBERSHIP],
  supabaseProfileId: LEADER.id,
};

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    organisation: { id: TEAM.organisation_id, name: 'Grace Community Church' },
    teams: [TEAM],
    users: [LEADER, CANDIDATE],
    memberships: [LEADER_MEMBERSHIP],
    teamsLive: true,
    teamsLoading: false,
    teamsError: null,
    refreshTeams: jest.fn(),
    getAvatarUri: jest.fn(),
    addTeamMember: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ authMode: 'supabase' });
  mockUseRequiredUser.mockReturnValue(LEADER_SESSION);
  mockUseToast.mockReturnValue(jest.fn());
  mockUseAppData.mockReturnValue(makeData());
});

describe('TeamAddMemberScreen', () => {
  it('shows only eligible profiles and a helpful no-candidate state', () => {
    const screen = render(<TeamAddMemberScreen />);
    expect(screen.getByText('Ruth Johnson')).toBeTruthy();
    expect(screen.queryAllByText('Sarah Williams')).toHaveLength(0);

    mockUseAppData.mockReturnValue(
      makeData({
        memberships: [
          LEADER_MEMBERSHIP,
          { ...LEADER_MEMBERSHIP, id: 'm-ruth', user_id: CANDIDATE.id, role: 'member' },
        ],
      }),
    );
    screen.rerender(<TeamAddMemberScreen />);
    expect(screen.getByText('Everyone is already added')).toBeTruthy();
  });

  it('filters with a visible search field and handles no matches', () => {
    const screen = render(<TeamAddMemberScreen />);
    fireEvent.changeText(screen.getByLabelText('Search people'), ' nobody ');
    expect(screen.getByText('No matching people')).toBeTruthy();
  });

  it('prevents double submission while adding and updates after success', async () => {
    let resolveAdd: (() => void) | undefined;
    let data = makeData();
    const addTeamMember = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = () => {
            data = makeData({
              memberships: [
                LEADER_MEMBERSHIP,
                { ...LEADER_MEMBERSHIP, id: 'm-ruth', user_id: CANDIDATE.id, role: 'member' },
              ],
              addTeamMember,
            });
            mockUseAppData.mockReturnValue(data);
            resolve();
          };
        }),
    );
    data = makeData({ addTeamMember });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamAddMemberScreen />);
    fireEvent.press(screen.getByText('Add'));
    fireEvent.press(screen.getByText('Add'));
    expect(addTeamMember).toHaveBeenCalledTimes(1);
    expect(addTeamMember).toHaveBeenCalledWith(TEAM.id, CANDIDATE.id);
    resolveAdd?.();
    await waitFor(() => expect(addTeamMember).toHaveBeenCalledTimes(1));
    screen.rerender(<TeamAddMemberScreen />);
    expect(screen.queryByText('Ruth Johnson')).toBeNull();
    expect(screen.getByText('Everyone is already added')).toBeTruthy();
  });

  it('keeps the candidate visible and shows a friendly error on failure', async () => {
    const addTeamMember = jest.fn().mockRejectedValue(new Error('Please try again later.'));
    mockUseAppData.mockReturnValue(makeData({ addTeamMember }));
    const screen = render(<TeamAddMemberScreen />);
    fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(screen.getByText('Please try again later.')).toBeTruthy());
    expect(screen.getByText('Ruth Johnson')).toBeTruthy();
  });

  it('blocks ordinary members and demo mode without calling the service', () => {
    const addTeamMember = jest.fn();
    mockUseRequiredUser.mockReturnValue({ ...LEADER_SESSION, memberships: [] });
    mockUseAppData.mockReturnValue(makeData({ addTeamMember }));
    const screen = render(<TeamAddMemberScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
    expect(addTeamMember).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({ authMode: 'demo' });
    mockUseRequiredUser.mockReturnValue(LEADER_SESSION);
    mockUseAppData.mockReturnValue(makeData({ teamsLive: false, addTeamMember }));
    screen.rerender(<TeamAddMemberScreen />);
    expect(screen.getByText('Adding members is unavailable in demo mode')).toBeTruthy();
    expect(addTeamMember).not.toHaveBeenCalled();
  });
});
