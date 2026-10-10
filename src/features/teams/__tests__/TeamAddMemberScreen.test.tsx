import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { SessionUser, Team, TeamMembership, UserProfile } from '../../../types';
import TeamAddMemberScreen from '../TeamAddMemberScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: '30000000-0000-4000-a000-000000000001' }),
  useRouter: () => ({ replace: mockReplace }),
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
  mockUseAuth.mockReturnValue({ authMode: 'supabase', accountStatus: 'ready', isLoading: false });
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

describe('TeamAddMemberScreen directory and scope states', () => {
  it('retries the named failure nearby, retains the search and guards duplicate retry taps while busy', async () => {
    let finish!: () => void;
    const addTeamMember = jest.fn().mockRejectedValueOnce(new Error('Try again later.'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    mockUseAppData.mockReturnValue(makeData({ addTeamMember }));
    const screen = render(<TeamAddMemberScreen />);
    fireEvent.changeText(screen.getByLabelText('Search people'), 'Ruth');
    fireEvent.press(screen.getByLabelText('Add Ruth Johnson'));
    await screen.findByText('Try again later.');
    fireEvent.press(screen.getByLabelText('Retry add'));
    expect(screen.getByLabelText('Retry add')).toBeDisabled();
    expect(screen.getByLabelText('Retry add').props.accessibilityState.busy).toBe(true);
    fireEvent.press(screen.getByLabelText('Retry add'));
    expect(addTeamMember).toHaveBeenCalledTimes(2);
    expect(addTeamMember.mock.calls).toEqual([[TEAM.id, CANDIDATE.id], [TEAM.id, CANDIDATE.id]]);
    expect(screen.getByLabelText('Search people').props.value).toBe('Ruth');
    await act(async () => finish());
    expect(screen.queryByLabelText('Retry add')).toBeNull();
    expect(screen.queryByText('Try again later.')).toBeNull();
  });

  it.each(['already-added', 'removed'])('does not offer retry once the failed target is %s', async (change) => {
    const addTeamMember = jest.fn().mockRejectedValue(new Error('Please try again.'));
    mockUseAppData.mockReturnValue(makeData({ addTeamMember }));
    const screen = render(<TeamAddMemberScreen />);
    fireEvent.press(screen.getByLabelText('Add Ruth Johnson'));
    await screen.findByLabelText('Retry add');
    mockUseAppData.mockReturnValue(makeData({ addTeamMember,
      ...(change === 'already-added' ? { memberships: [LEADER_MEMBERSHIP, { ...LEADER_MEMBERSHIP, id: 'added', user_id: CANDIDATE.id, role: 'member' }] }
        : { users: [LEADER, { ...CANDIDATE, access_status: 'removed' }] }),
    }));
    screen.rerender(<TeamAddMemberScreen />);
    expect(screen.queryByLabelText('Retry add')).toBeNull();
    expect(screen.queryByLabelText('Add Ruth Johnson')).toBeNull();
    expect(addTeamMember).toHaveBeenCalledTimes(1);
  });

  it('excludes unlinked, removed, existing and other-church profiles', () => {
    mockUseAppData.mockReturnValue(makeData({ users: [LEADER, CANDIDATE,
      { ...CANDIDATE, id: 'unlinked', full_name: 'Unlinked Person', auth_user_id: '' },
      { ...CANDIDATE, id: 'removed', full_name: 'Removed Person', access_status: 'removed' },
      { ...CANDIDATE, id: 'other', full_name: 'Other church Person', organisation_id: 'other-church' },
    ] }));
    const screen = render(<TeamAddMemberScreen />);
    expect(screen.getByLabelText(`Add ${CANDIDATE.full_name}`)).toBeTruthy();
    expect(screen.queryByText('Unlinked Person')).toBeNull();
    expect(screen.queryByText('Removed Person')).toBeNull();
    expect(screen.queryByText('Other church Person')).toBeNull();
    expect(screen.queryByText(LEADER.full_name)).toBeNull();
  });

  it('searches all eligible people and clears a no-match search', () => {
    const users = Array.from({ length: 120 }, (_, index) => ({ ...CANDIDATE, id: `person-${index}`, full_name: `Person ${String(index).padStart(3, '0')}` }));
    mockUseAppData.mockReturnValue(makeData({ users: [LEADER, ...users] }));
    const screen = render(<TeamAddMemberScreen />);
    fireEvent.changeText(screen.getByLabelText('Search people'), 'Person 119');
    expect(screen.getByLabelText('Add Person 119')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search people'), 'No matches');
    fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByLabelText('Search people').props.value).toBe('');
  });

  it('distinguishes loading and directory error from everyone being added', () => {
    const refreshTeams = jest.fn();
    mockUseAppData.mockReturnValue(makeData({ users: [], teamsLoading: true, refreshTeams }));
    const screen = render(<TeamAddMemberScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading your church directory…' })).toBeTruthy();
    expect(screen.queryByText('Everyone is already added')).toBeNull();
    mockUseAppData.mockReturnValue(makeData({ users: [], teamsError: 'Offline', refreshTeams }));
    screen.rerender(<TeamAddMemberScreen />);
    expect(screen.getByText("Couldn't load the directory")).toBeTruthy();
    expect(screen.queryByText('Everyone is already added')).toBeNull();
    fireEvent.press(screen.getByLabelText('Try Again'));
    expect(refreshTeams).toHaveBeenCalledTimes(1);
  });

  it.each(['other-church', 'archived'])('does not offer candidates for %s content', (kind) => {
    mockUseAppData.mockReturnValue(makeData({ teams: [{ ...TEAM,
      ...(kind === 'other-church' ? { organisation_id: 'other' } : { archived_at: '2026-09-20T00:00:00Z' }),
    }] }));
    const screen = render(<TeamAddMemberScreen />);
    expect(screen.queryByLabelText('Search people')).toBeNull();
    expect(screen.queryByLabelText(`Add ${CANDIDATE.full_name}`)).toBeNull();
    fireEvent.press(screen.getByLabelText('Back to teams'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });

  it('blocks the form while live authority is unresolved', () => {
    mockUseAuth.mockReturnValue({ authMode: 'supabase', accountStatus: 'loading' });
    const screen = render(<TeamAddMemberScreen />);
    expect(screen.getByText('Checking team permissions...')).toBeTruthy();
    expect(screen.queryByLabelText('Search people')).toBeNull();
  });

  it('guards same-frame Add calls and suppresses success after scope loss', async () => {
    let finish!: () => void;
    const addTeamMember = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const toast = jest.fn();
    mockUseToast.mockReturnValue(toast);
    mockUseAppData.mockReturnValue(makeData({ addTeamMember }));
    const screen = render(<TeamAddMemberScreen />);
    const button = screen.getByLabelText(`Add ${CANDIDATE.full_name}`);
    act(() => { fireEvent.press(button); fireEvent.press(button); });
    expect(addTeamMember).toHaveBeenCalledTimes(1);
    mockUseRequiredUser.mockReturnValue({ ...LEADER_SESSION, profile: { ...LEADER, organisation_id: 'other-church' } });
    screen.rerender(<TeamAddMemberScreen />);
    await act(async () => finish());
    expect(toast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns directly to the member list without changing membership', () => {
    const screen = render(<TeamAddMemberScreen />);
    fireEvent.press(screen.getByLabelText('Back to members'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/settings/members', params: { teamId: TEAM.id } });
    expect(mockUseAppData().addTeamMember).not.toHaveBeenCalled();
  });
});
