import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { Team, UserProfile } from '../../../types';
import TeamCreateScreen from '../TeamCreateScreen';
import { useTeamAvatarDraft } from '../useTeamAvatarDraft';

const mockDiscardConfirm = jest.fn().mockResolvedValue(true);
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => mockDiscardConfirm }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../useTeamAvatarDraft', () => ({ useTeamAvatarDraft: jest.fn() }));
// Deterministic request keys: each minted key is a distinct fixed UUID so tests
// can assert reuse across retries and rotation for a new submission.
let mockMintedRequestIds = 0;
jest.mock('../../../utils/ids', () => ({
  newRequestId: jest.fn(() => {
    mockMintedRequestIds += 1;
    return `50000000-0000-4000-a000-0000000000${String(mockMintedRequestIds).padStart(2, '0')}`;
  }),
}));
const REQUEST_ID_1 = '50000000-0000-4000-a000-000000000001';
const REQUEST_ID_2 = '50000000-0000-4000-a000-000000000002';
const mockToast = jest.fn();
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseAvatarDraft = useTeamAvatarDraft as jest.Mock;

const ADMIN: UserProfile = {
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
const MEMBER: UserProfile = {
  ...ADMIN,
  id: '20000000-0000-4000-a000-000000000002',
  auth_user_id: '90000000-0000-4000-a000-000000000002',
  full_name: 'Active Member',
  email: 'member@example.church',
};
const TEAM: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: ADMIN.organisation_id,
  name: 'Welcome Team',
  description: 'Welcomes people.',
  type: 'generic',
  avatar_url: null,
  archived_at: null,
  archived_by: null,
  created_at: '2026-07-15T00:45:13.000Z',
};

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    organisation: { id: ADMIN.organisation_id, name: 'Test Church' },
    users: [ADMIN, MEMBER],
    teamsLive: false,
    teamsLoading: false,
    teamsError: null,
    refreshTeams: jest.fn(),
    getAvatarUri: jest.fn(),
    createTeam: jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null }),
    setTeamAvatar: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  mockDiscardConfirm.mockReset().mockResolvedValue(true);
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  mockMintedRequestIds = 0;
  mockUseAuth.mockReturnValue({
    user: { profile: ADMIN, orgRole: 'church_admin', memberships: [] },
    authMode: 'demo',
    accountStatus: 'idle',
    isLoading: false,
  });
  mockUseAppData.mockReturnValue(makeData());
  mockUseAvatarDraft.mockReturnValue({
    draft: null,
    picking: false,
    pick: jest.fn(),
    clear: jest.fn(),
  });
});

describe('TeamCreateScreen authority and zero-admin defaults', () => {
  it('names the resolved current church and never shows the demo placeholder during a live refresh', () => {
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), authMode: 'supabase', accountStatus: 'ready', accountContext: {
      account: { active_profile_id: ADMIN.id },
      organisations: [{ profile: ADMIN, organisation: { id: ADMIN.organisation_id, name: 'Resolved Current Church' } }],
    } });
    const screen = render(<TeamCreateScreen />);
    expect(screen.getByLabelText('Current church: Resolved Current Church')).toBeTruthy();
    expect(screen.queryByText('Test Church')).toBeNull();
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'loading', accountContext: null });
    screen.rerender(<TeamCreateScreen />);
    expect(screen.getByText('Loading church…')).toBeTruthy();
    expect(screen.queryByText('Test Church')).toBeNull();
    expect(screen.queryByLabelText('Team name')).toBeNull();
  });

  it('shows no usable privileged form to a direct non-admin visit', () => {
    mockUseAuth.mockReturnValue({
      user: { profile: MEMBER, orgRole: 'general_member', memberships: [] },
      authMode: 'supabase',
      accountStatus: 'ready',
      isLoading: false,
    });
    const screen = render(<TeamCreateScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
    expect(screen.queryByLabelText('Team name')).toBeNull();
    expect(screen.queryByLabelText('Create team')).toBeNull();
  });

  it('does not expose the form while live authority is unresolved', () => {
    mockUseAuth.mockReturnValue({
      user: { profile: ADMIN, orgRole: 'church_admin', memberships: [] },
      authMode: 'supabase',
      accountStatus: 'loading',
      isLoading: false,
    });
    const screen = render(<TeamCreateScreen />);
    expect(screen.getByText('Checking team permissions...')).toBeTruthy();
    expect(screen.queryByLabelText('Team name')).toBeNull();
  });

  it('defaults to no initial admin and explains that zero-admin creation is valid', () => {
    const screen = render(<TeamCreateScreen />);
    expect(screen.getByText('No initial team admin')).toBeTruthy();
    expect(screen.queryByLabelText('Search active members')).toBeNull();
    expect(
      screen.getByText(
        'Optional. You can create the team without a team admin and assign one later.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Creating this team won’t add you automatically.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Choose initial team admin'));
    expect(screen.getByRole('radio', { name: 'No initial team admin', checked: true })).toBeTruthy();
  });
});

