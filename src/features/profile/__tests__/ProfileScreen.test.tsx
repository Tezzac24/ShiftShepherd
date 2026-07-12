import { fireEvent, render, waitFor } from '@testing-library/react-native';

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
const setProfileDisplayNames = jest.fn();

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
  setProfileDisplayNames.mockReset().mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({
    authMode: 'supabase',
    signOut: jest.fn(),
    accountContext: {
      account: { global_display_name: 'Sarah Williams', active_profile_id: 'profile-live' },
      organisations: [
        { profile: LIVE_USER.profile, organisation: { id: 'org-live', name: 'Grace' } },
      ],
    },
    setProfileDisplayNames,
  });
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
    memberships: [],
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

  it('shows the stored phone as read-only text in view mode', () => {
    const screen = render(<ProfileScreen />);
    expect(screen.getByText('+44 7700 900104')).toBeTruthy();
    expect(screen.queryByTestId('profile-phone-input')).toBeNull();
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

  it('edit mode separates the global and organisation names while contacts stay read-only', () => {
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId('edit-profile-action'));
    expect(screen.getByTestId('profile-full-name-input')).toBeTruthy();
    expect(screen.getByTestId('profile-organisation-name-input')).toBeTruthy();
    expect(screen.queryByTestId('profile-phone-input')).toBeNull();
    const contact = screen.getByTestId('profile-contact-details');
    expect(contact).toBeTruthy();
    expect(screen.getByText('sarah@example.com')).toBeTruthy();
    expect(screen.getByText('+44 7700 900104')).toBeTruthy();
  });

  it('shows a neutral fallback when no phone is stored, with no edit control', () => {
    mockUseRequiredUser.mockReturnValue({
      ...LIVE_USER,
      profile: { ...LIVE_USER.profile, phone: null },
    });
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId('edit-profile-action'));
    expect(screen.getByText('Not added')).toBeTruthy();
    expect(screen.queryByTestId('profile-phone-input')).toBeNull();
  });

  it('Cancel restores the original name after typing', () => {
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId('edit-profile-action'));
    fireEvent.changeText(screen.getByTestId('profile-full-name-input'), 'Someone Else');
    fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getByTestId('edit-profile-action'));
    expect(screen.getByDisplayValue('Sarah Williams')).toBeTruthy();
  });

  it('saves global and organisation names through separate self-owned actions', async () => {
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByTestId('edit-profile-action'));
    fireEvent.changeText(screen.getByTestId('profile-full-name-input'), 'Sarah W.');
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), 'Sarah Choir');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(setProfileDisplayNames).toHaveBeenCalledWith('Sarah W.', 'Sarah Choir'),
    );
  });

  it('keeps demo mode read-only', () => {
    mockUseAuth.mockReturnValue({ authMode: 'demo', signOut: jest.fn(), accountContext: null });
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, supabaseProfileId: undefined });
    const screen = render(<ProfileScreen />);
    expect(screen.queryByTestId('edit-profile-action')).toBeNull();
    expect(screen.queryByTestId('profile-full-name-input')).toBeNull();
  });
});
