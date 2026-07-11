import { fireEvent, render } from '@testing-library/react-native';

import { Team } from '../../../types';
import { TeamIdentityHeader } from '../TeamSpaceScreen';
import { useTeamAvatar } from '../useTeamAvatar';

jest.mock('../useTeamAvatar', () => ({ useTeamAvatar: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  useRequiredUser: jest.fn(),
}));

const mockUseTeamAvatar = useTeamAvatar as jest.Mock;
const TEAM: Team = {
  id: '30000000-0000-4000-a000-000000000001',
  organisation_id: 'org-live',
  name: 'Choir',
  description: 'Leading worship each Sunday.',
  type: 'choir',
  avatar_url: null,
  created_at: '2026-07-11T00:00:00Z',
};

function avatarState(canManage: boolean) {
  return {
    canManage,
    hasPhoto: false,
    avatarUri: undefined,
    busy: null,
    changePhoto: jest.fn(),
    removePhoto: jest.fn(),
  };
}

describe('TeamIdentityHeader', () => {
  it('never shows avatar management controls in normal view', () => {
    mockUseTeamAvatar.mockReturnValue(avatarState(true));
    const screen = render(<TeamIdentityHeader team={TEAM} onOpenSettings={jest.fn()} />);
    expect(screen.queryByTestId('team-avatar-management-controls')).toBeNull();
    expect(screen.queryByText('Add team photo')).toBeNull();
    expect(screen.queryByText('Change team photo')).toBeNull();
    expect(screen.queryByText('Remove photo')).toBeNull();
  });

  it('hides the settings action from ordinary members', () => {
    mockUseTeamAvatar.mockReturnValue(avatarState(false));
    const screen = render(<TeamIdentityHeader team={TEAM} onOpenSettings={jest.fn()} />);
    expect(screen.queryByTestId('team-settings-action')).toBeNull();
  });

  it('shows a subtle settings action to authorised leaders/admins', () => {
    mockUseTeamAvatar.mockReturnValue(avatarState(true));
    const onOpenSettings = jest.fn();
    const screen = render(<TeamIdentityHeader team={TEAM} onOpenSettings={onOpenSettings} />);
    fireEvent.press(screen.getByTestId('team-settings-action'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
