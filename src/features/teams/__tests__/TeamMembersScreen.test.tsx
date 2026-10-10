import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { SessionUser, Team, TeamMembership, UserProfile } from '../../../types';
import TeamMembersScreen from '../TeamMembersScreen';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockFocusStart: (() => void | (() => void)) | undefined;
let mockFocusCleanup: (() => void) | undefined;
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: '30000000-0000-4000-a000-000000000001' }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      mockFocusStart = callback;
      const cleanup = callback();
      mockFocusCleanup = cleanup || undefined;
      return cleanup;
    }, [callback]);
  },
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  useRequiredUser: jest.fn(),
}));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseConfirm = useConfirm as jest.Mock;
const mockUseToast = useToast as jest.Mock;

const TEAM: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: '10000000-0000-4000-a000-000000000001',
  name: 'Choir',
  description: 'Leading worship each Sunday.',
  type: 'choir',
  avatar_url: null,
  archived_at: null,
  archived_by: null,
  created_at: '2026-07-11T00:00:00Z',
};

const LEADER: UserProfile = {
  id: '20000000-0000-4000-a000-000000000001',
  auth_user_id: '90000000-0000-4000-a000-000000000001',
  organisation_id: TEAM.organisation_id,
  full_name: 'Sarah Williams',
  email: 'sarah@example.church',
  phone: null,
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removed_by: null,
  access_removal_reason: null,
  created_at: '2026-07-11T00:00:00Z',
};

const MEMBER: UserProfile = {
  ...LEADER,
  id: '20000000-0000-4000-a000-000000000002',
  auth_user_id: '90000000-0000-4000-a000-000000000002',
  full_name: 'Hannah Adeyemi',
  email: 'hannah@example.church',
};

const MEMBERSHIPS: TeamMembership[] = [
  {
    id: '40000000-0000-4000-a000-000000000001',
    team_id: TEAM.id,
    user_id: LEADER.id,
    role: 'team_leader',
    created_at: '2026-07-11T00:00:00Z',
  },
  {
    id: '40000000-0000-4000-a000-000000000002',
    team_id: TEAM.id,
    user_id: MEMBER.id,
    role: 'member',
    created_at: '2026-07-11T00:00:01Z',
  },
];

const LEADER_SESSION: SessionUser = {
  profile: LEADER,
  orgRole: 'general_member',
  memberships: [MEMBERSHIPS[0]!],
  supabaseProfileId: LEADER.id,
};

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    teams: [TEAM],
    users: [LEADER, MEMBER],
    memberships: MEMBERSHIPS,
    teamsLive: true,
    teamsLoading: false,
    teamsError: null,
    refreshTeams: jest.fn(),
    getTeamAvatarUri: jest.fn(),
    getAvatarUri: jest.fn(),
    removeTeamMember: jest.fn().mockResolvedValue(undefined),
    setTeamMemberRole: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusStart = undefined;
  mockFocusCleanup = undefined;
  mockUseAuth.mockReturnValue({ authMode: 'supabase' });
  mockUseRequiredUser.mockReturnValue(LEADER_SESSION);
  mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
  mockUseToast.mockReturnValue(jest.fn());
  mockUseAppData.mockReturnValue(makeData());
});