describe('TeamCreateScreen submission', () => {
  it('trims fields and sends null initial admin', async () => {
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), '  Welcome Team  ');
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), '  Welcomes people.  ');
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() =>
      expect(createTeam).toHaveBeenCalledWith({
        name: 'Welcome Team',
        description: 'Welcomes people.',
        initialAdminProfileId: null,
        requestId: REQUEST_ID_1,
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/teams/[teamId]',
      params: { teamId: TEAM.id },
    }));
  });

  it('sends exactly another selected active profile or the creator when explicitly selected', async () => {
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Choose initial team admin'));
    fireEvent.press(screen.getByRole('radio', { name: 'Active Member, member@example.church' }));
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() =>
      expect(createTeam).toHaveBeenLastCalledWith(
        expect.objectContaining({ initialAdminProfileId: MEMBER.id }),
      ),
    );

    createTeam.mockClear();
    const second = render(<TeamCreateScreen />);
    fireEvent.changeText(second.getByLabelText('Team name'), 'Care Team');
    fireEvent.press(second.getByLabelText('Choose initial team admin'));
    fireEvent.press(second.getByRole('radio', { name: 'Church Admin, you, admin@example.church' }));
    fireEvent.press(second.getByLabelText('Create team'));
    await waitFor(() =>
      expect(createTeam).toHaveBeenLastCalledWith(
        expect.objectContaining({ initialAdminProfileId: ADMIN.id }),
      ),
    );
  });

  it('blocks blank, whitespace, and overlong fields inline', () => {
    const createTeam = jest.fn();
    mockUseAppData.mockReturnValue(makeData({ createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), '   ');
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(screen.getAllByText('Enter a team name.').length).toBeGreaterThan(0);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'x'.repeat(101));
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'y'.repeat(501));
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(screen.getAllByText('Keep the team name to 100 characters or fewer.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Keep the description to 500 characters or fewer.').length).toBeGreaterThan(0);
    expect(createTeam).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions while creation is in flight', async () => {
    let resolveCreate!: (value: { team: Team; initialAdminMembership: null }) => void;
    const createTeam = jest.fn(
      () =>
        new Promise<{ team: Team; initialAdminMembership: null }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    mockUseAppData.mockReturnValue(makeData({ createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(createTeam).toHaveBeenCalledTimes(1);
    resolveCreate({ team: TEAM, initialAdminMembership: null });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it('shows stable server errors without reporting success', async () => {
    const createTeam = jest.fn().mockRejectedValue(new Error('Only a church admin can manage teams.'));
    mockUseAppData.mockReturnValue(makeData({ createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText('Only a church admin can manage teams.')).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('TeamCreateScreen avatar ordering and retry', () => {
  it('creates first, treats photo failure separately, and retries without duplicating the team', async () => {
    const calls: string[] = [];
    const createTeam = jest.fn(async () => {
      calls.push('create');
      return { team: TEAM, initialAdminMembership: null };
    });
    const setTeamAvatar = jest
      .fn()
      .mockImplementationOnce(async () => {
        calls.push('avatar');
        throw new Error("We couldn't upload that photo.");
      })
      .mockImplementationOnce(async () => {
        calls.push('avatar-retry');
      });
    mockUseAppData.mockReturnValue(makeData({ createTeam, setTeamAvatar, teamsLive: true }));
    mockUseAuth.mockReturnValue({
      user: { profile: ADMIN, orgRole: 'church_admin', memberships: [] },
      authMode: 'supabase',
      accountStatus: 'ready',
      isLoading: false,
    });
    mockUseAvatarDraft.mockReturnValue({
      draft: {
        file: { base64: 'aGVsbG8=', mimeType: 'image/jpeg', fileSize: 5 },
        previewUri: 'file:///team.jpg',
      },
      picking: false,
      pick: jest.fn(),
      clear: jest.fn(),
    });
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText("Team photo wasn't added")).toBeTruthy();
    expect(calls).toEqual(['create', 'avatar']);
    expect(createTeam).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Try photo again'));
    await waitFor(() => expect(setTeamAvatar).toHaveBeenCalledTimes(2));
    expect(createTeam).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['create', 'avatar', 'avatar-retry']);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/teams/[teamId]',
      params: { teamId: TEAM.id },
    }));
  });
});

describe('TeamCreateScreen request keys', () => {
  const OFFLINE = "We couldn't reach the server. Please check your connection and try again.";
  const UNKNOWN = "We couldn't create this team right now. Please try again.";
  const CONFLICT = 'Something changed while you were saving. Please review the team and try again.';

  function liveAdmin() {
    mockUseAuth.mockReturnValue({
      user: { profile: ADMIN, orgRole: 'church_admin', memberships: [] },
      authMode: 'supabase',
      accountStatus: 'ready',
      isLoading: false,
    });
  }

  it('reuses one request key when the same draft is retried after an ambiguous failure', async () => {
    liveAdmin();
    const createTeam = jest
      .fn()
      .mockRejectedValueOnce(new Error(OFFLINE))
      .mockRejectedValueOnce(new Error(UNKNOWN))
      .mockResolvedValueOnce({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText(OFFLINE)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText(UNKNOWN)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(createTeam).toHaveBeenCalledTimes(3);
    expect(createTeam.mock.calls.map(([input]) => input.requestId)).toEqual([
      REQUEST_ID_1,
      REQUEST_ID_1,
      REQUEST_ID_1,
    ]);
  });

  it('issues a new request key when the draft changes before resubmitting', async () => {
    liveAdmin();
    const createTeam = jest
      .fn()
      .mockRejectedValueOnce(new Error(OFFLINE))
      .mockResolvedValueOnce({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText(OFFLINE)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Crew');
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(createTeam.mock.calls.map(([input]) => [input.name, input.requestId])).toEqual([
      ['Welcome Team', REQUEST_ID_1],
      ['Welcome Crew', REQUEST_ID_2],
    ]);
  });

  it('issues a new request key after a server conflict and when the initial admin changes', async () => {
    liveAdmin();
    const createTeam = jest
      .fn()
      .mockRejectedValueOnce(new Error(CONFLICT))
      .mockRejectedValueOnce(new Error(OFFLINE))
      .mockResolvedValueOnce({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText(OFFLINE)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Choose initial team admin'));
    fireEvent.press(screen.getByRole('radio', { name: 'Active Member, member@example.church' }));
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(
      createTeam.mock.calls.map(([input]) => [input.initialAdminProfileId, input.requestId]),
    ).toEqual([
      [null, REQUEST_ID_1],
      [null, REQUEST_ID_2],
      [MEMBER.id, '50000000-0000-4000-a000-000000000003'],
    ]);
  });

  it('never calls createTeam again after success, even for the photo retry path', async () => {
    liveAdmin();
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    const setTeamAvatar = jest
      .fn()
      .mockRejectedValueOnce(new Error("We couldn't upload that photo."))
      .mockResolvedValueOnce(undefined);
    mockUseAppData.mockReturnValue(makeData({ createTeam, setTeamAvatar, teamsLive: true }));
    mockUseAvatarDraft.mockReturnValue({
      draft: {
        file: { base64: 'aGVsbG8=', mimeType: 'image/jpeg', fileSize: 5 },
        previewUri: 'file:///team.jpg',
      },
      picking: false,
      pick: jest.fn(),
      clear: jest.fn(),
    });
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(await screen.findByText("Team photo wasn't added")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try photo again'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(createTeam).toHaveBeenCalledTimes(1);
    expect(createTeam.mock.calls[0][0].requestId).toBe(REQUEST_ID_1);
  });
});

describe('TeamCreateScreen chooser and scope recovery', () => {
  it('distinguishes identical names by email in radio labels while retaining the current-person cue', async () => {
    const first = { ...MEMBER, id: 'same-name-first', full_name: 'Sam Taylor', email: 'sam.one@example.church' };
    const second = { ...MEMBER, id: 'same-name-second', full_name: 'Sam Taylor', email: 'sam.two@example.church' };
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ users: [ADMIN, first, second], createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), TEAM.name);
    fireEvent.press(screen.getByLabelText('Choose initial team admin'));
    expect(screen.getByRole('radio', { name: 'Church Admin, you, admin@example.church' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Sam Taylor, sam.one@example.church' })).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'Sam Taylor, sam.two@example.church' }));
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() => expect(createTeam).toHaveBeenCalledWith(expect.objectContaining({ initialAdminProfileId: second.id })));
  });

  it('keeps an unchanged draft and its retry key through a same-profile permission refresh', async () => {
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), authMode: 'supabase', accountStatus: 'ready' });
    const createTeam = jest.fn().mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    await screen.findByText('Offline');
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'loading' });
    screen.rerender(<TeamCreateScreen />);
    expect(screen.queryByLabelText('Team name')).toBeNull();
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'ready' });
    screen.rerender(<TeamCreateScreen />);
    expect(screen.getByLabelText('Team name').props.value).toBe('Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(createTeam.mock.calls.map(([input]) => input.requestId)).toEqual([REQUEST_ID_1, REQUEST_ID_1]);
  });

  it('records successful creation during permission refresh and opens it once when ready', async () => {
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), authMode: 'supabase', accountStatus: 'ready' });
    let finish!: (value: { team: Team; initialAdminMembership: null }) => void;
    const createTeam = jest.fn(() => new Promise<{ team: Team; initialAdminMembership: null }>((resolve) => { finish = resolve; }));
    mockUseAppData.mockReturnValue(makeData({ createTeam, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), TEAM.name);
    fireEvent.press(screen.getByLabelText('Create team'));
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'loading' });
    screen.rerender(<TeamCreateScreen />);
    await act(async () => finish({ team: TEAM, initialAdminMembership: null }));
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'ready' });
    screen.rerender(<TeamCreateScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]', params: { teamId: TEAM.id } }));
    expect(screen.queryByLabelText('Create team')).toBeNull();
    expect(mockToast).toHaveBeenCalledWith('Team created.');
    screen.rerender(<TeamCreateScreen />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(createTeam).toHaveBeenCalledTimes(1);
  });

  it('retains photo-pending creation and defers photo work and completion through same-profile refreshes', async () => {
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), authMode: 'supabase', accountStatus: 'ready' });
    let finishCreate!: (value: { team: Team; initialAdminMembership: null }) => void;
    let finishPhoto!: () => void;
    const createTeam = jest.fn(() => new Promise<{ team: Team; initialAdminMembership: null }>((resolve) => { finishCreate = resolve; }));
    const setTeamAvatar = jest.fn(() => new Promise<void>((resolve) => { finishPhoto = resolve; }));
    const file = { base64: 'aGVsbG8=', mimeType: 'image/jpeg' };
    mockUseAvatarDraft.mockReturnValue({ draft: { file, previewUri: 'file:///photo.jpg' }, picking: false });
    mockUseAppData.mockReturnValue(makeData({ createTeam, setTeamAvatar, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), TEAM.name);
    fireEvent.press(screen.getByLabelText('Create team'));
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'loading' });
    screen.rerender(<TeamCreateScreen />);
    await act(async () => finishCreate({ team: TEAM, initialAdminMembership: null }));
    expect(setTeamAvatar).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'ready' });
    screen.rerender(<TeamCreateScreen />);
    await waitFor(() => expect(setTeamAvatar).toHaveBeenCalledWith(TEAM.id, file));
    expect(screen.queryByLabelText('Create team')).toBeNull();
    expect(screen.queryByLabelText('Team name')).toBeNull();
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'loading' });
    screen.rerender(<TeamCreateScreen />);
    await act(async () => finishPhoto());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'ready' });
    screen.rerender(<TeamCreateScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(createTeam).toHaveBeenCalledTimes(1);
    expect(setTeamAvatar).toHaveBeenCalledTimes(1);
  });

  it('selects and submits an eligible person beyond the first 50 without losing the choice on another search', async () => {
    const users = Array.from({ length: 120 }, (_, index) => ({
      ...MEMBER, id: `profile-${index}`, full_name: `Member ${String(index).padStart(3, '0')}`,
    }));
    const selected = { ...MEMBER, id: 'selected-beyond-120', full_name: 'Zachariah Long Name', email: 'zachariah@example.church' };
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ users: [...users, selected], createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Choose initial team admin'));
    expect(screen.queryByRole('radio', { name: `${selected.full_name}, ${selected.email}` })).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search active members'), 'zachariah');
    fireEvent.press(screen.getByRole('radio', { name: `${selected.full_name}, ${selected.email}` }));
    expect(screen.queryByLabelText('Search active members')).toBeNull();
    expect(screen.getByText(selected.full_name)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Change initial team admin'));
    fireEvent.changeText(screen.getByLabelText('Search active members'), '');
    expect(screen.getByRole('radio', { name: `${selected.full_name}, ${selected.email}`, checked: true })).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search active members'), 'no matches');
    expect(screen.getByRole('radio', { name: `${selected.full_name}, ${selected.email}`, checked: true })).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close'));
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() => expect(createTeam).toHaveBeenCalledWith(expect.objectContaining({ initialAdminProfileId: selected.id })));
  });

  it.each([
    { access_status: 'removed' },
    { auth_user_id: '' },
    { organisation_id: 'another-church' },
  ])('revalidates a chosen profile against current eligibility: %j', async (change) => {
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Choose initial team admin'));
    fireEvent.press(screen.getByRole('radio', { name: `${MEMBER.full_name}, ${MEMBER.email}` }));
    mockUseAppData.mockReturnValue(makeData({ users: [ADMIN, { ...MEMBER, ...change }], createTeam }));
    screen.rerender(<TeamCreateScreen />);
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(createTeam).not.toHaveBeenCalled();
    expect(screen.getByText(/That person is no longer available/)).toBeTruthy();
    expect(screen.getByLabelText('Team name').props.value).toBe('Welcome Team');
    fireEvent.press(screen.getByLabelText('Change initial team admin'));
    fireEvent.press(screen.getByRole('radio', { name: 'No initial team admin' }));
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() => expect(createTeam).toHaveBeenCalledWith(expect.objectContaining({ initialAdminProfileId: null })));
  });

  it('retains the draft when a directory refresh fails, and offers retry', () => {
    const refreshTeams = jest.fn();
    mockUseAppData.mockReturnValue(makeData({ teamsLive: true, refreshTeams }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Care Team');
    mockUseAppData.mockReturnValue(makeData({ teamsLive: true, teamsError: 'Offline', refreshTeams }));
    screen.rerender(<TeamCreateScreen />);
    expect(screen.getByLabelText('Team name').props.value).toBe('Care Team');
    fireEvent.press(screen.getByLabelText('Retry directory'));
    expect(refreshTeams).toHaveBeenCalledTimes(1);
  });

  it('provides a safe Cancel destination for a direct link', () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = render(<TeamCreateScreen />);
    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
    expect(mockUseAppData().createTeam).not.toHaveBeenCalled();
  });

  it('does not upload, toast or navigate for an old scope after creation resolves', async () => {
    let finish!: (value: { team: Team; initialAdminMembership: null }) => void;
    const createTeam = jest.fn(() => new Promise<{ team: Team; initialAdminMembership: null }>((resolve) => { finish = resolve; }));
    const setTeamAvatar = jest.fn();
    mockUseAvatarDraft.mockReturnValue({ draft: { file: { base64: 'aGVsbG8=', mimeType: 'image/jpeg' }, previewUri: 'file:///photo.jpg' }, picking: false });
    mockUseAppData.mockReturnValue(makeData({ createTeam, setTeamAvatar, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), user: { profile: { ...ADMIN, id: 'other-profile', organisation_id: 'other-church' }, orgRole: 'church_admin', memberships: [] } });
    screen.rerender(<TeamCreateScreen />);
    expect(screen.getByLabelText('Team name').props.value).toBe('');
    await act(async () => finish({ team: TEAM, initialAdminMembership: null }));
    expect(setTeamAvatar).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps photo recovery visible during retry and can continue without creating again', async () => {
    let finish!: () => void;
    const setTeamAvatar = jest.fn().mockRejectedValueOnce(new Error('Photo failed'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    mockUseAvatarDraft.mockReturnValue({ draft: { file: { base64: 'aGVsbG8=', mimeType: 'image/jpeg' }, previewUri: 'file:///photo.jpg' }, picking: false });
    mockUseAppData.mockReturnValue(makeData({ createTeam, setTeamAvatar, teamsLive: true }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getByLabelText('Create team'));
    await screen.findByText("Team photo wasn't added");
    fireEvent.press(screen.getByLabelText('Try photo again'));
    fireEvent.press(screen.getByLabelText('Try photo again'));
    expect(screen.queryByLabelText('Create team')).toBeNull();
    expect(screen.getByLabelText('Continue without photo')).toBeDisabled();
    expect(setTeamAvatar).toHaveBeenCalledTimes(2);
    await act(async () => finish());
    expect(createTeam).toHaveBeenCalledTimes(1);
  });
});

it('keeps a new team description when discard is dismissed', async () => {
  mockDiscardConfirm.mockResolvedValue(false);
  const screen = render(<TeamCreateScreen />);
  fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'My team draft');
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(mockDiscardConfirm).toHaveBeenCalledTimes(1); expect(mockBack).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('My team draft')).toBeTruthy();
  expect(mockUseAppData().createTeam).not.toHaveBeenCalled();
});
