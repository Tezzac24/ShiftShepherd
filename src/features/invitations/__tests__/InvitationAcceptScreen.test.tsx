import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAuth } from '../../../lib/auth/AuthContext';
import {
  acceptOrganisationInvitation,
  previewOrganisationInvitation,
} from '../../../lib/supabase/services/invitations';
import InvitationAcceptScreen from '../InvitationAcceptScreen';

const mockToken = 'A'.repeat(43);
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ token: mockToken }),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/supabase/services/invitations', () => ({
  previewOrganisationInvitation: jest.fn(),
  acceptOrganisationInvitation: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockPreview = previewOrganisationInvitation as jest.Mock;
const mockAccept = acceptOrganisationInvitation as jest.Mock;
const savePendingInvitation = jest.fn();
const clearPendingInvitation = jest.fn();
const refreshAccountContext = jest.fn();
const signOut = jest.fn();

function auth(overrides: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    authMode: 'supabase',
    authIdentity: { id: 'auth', suggestedName: null },
    accountContext: {
      account: { global_display_name: 'Person Name' },
      organisations: [],
    },
    pendingInvitationToken: null,
    savePendingInvitation,
    clearPendingInvitation,
    refreshAccountContext,
    signOut,
    ...overrides,
  });
}

beforeEach(() => {
  mockReplace.mockReset();
  mockPush.mockReset();
  savePendingInvitation.mockReset().mockResolvedValue(undefined);
  clearPendingInvitation.mockReset().mockResolvedValue(undefined);
  refreshAccountContext.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  mockAccept.mockReset().mockResolvedValue({ organisationId: 'org' });
  mockPreview.mockReset().mockResolvedValue({
    organisationName: 'Grace Church',
    maskedEmail: 'p***@example.com',
    status: 'pending',
    authenticationRequired: true,
    accountMatches: true,
    verifiedEmailPresent: true,
  });
  auth();
});

it('preserves the route token and accepts into the active organisation', async () => {
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByText('Join Grace Church')).toBeTruthy());
  expect(savePendingInvitation).toHaveBeenCalledWith(mockToken);
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(mockToken, undefined));
  expect(clearPendingInvitation).toHaveBeenCalled();
  expect(refreshAccountContext).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
});

it('shows wrong-account handling and preserves the invite through intentional sign-out', async () => {
  mockPreview.mockResolvedValue({
    organisationName: 'Grace Church',
    maskedEmail: 'p***@example.com',
    status: 'pending',
    authenticationRequired: true,
    accountMatches: false,
    verifiedEmailPresent: true,
  });
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByText('This invitation is for a different account')).toBeTruthy());
  fireEvent.press(screen.getByText('Switch account'));
  await waitFor(() => expect(signOut).toHaveBeenCalledWith({ preservePendingInvitation: true }));
  expect(mockAccept).not.toHaveBeenCalled();
});

it('rejects a phone-only account before acceptance', async () => {
  mockPreview.mockResolvedValue({
    organisationName: 'Grace Church',
    maskedEmail: 'p***@example.com',
    status: 'pending',
    authenticationRequired: true,
    accountMatches: false,
    verifiedEmailPresent: false,
  });
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByText('A verified email is required')).toBeTruthy());
  expect(mockAccept).not.toHaveBeenCalled();
});

it('uses OAuth metadata only as an editable prefill when the global name is missing', async () => {
  auth({
    authIdentity: { id: 'oauth-auth', suggestedName: 'Provider Name' },
    accountContext: { account: { global_display_name: null }, organisations: [] },
  });
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByDisplayValue('Provider Name')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Full name'), 'Confirmed Name');
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(mockToken, 'Confirmed Name'));
});