describe('TeamMembersScreen', () => {
  it('shows current members and protects leader/self rows from removal', () => {
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('Sarah Williams')).toBeTruthy();
    expect(screen.getByText('Hannah Adeyemi')).toBeTruthy();
    expect(screen.getByText('2 current members')).toBeTruthy();
    expect(screen.queryByLabelText('Remove Sarah Williams from team')).toBeNull();
    expect(screen.getByLabelText('Remove Hannah Adeyemi from team')).toBeTruthy();
  });

  it('blocks peer team-admin removal for a team admin', () => {
    const peerAdmin = { ...MEMBERSHIPS[1]!, role: 'team_leader' as const };
    mockUseAppData.mockReturnValue(makeData({ memberships: [MEMBERSHIPS[0], peerAdmin] }));
    const screen = render(<TeamMembersScreen />);
    expect(screen.queryByLabelText('Remove Hannah Adeyemi from team')).toBeNull();
    expect(
      screen.getByText('Ask a church admin to manage another team admin’s membership.'),
    ).toBeTruthy();
  });

  it('lets a church admin remove a non-final team admin', () => {
    const peerAdmin = { ...MEMBERSHIPS[1]!, role: 'team_leader' as const };
    mockUseRequiredUser.mockReturnValue({ ...LEADER_SESSION, orgRole: 'church_admin' });
    mockUseAppData.mockReturnValue(makeData({ memberships: [MEMBERSHIPS[0], peerAdmin] }));
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByLabelText('Remove Hannah Adeyemi from team')).toBeTruthy();
  });

  it('shows final-admin guidance to a church admin', () => {
    const finalAdmin = { ...MEMBERSHIPS[1]!, role: 'team_leader' as const };
    mockUseRequiredUser.mockReturnValue({
      ...LEADER_SESSION,
      orgRole: 'church_admin',
      memberships: [],
    });
    mockUseAppData.mockReturnValue(makeData({ memberships: [finalAdmin] }));
    const screen = render(<TeamMembersScreen />);
    expect(screen.queryByLabelText('Remove Hannah Adeyemi from team')).toBeNull();
    expect(
      screen.getByText(
        'Another team admin must be appointed before this person can be removed.',
      ),
    ).toBeTruthy();
  });

  it('shows a friendly locked state for an unauthorised direct route', () => {
    mockUseRequiredUser.mockReturnValue({ ...LEADER_SESSION, memberships: [] });
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
    expect(screen.queryByText('Add member')).toBeNull();
    expect(screen.queryByLabelText('Remove Hannah Adeyemi from team')).toBeNull();
    expect(screen.queryByText('Hannah Adeyemi')).toBeNull();
    expect(screen.queryByText('Sarah Williams')).toBeNull();
  });

  it('shows a friendly not-found state for an unknown team', () => {
    mockUseAppData.mockReturnValue(makeData({ teams: [] }));
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('Team not found')).toBeTruthy();
  });

  it('cancels removal without calling the service', async () => {
    const confirm = jest.fn().mockResolvedValue(false);
    const removeTeamMember = jest.fn();
    mockUseConfirm.mockReturnValue(confirm);
    mockUseAppData.mockReturnValue(makeData({ removeTeamMember }));
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText('Remove Hannah Adeyemi from team'));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(removeTeamMember).not.toHaveBeenCalled();
  });

  it('confirms removal once and reflects the updated member list', async () => {
    let data = makeData();
    const removeTeamMember = jest.fn().mockImplementation(async () => {
      data = makeData({ memberships: [MEMBERSHIPS[0]], removeTeamMember });
      mockUseAppData.mockReturnValue(data);
    });
    data = makeData({ removeTeamMember });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText('Remove Hannah Adeyemi from team'));
    await waitFor(() =>
      expect(removeTeamMember).toHaveBeenCalledWith(TEAM.id, MEMBER.id),
    );
    expect(removeTeamMember).toHaveBeenCalledTimes(1);
    screen.rerender(<TeamMembersScreen />);
    expect(screen.queryByText('Hannah Adeyemi')).toBeNull();
    expect(screen.getByText('1 current member')).toBeTruthy();
  });

  it('keeps the existing list stable and shows a friendly error on failure', async () => {
    const removeTeamMember = jest.fn().mockRejectedValue(new Error('Please try again later.'));
    mockUseAppData.mockReturnValue(makeData({ removeTeamMember }));
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText('Remove Hannah Adeyemi from team'));
    await waitFor(() => expect(screen.getByText('Please try again later.')).toBeTruthy());
    expect(screen.getByText('Hannah Adeyemi')).toBeTruthy();
  });

  it('is read-only in demo mode and never calls a live mutation', () => {
    const removeTeamMember = jest.fn();
    mockUseAuth.mockReturnValue({ authMode: 'demo' });
    mockUseAppData.mockReturnValue(
      makeData({ teamsLive: false, removeTeamMember }),
    );
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('Member management is read-only in demo mode')).toBeTruthy();
    expect(screen.getByText('Sarah Williams')).toBeTruthy();
    expect(screen.getByText('Hannah Adeyemi')).toBeTruthy();
    expect(screen.queryByLabelText('Remove Hannah Adeyemi from team')).toBeNull();
    expect(removeTeamMember).not.toHaveBeenCalled();
  });
});

