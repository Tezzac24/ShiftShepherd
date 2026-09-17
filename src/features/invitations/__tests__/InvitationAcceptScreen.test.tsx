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
const mockSetParams = jest.fn();
const mockNavigation = { setParams: mockSetParams };
let mockParams: { token?: string } = { token: mockToken };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
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

function previewWith(overrides: Record<string, unknown> = {}) {
  mockPreview.mockResolvedValue({
    organisationName: 'Grace Church',
    maskedEmail: 'p***@example.com',
    status: 'pending',
    authenticationRequired: true,
    accountMatches: true,
    verifiedEmailPresent: true,
    ...overrides,
  });
}

beforeEach(() => {
  mockParams = { token: mockToken };
  mockReplace.mockReset();
  mockPush.mockReset();
  mockSetParams.mockReset();
  savePendingInvitation.mockReset().mockResolvedValue(undefined);
  clearPendingInvitation.mockReset().mockResolvedValue(undefined);
  refreshAccountContext.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  mockAccept.mockReset().mockResolvedValue({ organisationId: 'org' });
  previewWith();
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
  previewWith({ accountMatches: false });
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByText('This invitation is for a different account')).toBeTruthy());
  fireEvent.press(screen.getByText('Switch account'));
  await waitFor(() => expect(signOut).toHaveBeenCalledWith({ preservePendingInvitation: true }));
  expect(mockAccept).not.toHaveBeenCalled();
});

it('rejects a phone-only account before acceptance', async () => {
  previewWith({ accountMatches: false, verifiedEmailPresent: false });
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

describe('pending link lifecycle', () => {
  it('adopts an opened link once and then removes its token from the route', async () => {
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ token: undefined }));
    expect(savePendingInvitation).toHaveBeenCalledTimes(1);

    // The pending token lands, and is then cleared by acceptance or cleanup
    // while this screen is still showing the link: nothing may save it again.
    auth({ pendingInvitationToken: mockToken });
    screen.rerender(<InvitationAcceptScreen />);
    auth({ pendingInvitationToken: null });
    screen.rerender(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText('Join Grace Church')).toBeTruthy());
    expect(savePendingInvitation).toHaveBeenCalledTimes(1);
  });

  it('keeps the route token when the device cannot store it', async () => {
    savePendingInvitation.mockRejectedValue(new Error('keychain unavailable'));
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() =>
      expect(screen.getByText('We couldn’t keep this invitation ready on this device.')).toBeTruthy(),
    );
    expect(mockSetParams).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Accept invitation'));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(mockToken, undefined));
  });

  it('keeps explaining an unavailable pending invitation after clearing it', async () => {
    mockParams = {};
    auth({ pendingInvitationToken: mockToken });
    previewWith({ status: 'expired' });
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText('Invitation unavailable')).toBeTruthy());
    await waitFor(() => expect(clearPendingInvitation).toHaveBeenCalled());

    auth({ pendingInvitationToken: null });
    screen.rerender(<InvitationAcceptScreen />);

    expect(screen.getByText('Invitation unavailable')).toBeTruthy();
    expect(
      screen.getByText('This invitation has expired. Ask a church administrator to send a new one.'),
    ).toBeTruthy();
    expect(screen.queryByText('Invitation not found')).toBeNull();
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it('keeps the invitation on screen while an accepted invitation refreshes the account', async () => {
    mockParams = {};
    auth({ pendingInvitationToken: mockToken });
    let finishRefresh: () => void = () => undefined;
    refreshAccountContext.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
    fireEvent.press(screen.getByText('Accept invitation'));
    await waitFor(() => expect(refreshAccountContext).toHaveBeenCalled());

    auth({ pendingInvitationToken: null });
    screen.rerender(<InvitationAcceptScreen />);
    expect(screen.getByText('Join Grace Church')).toBeTruthy();
    expect(screen.queryByText('Invitation not found')).toBeNull();

    finishRefresh();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home'));
  });
});

describe('leaving an invitation', () => {
  it.each([
    ['expired', 'Invitation unavailable'],
    ['revoked', 'Invitation unavailable'],
    ['superseded', 'Invitation unavailable'],
    ['invalid', 'Invitation not found'],
  ])('continues through the routing hub from the %s state while signed in', async (status, title) => {
    previewWith({ status });
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.queryByText('Back to sign in')).toBeNull();
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(clearPendingInvitation).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith('/login');
  });

  it('returns to sign in through the routing hub while signed out', async () => {
    auth({ isAuthenticated: false, authMode: null, authIdentity: null, accountContext: null });
    previewWith({ status: 'revoked', accountMatches: null, verifiedEmailPresent: null });
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText('Invitation unavailable')).toBeTruthy());
    fireEvent.press(screen.getByText('Back to sign in'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(clearPendingInvitation).toHaveBeenCalled();
  });

  it('leaves a link with no usable token through the routing hub', async () => {
    mockParams = { token: 'truncated' };
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText('Invitation not found')).toBeTruthy());
    expect(savePendingInvitation).not.toHaveBeenCalled();
    expect(mockPreview).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it.each([
    ['a matching account', {}, {}, 'Accept invitation'],
    ['a different account', {}, { accountMatches: false }, 'This invitation is for a different account'],
    [
      'a phone-only account',
      {},
      { accountMatches: false, verifiedEmailPresent: false },
      'A verified email is required',
    ],
    ['a demo account', { authMode: 'demo', authIdentity: null, accountContext: null }, {}, 'Use your church account'],
  ])('lets %s set the invitation aside', async (_label, authOverrides, previewOverrides, marker) => {
    auth(authOverrides);
    previewWith(previewOverrides);
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText(marker)).toBeTruthy());
    fireEvent.press(screen.getByText('Not now'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(clearPendingInvitation).toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('never strands an account whose acceptance the server refuses', async () => {
    previewWith({ status: 'accepted' });
    mockAccept.mockRejectedValue(
      new Error('We couldn’t update that invitation right now. Please try again.'),
    );
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText('Open organisation')).toBeTruthy());
    fireEvent.press(screen.getByText('Open organisation'));
    await waitFor(() => expect(screen.getByText(/Please try again/)).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Not now'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(clearPendingInvitation).toHaveBeenCalledTimes(1);
  });

  it('keeps sign-in as the only way forward before the account is known', async () => {
    auth({ isAuthenticated: false, authMode: null, authIdentity: null, accountContext: null });
    previewWith({ accountMatches: null, verifiedEmailPresent: null });
    const screen = render(<InvitationAcceptScreen />);
    await waitFor(() => expect(screen.getByText('Sign in or create your account')).toBeTruthy());
    expect(screen.queryByText('Not now')).toBeNull();
    fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
