import { render } from '@testing-library/react-native';

import { Team } from '../../../types';
import { TeamIdentityHeader } from '../TeamSpaceScreen';
import { useTeamAvatar } from '../useTeamAvatar';

jest.mock('../useTeamAvatar', () => ({ useTeamAvatar: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

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

describe('TeamIdentityHeader avatar controls', () => {
  it('hides management controls from ordinary members', () => {
    mockUseTeamAvatar.mockReturnValue(avatarState(false));
    const screen = render(<TeamIdentityHeader team={TEAM} />);
    expect(screen.queryByTestId('team-avatar-management-controls')).toBeNull();
  });

  it('shows management controls to authorised leaders/admins', () => {
    mockUseTeamAvatar.mockReturnValue(avatarState(true));
    const screen = render(<TeamIdentityHeader team={TEAM} />);
    expect(screen.getByTestId('team-avatar-management-controls')).toBeTruthy();
    expect(screen.getByText('Add team photo')).toBeTruthy();
  });
});