describe('Members read access and navigation', () => {
  it('lets ordinary team members read full names and roles without any mutation controls', () => {
    const data = makeData();
    mockUseAppData.mockReturnValue(data);
    mockUseRequiredUser.mockReturnValue({ ...LEADER_SESSION, profile: MEMBER, memberships: [MEMBERSHIPS[1]] });
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('Sarah Williams')).toBeTruthy();
    expect(screen.getByText('Hannah Adeyemi')).toBeTruthy();
    expect(screen.getByText('Team admin')).toBeTruthy();
    expect(screen.queryByText('Add member')).toBeNull();
    expect(screen.queryByLabelText('Remove Sarah Williams from team')).toBeNull();
    expect(screen.queryByLabelText('Make Hannah Adeyemi a team admin')).toBeNull();
    expect(data.removeTeamMember).not.toHaveBeenCalled();
    expect(data.setTeamMemberRole).not.toHaveBeenCalled();
  });

  it('retains the existing Add member destination directly from Members', () => {
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText('Add member'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/settings/members/add', params: { teamId: TEAM.id } });
  });

  it('does not expose names from outside this team, another church, or removed identities', () => {
    const outside = { ...MEMBER, id: 'outside', full_name: 'Not in this team' };
    const other = { ...MEMBER, id: 'other', full_name: 'Other church person', organisation_id: 'other-church' };
    const removed = { ...MEMBER, id: 'removed', full_name: 'Removed person', access_status: 'removed' as const };
    mockUseAppData.mockReturnValue(makeData({ users: [LEADER, MEMBER, outside, other, removed], memberships: [
      ...MEMBERSHIPS, { ...MEMBERSHIPS[1], id: 'other', user_id: other.id }, { ...MEMBERSHIPS[1], id: 'removed', user_id: removed.id },
    ] }));
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('2 current members')).toBeTruthy();
    expect(screen.queryByText('Not in this team')).toBeNull();
    expect(screen.queryByText('Other church person')).toBeNull();
    expect(screen.queryByText('Removed person')).toBeNull();
  });

  it.each(['active-list', 'archive-list'])('rejects archived team content from %s', (location) => {
    const archived = { ...TEAM, archived_at: '2026-09-01' };
    const data = makeData({ teams: location === 'active-list' ? [archived] : [], archivedTeams: [archived] });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('Team is archived')).toBeTruthy();
    expect(screen.queryByText('Hannah Adeyemi')).toBeNull();
    expect(screen.queryByText('Add member')).toBeNull();
    expect(data.removeTeamMember).not.toHaveBeenCalled();
    expect(data.setTeamMemberRole).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Back to teams'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });

  it('does not let church-admin authority cross the current organisation boundary', () => {
    mockUseRequiredUser.mockReturnValue({ ...LEADER_SESSION, orgRole: 'church_admin' });
    mockUseAppData.mockReturnValue(makeData({ teams: [{ ...TEAM, organisation_id: 'other-church' }] }));
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText('Team not found')).toBeTruthy();
    expect(screen.queryByText('Hannah Adeyemi')).toBeNull();
  });

  it('searches names beyond the initially rendered rows and shows full matching names', () => {
    const users = Array.from({ length: 60 }, (_, i) => ({ ...MEMBER, id: `person-${i}`, full_name: `Member ${String(i).padStart(2, '0')} Full Family Name` }));
    const memberships = users.map((profile, i) => ({ ...MEMBERSHIPS[1], id: `member-${i}`, user_id: profile.id }));
    mockUseAppData.mockReturnValue(makeData({ users, memberships }));
    const screen = render(<TeamMembersScreen />);
    fireEvent.changeText(screen.getByLabelText('Search members'), 'Member 59');
    expect(screen.getByText('Member 59 Full Family Name')).toBeTruthy();
    expect(screen.getByText('1 of 60 members')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search members'), 'Nobody matching');
    expect(screen.getByText('No matching members')).toBeTruthy();
  });

  it('does not change roles if authority is lost while confirmation is open', async () => {
    let resolveConfirm!: (approved: boolean) => void;
    mockUseConfirm.mockReturnValue(jest.fn().mockReturnValue(new Promise<boolean>((resolve) => { resolveConfirm = resolve; })));
    mockUseRequiredUser.mockReturnValue({ ...LEADER_SESSION, orgRole: 'church_admin' });
    const data = makeData();
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText('Make Hannah Adeyemi a team admin'));
    mockUseRequiredUser.mockReturnValue(LEADER_SESSION);
    screen.rerender(<TeamMembersScreen />);
    await act(async () => resolveConfirm(true));
    expect(data.setTeamMemberRole).not.toHaveBeenCalled();
    expect(screen.getByText('Hannah Adeyemi')).toBeTruthy();
  });

  it('does not show an empty member list when a refresh failed', async () => {
    const data = makeData({ memberships: [], teamsError: 'Connection interrupted.' });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByText("Couldn't refresh the member list")).toBeTruthy();
    expect(screen.queryByText('No members yet')).toBeNull();
    await act(async () => fireEvent.press(screen.getByLabelText('Retry members')));
    expect(data.refreshTeams).toHaveBeenCalledTimes(1);
  });
});

