import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAuth } from '../../../lib/auth/AuthContext';
import NoOrganisationsScreen from '../NoOrganisationsScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAuth = useAuth as jest.Mock;
const setGlobalDisplayName = jest.fn();
const refreshAccountContext = jest.fn();
const signOut = jest.fn();

beforeEach(() => {
  mockPush.mockReset();
  setGlobalDisplayName.mockReset().mockResolvedValue(undefined);
  refreshAccountContext.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({
    accountContext: {
      account: { global_display_name: 'New Person' },
      organisations: [],
    },
    authIdentity: { suggestedName: 'New Person' },
    setGlobalDisplayName,
    refreshAccountContext,
    signOut,
  });
});

describe('No organisations screen', () => {
  it('shows create, harmless request placeholder, and sign out', () => {
    const screen = render(<NoOrganisationsScreen />);
    expect(screen.getByText('No organisations yet')).toBeTruthy();
    expect(screen.getByText('Create an organisation')).toBeTruthy();
    expect(screen.getByText('Request to join — Coming soon')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('request to join makes no account or Supabase-facing call', () => {
    const screen = render(<NoOrganisationsScreen />);
    fireEvent.press(screen.getByText('Request to join — Coming soon'));
    expect(setGlobalDisplayName).not.toHaveBeenCalled();
    expect(refreshAccountContext).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('requires and saves a global name before organisation actions', async () => {
    mockUseAuth.mockReturnValue({
      accountContext: { account: { global_display_name: null }, organisations: [] },
      authIdentity: { suggestedName: 'OAuth Suggested Name' },
      setGlobalDisplayName,
      refreshAccountContext,
      signOut,
    });
    const screen = render(<NoOrganisationsScreen />);
    expect(screen.queryByText('Create an organisation')).toBeNull();
    expect(screen.getByDisplayValue('OAuth Suggested Name')).toBeTruthy();
    fireEvent.press(screen.getByText('Save my name'));
    await waitFor(() => expect(setGlobalDisplayName).toHaveBeenCalledWith('OAuth Suggested Name'));
  });
});
