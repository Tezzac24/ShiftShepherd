import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { Team, UserProfile } from '../../../types';
import ArchivedTeamsScreen from '../ArchivedTeamsScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
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
    fireEvent.press(screen.getByLabelText('Restore team'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(restoreTeam).toHaveBeenCalledWith(ARCHIVED.id);
    expect(mockToast).toHaveBeenCalledWith('Welcome Team was restored.');
  });

  it('cancellation and repeated taps do not duplicate restore calls', async () => {
    const restoreTeam = jest.fn();
    mockUseAppData.mockReturnValue(data({ restoreTeam }));
    const cancelConfirm = jest.fn().mockResolvedValue(false);
    mockUseConfirm.mockReturnValue(cancelConfirm);
    const cancelled = render(<ArchivedTeamsScreen />);
    fireEvent.press(cancelled.getByLabelText('Restore team'));
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
    fireEvent.press(pending.getByLabelText('Restore team'));
    fireEvent.press(pending.getByLabelText('Restore team'));
    await waitFor(() => expect(pendingRestore).toHaveBeenCalledTimes(1));
    resolveRestore({ ...ARCHIVED, archived_at: null, archived_by: null });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Welcome Team was restored.'));
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
    expect(screen.queryByLabelText('Restore team')).toBeNull();
  });

  it('shows a friendly empty state and retryable restore error', async () => {
    mockUseAppData.mockReturnValue(data({ archivedTeams: [] }));
    const empty = render(<ArchivedTeamsScreen />);
    expect(empty.getByText('No archived teams')).toBeTruthy();

    mockUseAppData.mockReturnValue(
      data({ restoreTeam: jest.fn().mockRejectedValue(new Error('Please try again.')) }),
    );
    const failed = render(<ArchivedTeamsScreen />);
    fireEvent.press(failed.getByLabelText('Restore team'));
    expect(await failed.findByText('Please try again.')).toBeTruthy();
  });
});