describe('TeamMembersScreen role management', () => {
  const ADMIN_SESSION: SessionUser = { ...LEADER_SESSION, orgRole: 'church_admin' };
  const PROMOTE_MEMBER = 'Make Hannah Adeyemi a team admin';
  const DEMOTE_LEADER = "Remove Sarah Williams's team admin role";

  it('offers a church admin the opposite role transition on every row, including self', () => {
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    const screen = render(<TeamMembersScreen />);
    expect(screen.getByLabelText(PROMOTE_MEMBER)).toBeTruthy();
    // Sarah is the signed-in church admin's own leader row: self-demotion stays available.
    expect(screen.getByLabelText(DEMOTE_LEADER)).toBeTruthy();
    expect(screen.getByText('Make team admin')).toBeTruthy();
    expect(screen.getByText('Remove team admin role')).toBeTruthy();
  });

  it('hides role controls from a team leader who is not a church admin', () => {
    const screen = render(<TeamMembersScreen />);
    expect(screen.queryByLabelText(PROMOTE_MEMBER)).toBeNull();
    expect(screen.queryByLabelText(DEMOTE_LEADER)).toBeNull();
    expect(screen.queryByText('Make team admin')).toBeNull();
    expect(screen.queryByText('Remove team admin role')).toBeNull();
  });

  it('hides role controls in demo mode', () => {
    mockUseAuth.mockReturnValue({ authMode: 'demo' });
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    mockUseAppData.mockReturnValue(makeData({ teamsLive: false }));
    const screen = render(<TeamMembersScreen />);
    expect(screen.queryByText('Make team admin')).toBeNull();
    expect(screen.queryByText('Remove team admin role')).toBeNull();
  });

  it('promotes after confirmation and reflects the new badge without reload', async () => {
    const confirm = jest.fn().mockResolvedValue(true);
    mockUseConfirm.mockReturnValue(confirm);
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    let data = makeData();
    const setTeamMemberRole = jest.fn().mockImplementation(async () => {
      data = makeData({
        memberships: [MEMBERSHIPS[0], { ...MEMBERSHIPS[1]!, role: 'team_leader' as const }],
        setTeamMemberRole,
      });
      mockUseAppData.mockReturnValue(data);
    });
    data = makeData({ setTeamMemberRole });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText(PROMOTE_MEMBER));
    await waitFor(() =>
      expect(setTeamMemberRole).toHaveBeenCalledWith(TEAM.id, MEMBER.id, 'team_leader'),
    );
    expect(setTeamMemberRole).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Make team admin?',
        confirmLabel: 'Make team admin',
      }),
    );
    expect(confirm.mock.calls[0][0].message).not.toContain('church admin');
    expect(confirm.mock.calls[0][0].message).toContain(`help organise ${TEAM.name}`);
    expect(confirm.mock.calls[0][0].message).not.toContain('permissions');
    screen.rerender(<TeamMembersScreen />);
    expect(screen.getAllByText('Team admin')).toHaveLength(2);
    expect(screen.getAllByText('Hannah Adeyemi')).toHaveLength(1);
  });

  it('warns about the final team admin but still allows the demotion', async () => {
    const confirm = jest.fn().mockResolvedValue(true);
    mockUseConfirm.mockReturnValue(confirm);
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    const setTeamMemberRole = jest.fn().mockResolvedValue(undefined);
    mockUseAppData.mockReturnValue(makeData({ setTeamMemberRole }));
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText(DEMOTE_LEADER));
    await waitFor(() =>
      expect(setTeamMemberRole).toHaveBeenCalledWith(TEAM.id, LEADER.id, 'member'),
    );
    const dialog = confirm.mock.calls[0][0];
    expect(dialog.title).toBe('Remove team admin role?');
    expect(dialog.message).toContain(LEADER.full_name);
    expect(dialog.message).toContain(LEADER.email);
    expect(dialog.message).toContain('will remain a member');
    expect(dialog.message).toContain('leave the team without a team admin');
  });

  it('omits the zero-admin warning while another team admin remains', async () => {
    const confirm = jest.fn().mockResolvedValue(false);
    mockUseConfirm.mockReturnValue(confirm);
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    const secondAdmin = { ...MEMBERSHIPS[1]!, role: 'team_leader' as const };
    mockUseAppData.mockReturnValue(makeData({ memberships: [MEMBERSHIPS[0], secondAdmin] }));
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText(DEMOTE_LEADER));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0].message).not.toContain(
      'leave the team without a team admin',
    );
  });

  it('cancels a role change without calling the mutation', async () => {
    const confirm = jest.fn().mockResolvedValue(false);
    mockUseConfirm.mockReturnValue(confirm);
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    const setTeamMemberRole = jest.fn();
    mockUseAppData.mockReturnValue(makeData({ setTeamMemberRole }));
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText(PROMOTE_MEMBER));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(setTeamMemberRole).not.toHaveBeenCalled();
  });

  it('collapses a repeated tap into one confirmation and one mutation', async () => {
    const confirm = jest.fn().mockResolvedValue(true);
    mockUseConfirm.mockReturnValue(confirm);
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    const setTeamMemberRole = jest.fn().mockResolvedValue(undefined);
    mockUseAppData.mockReturnValue(makeData({ setTeamMemberRole }));
    const screen = render(<TeamMembersScreen />);
    const action = screen.getByLabelText(PROMOTE_MEMBER);
    fireEvent.press(action);
    fireEvent.press(action);
    await waitFor(() => expect(setTeamMemberRole).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous role and shows friendly copy when the change fails', async () => {
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    const setTeamMemberRole = jest
      .fn()
      .mockRejectedValue(new Error('Restore this team before changing member roles.'));
    mockUseAppData.mockReturnValue(makeData({ setTeamMemberRole }));
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText(PROMOTE_MEMBER));
    await waitFor(() =>
      expect(
        screen.getByText('Restore this team before changing member roles.'),
      ).toBeTruthy(),
    );
    // Only Sarah's original leader badge remains; Hannah stays an ordinary member.
    expect(screen.getAllByText('Team admin')).toHaveLength(1);
    expect(screen.getByLabelText(PROMOTE_MEMBER)).toBeTruthy();
  });
});

