import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { Team, UserProfile } from '../../../types';
import TeamEditScreen from '../TeamEditScreen';
import { useTeamAvatar } from '../useTeamAvatar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: '30000000-0000-4000-a000-000000000001' }),
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../useTeamAvatar', () => ({ useTeamAvatar: jest.fn() }));
const mockToast = jest.fn();
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseConfirm = useConfirm as jest.Mock;
const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseAvatar = useTeamAvatar as jest.Mock;

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
const TEAM: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: PROFILE.organisation_id,
  name: 'Welcome Team',
  description: 'Welcomes people.',
  type: 'generic',
  avatar_url: null,
  archived_at: null,
  archived_by: null,
  created_at: '',
};

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    teams: [TEAM],
    archivedTeams: [],
    teamsLoading: false,
    teamsError: null,
    updateTeam: jest.fn().mockResolvedValue(TEAM),
    archiveTeam: jest.fn().mockResolvedValue({
      ...TEAM,
      archived_at: '2026-07-15T01:00:00Z',
      archived_by: PROFILE.id,
    }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { profile: PROFILE, orgRole: 'church_admin', memberships: [] },
    authMode: 'supabase',
    accountStatus: 'ready',
    isLoading: false,
  });
  mockUseAppData.mockReturnValue(makeData());
  mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
  mockUseAvatar.mockReturnValue({
    canManage: true,
    hasPhoto: false,
    avatarUri: undefined,
    busy: null,
    changePhoto: jest.fn(),
    removePhoto: jest.fn(),
  });
});

describe('TeamEditScreen', () => {
  it('loads current values and patches the canonical team through AppData', async () => {
    const updateTeam = jest.fn().mockResolvedValue({ ...TEAM, name: 'Hosting Team' });
    mockUseAppData.mockReturnValue(makeData({ updateTeam }));
    const screen = render(<TeamEditScreen />);
    await waitFor(() => expect(screen.getByLabelText('Team name').props.value).toBe(TEAM.name));
    fireEvent.changeText(screen.getByLabelText('Team name'), '  Hosting Team  ');
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), '  A warmer welcome.  ');
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() =>
      expect(updateTeam).toHaveBeenCalledWith({
        teamId: TEAM.id,
        name: 'Hosting Team',
        description: 'A warmer welcome.',
      }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the form and previous data visible after a failed edit', async () => {
    const updateTeam = jest.fn().mockRejectedValue(new Error('Something changed. Try again.'));
    mockUseAppData.mockReturnValue(makeData({ updateTeam }));
    const screen = render(<TeamEditScreen />);
    await waitFor(() => expect(screen.getByLabelText('Team name').props.value).toBe(TEAM.name));
    fireEvent.changeText(screen.getByLabelText('Team name'), 'New Name');
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText('Something changed. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('Team name').props.value).toBe('New Name');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('requires confirmation; cancellation and failure leave the active team unchanged', async () => {
    const archiveTeam = jest.fn();
    const confirm = jest.fn().mockResolvedValue(false);
    mockUseAppData.mockReturnValue(makeData({ archiveTeam }));
    mockUseConfirm.mockReturnValue(confirm);
    const screen = render(<TeamEditScreen />);
    fireEvent.press(screen.getByLabelText('Archive team'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(archiveTeam).not.toHaveBeenCalled();

    screen.unmount();
    const failedArchive = jest.fn().mockRejectedValue(new Error('Please try again.'));
    mockUseAppData.mockReturnValue(makeData({ archiveTeam: failedArchive }));
    mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
    const failed = render(<TeamEditScreen />);
    fireEvent.press(failed.getByLabelText('Archive team'));
    expect(await failed.findByText('Please try again.')).toBeTruthy();
    expect(failed.getByLabelText('Team name')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('archives once after confirmation and navigates to the safe admin list', async () => {
    let resolveArchive!: (team: Team) => void;
    const archiveTeam = jest.fn(
      () =>
        new Promise<Team>((resolve) => {
          resolveArchive = resolve;
        }),
    );
    mockUseAppData.mockReturnValue(makeData({ archiveTeam }));
    const screen = render(<TeamEditScreen />);
    fireEvent.press(screen.getByLabelText('Archive team'));
    fireEvent.press(screen.getByLabelText('Archive team'));
    await waitFor(() => expect(archiveTeam).toHaveBeenCalledTimes(1));
    resolveArchive({
      ...TEAM,
      archived_at: '2026-07-15T01:00:00Z',
      archived_by: PROFILE.id,
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/teams/archived'));
  });

  it('does not expose an edit form to a team admin or an archived team', async () => {
    mockUseAuth.mockReturnValue({
      user: { profile: PROFILE, orgRole: 'general_member', memberships: [] },
      authMode: 'supabase',
      accountStatus: 'ready',
      isLoading: false,
    });
    const denied = render(<TeamEditScreen />);
    expect(denied.getByText('No permission')).toBeTruthy();
    expect(denied.queryByLabelText('Team name')).toBeNull();

    mockUseAuth.mockReturnValue({
      user: { profile: PROFILE, orgRole: 'church_admin', memberships: [] },
      authMode: 'supabase',
      accountStatus: 'ready',
      isLoading: false,
    });
    mockUseAppData.mockReturnValue(
      makeData({
        teams: [],
        archivedTeams: [
          { ...TEAM, archived_at: '2026-07-15T01:00:00Z', archived_by: PROFILE.id },
        ],
      }),
    );
    const archived = render(<TeamEditScreen />);
    expect(archived.getByText('Team is archived')).toBeTruthy();
    expect(archived.queryByLabelText('Team name')).toBeNull();
  });
});
