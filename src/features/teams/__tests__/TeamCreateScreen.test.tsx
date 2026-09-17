import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { Team, UserProfile } from '../../../types';
import TeamCreateScreen from '../TeamCreateScreen';
import { useTeamAvatarDraft } from '../useTeamAvatarDraft';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace }),
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
// Screen tests exercise form behavior, not react-native-paper's delayed label
// animation. A native input keeps the suite deterministic and avoids timers
// firing after Testing Library has already cleaned up the rendered screen.
jest.mock('../../../components/TextField', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, TextInput, View } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  return {
    TextField: ({ label, error, ...props }: { label: string; error?: string }) =>
      React.createElement(
        View,
        null,
        React.createElement(TextInput, { accessibilityLabel: label, ...props }),
        error ? React.createElement(Text, null, error) : null,
      ),
  };
});
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
  jest.clearAllMocks();
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
    expect(screen.getByLabelText('No initial team admin').props.accessibilityState.checked).toBe(
      true,
    );
    expect(
      screen.getByText(
        'Optional. You can create the team without a team admin and assign one later.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('The creator will not be added automatically.')).toBeTruthy();
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
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/teams/[teamId]',
      params: { teamId: TEAM.id },
    });
  });

  it('sends exactly another selected active profile or the creator when explicitly selected', async () => {
    const createTeam = jest.fn().mockResolvedValue({ team: TEAM, initialAdminMembership: null });
    mockUseAppData.mockReturnValue(makeData({ createTeam }));
    const screen = render(<TeamCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Welcome Team');
    fireEvent.press(screen.getAllByLabelText('Active Member')[0]);
    fireEvent.press(screen.getByLabelText('Create team'));
    await waitFor(() =>
      expect(createTeam).toHaveBeenLastCalledWith(
        expect.objectContaining({ initialAdminProfileId: MEMBER.id }),
      ),
    );

    createTeam.mockClear();
    const second = render(<TeamCreateScreen />);
    fireEvent.changeText(second.getByLabelText('Team name'), 'Care Team');
    fireEvent.press(second.getAllByLabelText('Church Admin, you')[0]);
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
    expect(screen.getByText('Enter a team name.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Team name'), 'x'.repeat(101));
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'y'.repeat(501));
    fireEvent.press(screen.getByLabelText('Create team'));
    expect(screen.getByText('Keep the team name to 100 characters or fewer.')).toBeTruthy();
    expect(screen.getByText('Keep the description to 500 characters or fewer.')).toBeTruthy();
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
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/teams/[teamId]',
      params: { teamId: TEAM.id },
    });
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
    fireEvent.press(screen.getAllByLabelText('Active Member')[0]);
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