describe('Uncertain member changes and refresh recovery', () => {
  const responseError = 'The connection ended before a response arrived.';
  const ADMIN_SESSION: SessionUser = { ...LEADER_SESSION, orgRole: 'church_admin' };
  const PROMOTE_MEMBER = 'Make Hannah Adeyemi a team admin';

  async function failPromotion(overrides: Record<string, unknown> = {}) {
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    const data = makeData({ setTeamMemberRole: jest.fn().mockRejectedValue(new Error(responseError)), ...overrides });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText(PROMOTE_MEMBER));
    await waitFor(() => expect(screen.getByText(responseError)).toBeTruthy());
    return { screen, data };
  }

  it('shows the server role after a lost write response and refresh, without repeating or inferring the write', async () => {
    let serverMemberships = MEMBERSHIPS;
    let data = makeData();
    const setTeamMemberRole = jest.fn().mockImplementation(async () => {
      serverMemberships = [MEMBERSHIPS[0], { ...MEMBERSHIPS[1], role: 'team_leader' as const }];
      throw new Error(responseError);
    });
    const refreshTeams = jest.fn().mockImplementation(async () => {
      data = makeData({ memberships: serverMemberships, setTeamMemberRole, refreshTeams });
      mockUseAppData.mockReturnValue(data);
    });
    mockUseRequiredUser.mockReturnValue(ADMIN_SESSION);
    data = makeData({ setTeamMemberRole, refreshTeams });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText(PROMOTE_MEMBER));
    await waitFor(() => expect(screen.getByText(responseError)).toBeTruthy());
    expect(screen.getByText('Couldn’t confirm change')).toBeTruthy();
    expect(screen.queryByText('Change not saved')).toBeNull();
    expect(screen.getByText(/Refresh members to check the current memberships and roles/)).toBeTruthy();
    expect(screen.getAllByText('Team admin')).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Refresh members'));
    await waitFor(() => expect(screen.getAllByText('Team admin')).toHaveLength(2));
    expect(screen.getByLabelText("Remove Hannah Adeyemi's team admin role")).toBeTruthy();
    expect(screen.getByText('Couldn’t confirm change')).toBeTruthy();
    expect(setTeamMemberRole).toHaveBeenCalledTimes(1);
    expect(refreshTeams).toHaveBeenCalledTimes(1);
    expect(mockUseToast.mock.results[0].value).not.toHaveBeenCalled();
  });

  it('refreshes an already-applied removal after a lost response without removing twice', async () => {
    let serverMemberships = MEMBERSHIPS;
    let data = makeData();
    const removeTeamMember = jest.fn().mockImplementation(async () => {
      serverMemberships = [MEMBERSHIPS[0]];
      throw new Error(responseError);
    });
    const refreshTeams = jest.fn().mockImplementation(async () => {
      data = makeData({ memberships: serverMemberships, removeTeamMember, refreshTeams });
      mockUseAppData.mockReturnValue(data);
    });
    data = makeData({ removeTeamMember, refreshTeams });
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamMembersScreen />);
    fireEvent.press(screen.getByLabelText('Remove Hannah Adeyemi from team'));
    await waitFor(() => expect(screen.getByText(responseError)).toBeTruthy());
    expect(screen.getByText('Hannah Adeyemi')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Refresh members'));
    await waitFor(() => expect(screen.queryByText('Hannah Adeyemi')).toBeNull());
    expect(screen.getByText('1 current member')).toBeTruthy();
    expect(screen.getByText('Couldn’t confirm change')).toBeTruthy();
    expect(removeTeamMember).toHaveBeenCalledTimes(1);
    expect(refreshTeams).toHaveBeenCalledTimes(1);
    const dialog = (mockUseConfirm.mock.results[0].value as jest.Mock).mock.calls[0][0];
    expect(dialog.message).toContain('church role');
    expect(dialog.message).not.toContain('organisation role');
  });

  it('catches a rejected recovery read, locks duplicate actions and retains the original uncertainty', async () => {
    let rejectRead!: (error: Error) => void;
    const refreshTeams = jest.fn().mockReturnValue(new Promise<void>((_resolve, reject) => { rejectRead = reject; }));
    const { screen, data } = await failPromotion({ refreshTeams });
    fireEvent.press(screen.getByLabelText('Refresh members'));
    expect(screen.getByLabelText('Refresh members')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, busy: true }));
    fireEvent.press(screen.getByLabelText('Refresh members'));
    fireEvent.press(screen.getByLabelText(PROMOTE_MEMBER));
    expect(refreshTeams).toHaveBeenCalledTimes(1);
    expect(data.setTeamMemberRole).toHaveBeenCalledTimes(1);
    await act(async () => rejectRead(new Error('Members could not be loaded.')));
    expect(screen.getByText('Couldn’t refresh members')).toBeTruthy();
    expect(screen.getByText('Members could not be loaded.')).toBeTruthy();
    expect(screen.getByText(responseError)).toBeTruthy();
    expect(screen.getByLabelText('Refresh members')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: false, busy: false }));
    expect(screen.queryByText(/Change (not saved|saved)/)).toBeNull();
  });

  it('uses AppData read-error state when refresh resolves and never labels the earlier change saved or unsaved', async () => {
    let data = makeData();
    const refreshTeams = jest.fn().mockImplementation(async () => {
      data = makeData({ ...data, teamsError: 'The current member list could not be loaded.' });
      mockUseAppData.mockReturnValue(data);
    });
    const setup = await failPromotion({ refreshTeams });
    data = setup.data;
    fireEvent.press(setup.screen.getByLabelText('Refresh members'));
    await waitFor(() => expect(setup.screen.getByText('The current member list could not be loaded.')).toBeTruthy());
    expect(setup.screen.getByText(responseError)).toBeTruthy();
    expect(setup.screen.getByText('Couldn’t confirm change')).toBeTruthy();
    expect(setup.screen.queryByText(/Change (not saved|saved)/)).toBeNull();
    expect(setup.screen.getAllByLabelText('Refresh members')).toHaveLength(1);
  });

  it('ignores a stale recovery completion after the owner changes', async () => {
    let rejectRead!: (error: Error) => void;
    const refreshTeams = jest.fn().mockReturnValue(new Promise<void>((_resolve, reject) => { rejectRead = reject; }));
    const { screen, data } = await failPromotion({ refreshTeams });
    fireEvent.press(screen.getByLabelText('Refresh members'));
    mockUseRequiredUser.mockReturnValue({ ...ADMIN_SESSION, profile: { ...LEADER, id: 'replacement-owner' }, memberships: [] });
    screen.rerender(<TeamMembersScreen />);
    await act(async () => rejectRead(new Error('Stale read failure.')));
    expect(screen.queryByText('Stale read failure.')).toBeNull();
    expect(screen.queryByText(responseError)).toBeNull();
    expect(screen.queryByLabelText('Refresh members')).toBeNull();
    expect(data.setTeamMemberRole).toHaveBeenCalledTimes(1);
    expect(refreshTeams).toHaveBeenCalledTimes(1);
  });

  it('ignores a blurred read failure and permits a new recovery after returning', async () => {
    let rejectRead!: (error: Error) => void;
    const refreshTeams = jest.fn().mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectRead = reject; })).mockResolvedValue(undefined);
    const { screen } = await failPromotion({ refreshTeams });
    fireEvent.press(screen.getByLabelText('Refresh members'));
    act(() => mockFocusCleanup?.());
    await act(async () => rejectRead(new Error('Offscreen read failure.')));
    expect(screen.queryByText('Offscreen read failure.')).toBeNull();
    act(() => { mockFocusStart?.(); });
    expect(screen.getByLabelText('Refresh members')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: false, busy: false }));
    fireEvent.press(screen.getByLabelText('Refresh members'));
    await waitFor(() => expect(refreshTeams).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Couldn’t confirm change')).toBeTruthy();
  });
});
