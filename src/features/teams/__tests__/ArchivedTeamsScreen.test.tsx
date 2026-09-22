import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { Team, UserProfile } from '../../../types';
import ArchivedTeamsScreen from '../ArchivedTeamsScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const mockToast = jest.fn();
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseConfirm = useConfirm as jest.Mock;
const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

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
const ARCHIVED: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: PROFILE.organisation_id,
  name: 'Welcome Team',
  description: 'Welcomes people.',
  type: 'generic',
  avatar_url: null,
  archived_at: '2026-07-15T01:00:00.000Z',
  archived_by: PROFILE.id,
  created_at: '',
};

function data(overrides: Record<string, unknown> = {}) {
  return {
    archivedTeams: [ARCHIVED],
    teamsLoading: false,
    teamsError: null,
    refreshTeams: jest.fn(),
    restoreTeam: jest.fn().mockResolvedValue({
      ...ARCHIVED,
      archived_at: null,
      archived_by: null,
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
  mockUseAppData.mockReturnValue(data());
  mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
});

describe('ArchivedTeamsScreen', () => {
  it('shows archived metadata and restores the same team id after confirmation', async () => {
    const restoreTeam = jest.fn().mockResolvedValue({
      ...ARCHIVED,
      archived_at: null,
      archived_by: null,
    });
    const confirm = jest.fn().mockResolvedValue(true);
    mockUseAppData.mockReturnValue(data({ restoreTeam }));
    mockUseConfirm.mockReturnValue(confirm);
    const screen = render(<ArchivedTeamsScreen />);
    expect(screen.getByText('Welcome Team')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.queryByText('Team Rota')).toBeNull();
    fireEvent.press(screen.getByLabelText('Restore Welcome Team'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(restoreTeam).toHaveBeenCalledWith(ARCHIVED.id);
    expect(mockToast).toHaveBeenCalledWith('Team restored.');
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Open team'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]', params: { teamId: ARCHIVED.id } });
  });

  it('cancellation and repeated taps do not duplicate restore calls', async () => {
    const restoreTeam = jest.fn();
    mockUseAppData.mockReturnValue(data({ restoreTeam }));
    const cancelConfirm = jest.fn().mockResolvedValue(false);
    mockUseConfirm.mockReturnValue(cancelConfirm);
    const cancelled = render(<ArchivedTeamsScreen />);
    fireEvent.press(cancelled.getByLabelText('Restore Welcome Team'));
    await waitFor(() => expect(cancelConfirm).toHaveBeenCalled());
    expect(restoreTeam).not.toHaveBeenCalled();

    let resolveRestore!: (team: Team) => void;
    const pendingRestore = jest.fn(
      () =>
        new Promise<Team>((resolve) => {
          resolveRestore = resolve;
        }),
    );
    mockUseAppData.mockReturnValue(data({ restoreTeam: pendingRestore }));
    mockUseConfirm.mockReturnValue(jest.fn().mockResolvedValue(true));
    const pending = render(<ArchivedTeamsScreen />);
    fireEvent.press(pending.getByLabelText('Restore Welcome Team'));
    fireEvent.press(pending.getByLabelText('Restore Welcome Team'));
    await waitFor(() => expect(pendingRestore).toHaveBeenCalledTimes(1));
    resolveRestore({ ...ARCHIVED, archived_at: null, archived_by: null });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Team restored.'));
  });

  it('hides the admin collection from ordinary members', () => {
    mockUseAuth.mockReturnValue({
      user: { profile: PROFILE, orgRole: 'general_member', memberships: [] },
      authMode: 'supabase',
      accountStatus: 'ready',
      isLoading: false,
    });
    const screen = render(<ArchivedTeamsScreen />);
    expect(screen.getByText('No permission')).toBeTruthy();
    expect(screen.queryByText('Welcome Team')).toBeNull();
    expect(screen.queryByLabelText('Restore Welcome Team')).toBeNull();
  });

  it('shows a friendly empty state and retryable restore error', async () => {
    mockUseAppData.mockReturnValue(data({ archivedTeams: [] }));
    const empty = render(<ArchivedTeamsScreen />);
    expect(empty.getByText('No archived teams')).toBeTruthy();

    mockUseAppData.mockReturnValue(
      data({ restoreTeam: jest.fn().mockRejectedValue(new Error('Please try again.')) }),
    );
    const failed = render(<ArchivedTeamsScreen />);
    fireEvent.press(failed.getByLabelText('Restore Welcome Team'));
    expect(await failed.findByText('Please try again.')).toBeTruthy();
  });
});

describe('ArchivedTeamsScreen access and scope safety', () => {
  it('shows only archived metadata from the current church', () => {
    mockUseAppData.mockReturnValue(data({ archivedTeams: [ARCHIVED,
      { ...ARCHIVED, id: 'other', organisation_id: 'other-church', name: 'Other church team' },
      { ...ARCHIVED, id: 'active', archived_at: null, name: 'Active team' },
    ] }));
    const screen = render(<ArchivedTeamsScreen />);
    expect(screen.getByText(ARCHIVED.name)).toBeTruthy();
    expect(screen.queryByText('Other church team')).toBeNull();
    expect(screen.queryByText('Active team')).toBeNull();
    fireEvent.press(screen.getByLabelText('Back to teams'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });

  it('distinguishes initial loading and load failure from an empty archive', () => {
    const refreshTeams = jest.fn();
    mockUseAppData.mockReturnValue(data({ archivedTeams: [], teamsLoading: true, refreshTeams }));
    const screen = render(<ArchivedTeamsScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading archived teams...' })).toBeTruthy();
    expect(screen.queryByText('No archived teams')).toBeNull();
    mockUseAppData.mockReturnValue(data({ archivedTeams: [], teamsError: 'Offline', refreshTeams }));
    screen.rerender(<ArchivedTeamsScreen />);
    expect(screen.getByText("Couldn't load archived teams")).toBeTruthy();
    expect(screen.queryByText('No archived teams')).toBeNull();
    fireEvent.press(screen.getByLabelText('Try Again'));
    expect(refreshTeams).toHaveBeenCalledTimes(1);
  });

  it('retains previously loaded metadata on refresh failure', () => {
    const refreshTeams = jest.fn();
    mockUseAppData.mockReturnValue(data({ teamsError: 'Offline', refreshTeams }));
    const screen = render(<ArchivedTeamsScreen />);
    expect(screen.getByText(ARCHIVED.name)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry archived teams'));
    expect(refreshTeams).toHaveBeenCalledTimes(1);
  });

  it.each(['scope', 'authority', 'already-restored'])('cancels a stale restore confirmation when %s changes', async (change) => {
    let finish!: (approved: boolean) => void;
    mockUseConfirm.mockReturnValue(jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })));
    const restoreTeam = jest.fn();
    mockUseAppData.mockReturnValue(data({ restoreTeam }));
    const screen = render(<ArchivedTeamsScreen />);
    fireEvent.press(screen.getByLabelText('Restore Welcome Team'));
    if (change === 'already-restored') mockUseAppData.mockReturnValue(data({ archivedTeams: [], restoreTeam }));
    else mockUseAuth.mockReturnValue({ ...mockUseAuth(), user: {
      profile: { ...PROFILE, organisation_id: change === 'scope' ? 'other-church' : PROFILE.organisation_id },
      orgRole: change === 'authority' ? 'general_member' : 'church_admin', memberships: [],
    } });
    screen.rerender(<ArchivedTeamsScreen />);
    await act(async () => finish(true));
    expect(restoreTeam).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('suppresses completion after the archive screen unmounts', async () => {
    let finish!: (team: Team) => void;
    const restoreTeam = jest.fn(() => new Promise<Team>((resolve) => { finish = resolve; }));
    mockUseAppData.mockReturnValue(data({ restoreTeam }));
    const screen = render(<ArchivedTeamsScreen />);
    fireEvent.press(screen.getByLabelText('Restore Welcome Team'));
    await waitFor(() => expect(restoreTeam).toHaveBeenCalledTimes(1));
    screen.unmount();
    await act(async () => finish({ ...ARCHIVED, archived_at: null }));
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
