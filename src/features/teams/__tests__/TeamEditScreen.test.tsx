import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import { Team, UserProfile } from '../../../types';
import TeamEditScreen from '../TeamEditScreen';
import { useTeamAvatar } from '../useTeamAvatar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
let mockTeamId = '30000000-0000-4000-a000-000000000001';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: mockTeamId }),
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
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
    refreshTeams: jest.fn(),
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
  mockCanGoBack.mockReturnValue(true);
  mockTeamId = TEAM.id;
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
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
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
    mockUseAppData.mockReturnValue(makeData({ teams: [], archivedTeams: [{ ...TEAM, archived_at: '2026-07-15T01:00:00Z' }], archiveTeam }));
    screen.rerender(<TeamEditScreen />);
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

describe('TeamEditScreen draft, access and async boundaries', () => {
  it('retains an edited draft through a same-profile authority refresh', () => {
    const screen = render(<TeamEditScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Typed name');
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'Typed detail');
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'loading' });
    screen.rerender(<TeamEditScreen />);
    expect(screen.queryByLabelText('Team name')).toBeNull();
    mockUseAppData.mockReturnValue(makeData({ teams: [{ ...TEAM, name: 'Refreshed name' }] }));
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'ready' });
    screen.rerender(<TeamEditScreen />);
    expect(screen.getByLabelText('Team name').props.value).toBe('Typed name');
    expect(screen.getByLabelText('Description (optional)').props.value).toBe('Typed detail');
  });

  it.each(['save', 'archive'])('retains a successful %s during authority refresh and defers completion until ready', async (action) => {
    let finish!: (team: Team) => void;
    const mutation = jest.fn(() => new Promise<Team>((resolve) => { finish = resolve; }));
    mockUseAppData.mockReturnValue(makeData({ [action === 'save' ? 'updateTeam' : 'archiveTeam']: mutation }));
    const screen = render(<TeamEditScreen />);
    fireEvent.press(screen.getByLabelText(action === 'save' ? 'Save changes' : 'Archive team'));
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'loading' });
    screen.rerender(<TeamEditScreen />);
    const result = { ...TEAM, archived_at: action === 'archive' ? '2026-07-15T01:00:00Z' : null };
    if (action === 'archive') mockUseAppData.mockReturnValue(makeData({ teams: [], archivedTeams: [result], archiveTeam: mutation }));
    await act(async () => finish(result));
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountStatus: 'ready' });
    screen.rerender(<TeamEditScreen />);
    await waitFor(() => expect(action === 'save' ? mockBack : mockReplace).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(action === 'save' ? 'Team details updated.' : 'Team archived.');
    screen.rerender(<TeamEditScreen />);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('hydrates a late team once and preserves the typed draft through refreshes', () => {
    mockUseAppData.mockReturnValue(makeData({ teams: [], teamsLoading: true }));
    const screen = render(<TeamEditScreen />);
    expect(screen.getByText('Loading this team...')).toBeTruthy();
    mockUseAppData.mockReturnValue(makeData());
    screen.rerender(<TeamEditScreen />);
    expect(screen.getByLabelText('Team name').props.value).toBe(TEAM.name);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Unsaved new name');
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'Unsaved detail');
    mockUseAppData.mockReturnValue(makeData({ teams: [{ ...TEAM, name: 'Remote change', description: 'Remote detail' }] }));
    screen.rerender(<TeamEditScreen />);
    expect(screen.getByLabelText('Team name').props.value).toBe('Unsaved new name');
    expect(screen.getByLabelText('Description (optional)').props.value).toBe('Unsaved detail');
  });

  it('resets the draft when a different team route arrives', () => {
    const screen = render(<TeamEditScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Unsaved name');
    mockTeamId = 'another-team';
    mockUseAppData.mockReturnValue(makeData({ teams: [{ ...TEAM, id: mockTeamId, name: 'Care Team' }] }));
    screen.rerender(<TeamEditScreen />);
    expect(screen.getByLabelText('Team name').props.value).toBe('Care Team');
  });

  it.each(['cross-church', 'archived'])('does not expose another church or archived content: %s', (kind) => {
    mockUseAppData.mockReturnValue(makeData({ teams: [{ ...TEAM,
      ...(kind === 'cross-church' ? { organisation_id: 'another-church' } : { archived_at: '2026-07-15T01:00:00Z' }),
    }] }));
    const screen = render(<TeamEditScreen />);
    expect(screen.queryByLabelText('Team name')).toBeNull();
    expect(screen.queryByText(TEAM.name)).toBeNull();
    expect(mockUseAvatar).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Back to teams'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/teams');
  });

  it('distinguishes load failure and retries instead of reporting a missing team', () => {
    const refreshTeams = jest.fn();
    mockUseAppData.mockReturnValue(makeData({ teams: [], teamsError: 'Offline', refreshTeams }));
    const screen = render(<TeamEditScreen />);
    expect(screen.getByText("Couldn't load this team")).toBeTruthy();
    expect(screen.queryByText('Team not found')).toBeNull();
    fireEvent.press(screen.getByLabelText('Try Again'));
    expect(refreshTeams).toHaveBeenCalledTimes(1);
  });

  it('validates both fields and offers a confirmed Cancel without saving the draft', async () => {
    mockCanGoBack.mockReturnValue(false);
    const data = makeData();
    mockUseAppData.mockReturnValue(data);
    const screen = render(<TeamEditScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), ' ');
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'd'.repeat(501));
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(screen.getAllByText('Enter a team name.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Keep the description to 500 characters or fewer.').length).toBeGreaterThan(0);
    expect(data.updateTeam).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Cancel'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/teams/[teamId]', params: { teamId: TEAM.id } }));
  });

  it('prevents same-frame duplicate saves and ignores completion after scope change', async () => {
    let finish!: (team: Team) => void;
    const updateTeam = jest.fn(() => new Promise<Team>((resolve) => { finish = resolve; }));
    mockUseAppData.mockReturnValue(makeData({ updateTeam }));
    const screen = render(<TeamEditScreen />);
    const button = screen.getByLabelText('Save changes');
    act(() => { fireEvent.press(button); fireEvent.press(button); });
    expect(updateTeam).toHaveBeenCalledTimes(1);
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), user: { profile: { ...PROFILE, organisation_id: 'another-church' }, orgRole: 'church_admin', memberships: [] } });
    screen.rerender(<TeamEditScreen />);
    await act(async () => finish(TEAM));
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each(['authority', 'scope', 'archived'])('rechecks the archive action after confirmation: %s changes', async (change) => {
    let finish!: (approved: boolean) => void;
    const confirm = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const archiveTeam = jest.fn();
    mockUseConfirm.mockReturnValue(confirm);
    mockUseAppData.mockReturnValue(makeData({ archiveTeam }));
    const screen = render(<TeamEditScreen />);
    fireEvent.changeText(screen.getByLabelText('Team name'), 'Unsaved team');
    fireEvent.press(screen.getByLabelText('Archive team'));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Unsaved name or description changes will not be saved.') }));
    if (change === 'archived') mockUseAppData.mockReturnValue(makeData({ teams: [], archivedTeams: [{ ...TEAM, archived_at: '2026-07-15T01:00:00Z' }], archiveTeam }));
    else mockUseAuth.mockReturnValue({ ...mockUseAuth(), user: {
      profile: { ...PROFILE, organisation_id: change === 'scope' ? 'other-church' : PROFILE.organisation_id },
      orgRole: change === 'authority' ? 'general_member' : 'church_admin', memberships: [],
    } });
    screen.rerender(<TeamEditScreen />);
    await act(async () => finish(true));
    expect(archiveTeam).not.toHaveBeenCalled();
  });

  it('does not toast or navigate after leaving an in-flight archive', async () => {
    let finish!: (team: Team) => void;
    const archiveTeam = jest.fn(() => new Promise<Team>((resolve) => { finish = resolve; }));
    mockUseAppData.mockReturnValue(makeData({ archiveTeam }));
    const screen = render(<TeamEditScreen />);
    fireEvent.press(screen.getByLabelText('Archive team'));
    await waitFor(() => expect(archiveTeam).toHaveBeenCalledTimes(1));
    screen.unmount();
    await act(async () => finish({ ...TEAM, archived_at: '2026-07-15T01:00:00Z' }));
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

it('keeps the team name and description when discard is dismissed', async () => {
  const confirm = jest.fn().mockResolvedValue(false); mockUseConfirm.mockReturnValue(confirm);
  const data = makeData(); mockUseAppData.mockReturnValue(data);
  const screen = render(<TeamEditScreen />);
  fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'My team draft');
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your team name and description changes will not be saved.' }));
  expect(mockBack).not.toHaveBeenCalled(); expect(data.updateTeam).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('My team draft')).toBeTruthy();
});
