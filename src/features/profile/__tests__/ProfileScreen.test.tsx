import { fireEvent, render } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import ProfileScreen from '../ProfileScreen';
import { useProfileAvatar } from '../useProfileAvatar';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  useRequiredUser: jest.fn(),
}));
jest.mock('../useProfileAvatar', () => ({ useProfileAvatar: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: () => jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseProfileAvatar = useProfileAvatar as jest.Mock;

const LIVE_USER = {
  profile: {
    id: 'profile-live',
    auth_user_id: 'auth-live',
    organisation_id: 'org-live',
    full_name: 'Sarah Williams',
    email: 'sarah@example.com',
    phone: '+44 7700 900104',
    avatar_url: null,
    created_at: '2026-07-11T00:00:00Z',
  },
  orgRole: 'general_member',
  memberships: [],
  supabaseProfileId: 'profile-live',
};

beforeEach(() => {
  mockUseRequiredUser.mockReturnValue(LIVE_USER);
  mockUseAuth.mockReturnValue({ authMode: 'supabase', signOut: jest.fn() });
  mockUseProfileAvatar.mockReturnValue({
    canManagePhoto: true,
    hasPhoto: false,
    avatarUri: undefined,
    busy: null,
    changePhoto: jest.fn(),
    removePhoto: jest.fn(),
  });
  mockUseAppData.mockReturnValue({
    teams: [],
    updateOwnProfile: jest.fn(),
    resetDemoData: jest.fn(),
  });
});

describe('ProfileScreen edit presentation', () => {
  it('shows the compact edit action in view mode and no editable fields', () => {
    const screen = render(<ProfileScreen />);
    expect(screen.getByTestId('edit-profile-action')).toBeTruthy();
    expect(screen.queryByTestId('profile-edit-form')).toBeNull();
    expect(screen.queryByTestId('profile-full-name-input')).toBeNull();
  });

  it('shows Save and Cancel in edit mode, then Cancel returns to view mode', () => {
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId('edit-profile-action'));
    expect(screen.getByTestId('profile-edit-form')).toBeTruthy();
    expect(screen.getByTestId('profile-full-name-input')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByTestId('profile-edit-form')).toBeNull();
  });

  it('keeps demo mode read-only', () => {
    mockUseAuth.mockReturnValue({ authMode: 'demo', signOut: jest.fn() });
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, supabaseProfileId: undefined });
    const screen = render(<ProfileScreen />);
    expect(screen.queryByTestId('edit-profile-action')).toBeNull();
    expect(screen.queryByTestId('profile-full-name-input')).toBeNull();
  });
});
