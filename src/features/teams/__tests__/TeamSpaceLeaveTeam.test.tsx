import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
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
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../useTeamAvatar', () => ({ useTeamAvatar: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
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
  archived_at: null,
  archived_by: null,
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
    archivedTeams: [],
    users: [PROFILE],
    memberships: [row],
    teamsLoading: false,
    teamsLive: true,
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
    announcementsError: null,
    refreshAnnouncements: jest.fn(),
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
  mockUseAuth.mockReturnValue({ authMode: 'supabase' });
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

  it('keeps demo membership readable and never calls a live leave mutation', () => {
    mockUseAuth.mockReturnValue({ authMode: 'demo' });
    const data = makeData(membership(), { teamsLive: false });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamSpaceScreen />);
    expect(screen.getByLabelText('Leave Choir').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    expect(data.leaveTeam).not.toHaveBeenCalled();
    expect(screen.getByText('Membership changes are unavailable in demo mode.')).toBeTruthy();
  });

  it('explains retained church-admin access when that admin leaves a membership', async () => {
    mockUseRequiredUser.mockReturnValue(session(membership(), 'church_admin'));
    const confirm = jest.fn().mockResolvedValue(false);
    mockUseConfirm.mockReturnValue(confirm);
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0].message).toContain('church-admin role, account and organisation access will stay in place');
    expect(confirm.mock.calls[0][0].returnFocusRef).toBeTruthy();
  });

  it('still exits safely when its own successful leave removes the readable content', async () => {
    let resolveLeave!: () => void;
    const leaveTeam = jest.fn().mockReturnValue(new Promise<void>((resolve) => { resolveLeave = resolve; }));
    const row = membership();
    mockUseAppData.mockReturnValue(makeData(row, { leaveTeam }));
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    await waitFor(() => expect(leaveTeam).toHaveBeenCalledTimes(1));
    mockUseRequiredUser.mockReturnValue({ ...session(row), memberships: [] });
    mockUseAppData.mockReturnValue(makeData(row, { memberships: [], leaveTeam }));
    screen.rerender(<TeamSpaceScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
    await act(async () => resolveLeave());
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });

  it('does not navigate a new account scope when an old leave request finishes', async () => {
    let resolveLeave!: () => void;
    const leaveTeam = jest.fn().mockReturnValue(new Promise<void>((resolve) => { resolveLeave = resolve; }));
    const row = membership();
    mockUseAppData.mockReturnValue(makeData(row, { leaveTeam }));
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Leave Choir'));
    await waitFor(() => expect(leaveTeam).toHaveBeenCalledTimes(1));
    mockUseRequiredUser.mockReturnValue({ ...session(row), profile: { ...PROFILE, id: 'new-profile' }, memberships: [] });
    screen.rerender(<TeamSpaceScreen />);
    await act(async () => resolveLeave());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('Team hub tools and states', () => {
  it('puts Members directly on the hub alongside Chat, Rota and choir Songs', () => {
    const screen = render(<TeamSpaceScreen />);
    for (const label of ['Chat', 'Rota', 'Members', 'Songs']) expect(screen.getByLabelText(label)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Members'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/settings/members', params: { teamId: TEAM.id } });
    expect(screen.queryByText('Team Resources')).toBeNull();
    expect(screen.queryByText('Hannah')).toBeNull();
  });

  it('does not offer Songs on a generic team', () => {
    mockUseAppData.mockReturnValue(makeData(membership(), { teams: [{ ...TEAM, type: 'generic' }] }));
    const screen = render(<TeamSpaceScreen />);
    expect(screen.queryByLabelText('Songs')).toBeNull();
  });

  it('keeps all existing leader actions and lifecycle destinations in a labelled Manage sheet', () => {
    const row = membership('team_leader');
    mockUseRequiredUser.mockReturnValue(session(row, 'church_admin'));
    mockUseAppData.mockReturnValue(makeData(row));
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Manage team'));
    expect(screen.getByText('Plan the month')).toBeTruthy();
    expect(screen.getByText('Post team announcement')).toBeTruthy();
    expect(screen.getByText('Manage members')).toBeTruthy();
    expect(screen.getByText('Edit team details')).toBeTruthy();
    expect(screen.queryByText('Team settings')).toBeNull();
    fireEvent.press(screen.getByText('Plan the month'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/plan-month', params: { teamId: TEAM.id } });
  });

  it('offers Team photo through the retained settings route when the avatar hook grants live capability', () => {
    const row = membership('team_leader');
    mockUseRequiredUser.mockReturnValue(session(row));
    mockUseAppData.mockReturnValue(makeData(row));
    mockUseTeamAvatar.mockReturnValue({ canManage: true, avatarUri: undefined });
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Manage team'));
    expect(screen.getByRole('header', { name: 'Manage team' })).toBeTruthy();
    expect(screen.queryByText('Team settings')).toBeNull();
    fireEvent.press(screen.getByText('Team photo'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/settings', params: { teamId: TEAM.id } });
  });

  it.each(['demo', 'supabase'])('omits the photo destination when its capability is unavailable in %s', (authMode) => {
    const row = membership('team_leader');
    mockUseAuth.mockReturnValue({ authMode });
    mockUseRequiredUser.mockReturnValue(session(row, 'church_admin'));
    mockUseAppData.mockReturnValue(makeData(row, { teamsLive: authMode === 'supabase' }));
    mockUseTeamAvatar.mockReturnValue({ canManage: false, avatarUri: undefined });
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('Manage team'));
    expect(screen.queryByText('Team photo')).toBeNull();
    expect(screen.queryByText('Team settings')).toBeNull();
    expect(screen.getByText('Plan the month')).toBeTruthy();
    expect(screen.getByText('Post team announcement')).toBeTruthy();
    expect(screen.getByText('Edit team details')).toBeTruthy();
  });

  it('does not convert announcement read failure into an empty team', () => {
    const data = makeData(membership(), { announcementsError: 'Connection interrupted.' });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamSpaceScreen />);
    expect(screen.getByText("Couldn't load team announcements")).toBeTruthy();
    expect(screen.queryByText('No team announcements yet.')).toBeNull();
    fireEvent.press(screen.getByLabelText('Retry announcements'));
    expect(data.refreshAnnouncements).toHaveBeenCalledTimes(1);
  });

  it('labels the existing unfiltered announcement destination honestly', () => {
    const screen = render(<TeamSpaceScreen />);
    fireEvent.press(screen.getByLabelText('All announcements'));
    expect(mockPush).toHaveBeenCalledWith('/announcements');
    expect(screen.queryByText('All team announcements')).toBeNull();
  });

  it('retains every role on the next date and the existing response destination', () => {
    mockUseAppData.mockReturnValue(makeData(membership(), {
      rotaEntries: [{ id: 'date', team_id: TEAM.id, organisation_id: TEAM.organisation_id, title: 'Sunday service', date: '2099-01-04', time: '10:00', status: 'active' }],
      rotaAssignments: [
        { id: 'praise', rota_entry_id: 'date', user_id: PROFILE.id, role_name: 'Praise Leader' },
        { id: 'worship', rota_entry_id: 'date', user_id: PROFILE.id, role_name: 'Worship Leader' },
      ],
    }));
    const screen = render(<TeamSpaceScreen />);
    expect(screen.getByText('You: Praise Leader & Worship Leader')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Confirm availability'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: TEAM.id, entryId: 'date' } });
  });

  it('never opens archived content, even when an archived row remains in the active collection', () => {
    const row = membership('team_leader');
    mockUseRequiredUser.mockReturnValue(session(row, 'church_admin'));
    mockUseAppData.mockReturnValue(makeData(row, { teams: [{ ...TEAM, archived_at: '2026-09-01' }] }));
    const screen = render(<TeamSpaceScreen />);
    expect(screen.getByText('Team is archived')).toBeTruthy();
    expect(screen.queryByLabelText('Chat')).toBeNull();
    expect(screen.queryByLabelText('Manage team')).toBeNull();
    fireEvent.press(screen.getByLabelText('View archived teams'));
    expect(mockReplace).toHaveBeenCalledWith('/teams/archived');
  });
});
