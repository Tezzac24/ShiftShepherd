import { act, fireEvent, render as renderNative, waitFor } from '@testing-library/react-native';
import React, { useReducer } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { spacing } from '../../../../constants/theme';
import { Button } from '../../../components/Button';
import { useAuth } from '../../../lib/auth/AuthContext';
import {
  acceptOrganisationInvitation,
  previewOrganisationInvitation,
} from '../../../lib/supabase/services/invitations';
import InvitationAcceptScreen from '../InvitationAcceptScreen';
import { ChurchEntryPresentationProvider } from '../../organisations/ChurchEntryPresentation';

const mockToken = 'A'.repeat(43);
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockListeners = new Map<string, () => void>();
const mockNavigation = { setParams: mockSetParams, addListener: (event: string, callback: () => void) => {
  mockListeners.set(event, callback); return () => mockListeners.delete(event);
} };
let mockParams: { token?: string } = { token: mockToken };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useGlobalSearchParams: () => mockParams,
  usePathname: () => '/invite/accept',
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
let redrawAuth = () => {};
const acceptedProfileId = '20000000-0000-4000-a000-000000000099';
const acceptedOrganisationId = '10000000-0000-4000-a000-000000000099';
function Wrapper({ children }: { children: React.ReactNode }) {
  const [, redraw] = useReducer((value) => value + 1, 0);
  redrawAuth = redraw;
  return <ChurchEntryPresentationProvider>{children}</ChurchEntryPresentationProvider>;
}
function render(element: React.ReactElement) { return renderNative(element, { wrapper: Wrapper }); }
function acceptedResult(name?: string) {
  const current = mockUseAuth();
  return { invitationId: 'invitation', profileId: acceptedProfileId, organisationId: acceptedOrganisationId, organisationName: 'Grace Church',
    globalDisplayName: name ?? current.accountContext?.account.global_display_name ?? 'Person Name', alreadyAccepted: false };
}
function publishAcceptedAccount() {
  const current = mockUseAuth();
  const profile = { id: acceptedProfileId, organisation_id: acceptedOrganisationId, auth_user_id: current.authIdentity.id,
    full_name: acceptedResult(mockAccept.mock.calls.at(-1)?.[1]).globalDisplayName, email: current.authIdentity.email, access_status: 'active' };
  mockUseAuth.mockReturnValue({ ...current, accountStatus: 'ready', user: { profile, orgRole: 'general_member', memberships: [], supabaseProfileId: profile.id },
    accountContext: { account: { ...current.accountContext.account, global_display_name: profile.full_name, active_profile_id: profile.id },
      organisations: [{ profile, organisation: { id: acceptedOrganisationId, name: 'Grace Church' } }] } });
  redrawAuth();
}

function auth(overrides: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    authMode: 'supabase',
    accountStatus: 'ready',
    authIdentity: { id: 'auth', email: 'person@example.com', emailVerified: true, suggestedName: null },
    accountContext: {
      account: { auth_user_id: 'auth', global_display_name: 'Person Name', active_profile_id: null },
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
  jest.useFakeTimers();
  jest.clearAllMocks(); mockListeners.clear(); redrawAuth = () => {};
  mockParams = { token: mockToken };
  mockReplace.mockReset();
  mockPush.mockReset();
  mockSetParams.mockReset();
  savePendingInvitation.mockReset().mockResolvedValue(undefined);
  clearPendingInvitation.mockReset().mockResolvedValue(undefined);
  refreshAccountContext.mockReset().mockImplementation(async () => { publishAcceptedAccount(); });
  signOut.mockReset().mockResolvedValue(undefined);
  mockAccept.mockReset().mockImplementation(async (_token, name) => acceptedResult(name));
  previewWith();
  auth();
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('preserves the route token and accepts into the active organisation', async () => {
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByText('Join Grace Church')).toBeTruthy());
  expect(savePendingInvitation).toHaveBeenCalledWith(mockToken);
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(mockToken, undefined));
  expect(clearPendingInvitation).toHaveBeenCalled();
  expect(refreshAccountContext).toHaveBeenCalled();
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
});

it('shows wrong-account handling and preserves the invite through intentional sign-out', async () => {
  previewWith({ accountMatches: false });
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByText('This invitation is for a different account')).toBeTruthy());
  fireEvent.press(screen.getByText('Switch account'));
  await waitFor(() => expect(signOut).toHaveBeenCalledWith({ preservePendingInvitation: true }));
  expect(mockAccept).not.toHaveBeenCalled();
});

it('guides an account without email to switch accounts while preserving the invitation', async () => {
  auth({ authIdentity: { id: 'auth', email: null, emailVerified: false, suggestedName: null } });
  previewWith({ accountMatches: false, verifiedEmailPresent: false });
  const screen = render(<InvitationAcceptScreen />);
  await screen.findByText('Use an account with email');
  expect(screen.getByText('This account has no email address. Switch to an account with the invited email, then confirm that email before accepting.')).toBeTruthy();
  expect(screen.queryByText('Check invitation')).toBeNull();
  expect(screen.queryByText(/Phone-only/)).toBeNull();
  const switchButton = screen.UNSAFE_getAllByType(Button).find((button) => button.props.title === 'Switch account')!;
  expect(switchButton.props.variant).toBeUndefined();
  fireEvent.press(screen.getByText('Switch account'));
  await waitFor(() => expect(signOut).toHaveBeenCalledWith({ preservePendingInvitation: true }));
  expect(clearPendingInvitation).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('leads with checking the invitation after confirming the current account email', async () => {
  auth({ authIdentity: { id: 'auth', email: 'person@example.com', emailVerified: false, suggestedName: null } });
  previewWith({ accountMatches: false, verifiedEmailPresent: false });
  const screen = render(<InvitationAcceptScreen />);
  await screen.findByText('Confirm your account email');
  expect(screen.getByText('Confirm the email on your current account, then return here and choose Check invitation. The verified email must match the invited address.')).toBeTruthy();
  expect(screen.queryByText(/Phone-only/)).toBeNull();
  const buttons = screen.UNSAFE_getAllByType(Button);
  expect(buttons.find((button) => button.props.title === 'Check invitation')!.props.variant).toBeUndefined();
  expect(buttons.find((button) => button.props.title === 'Switch account')!.props.variant).toBe('secondary');
  expect(screen.queryByText('Accept invitation')).toBeNull();

  // Confirmation alone does not establish that this is the invited account.
  previewWith({ accountMatches: false, verifiedEmailPresent: true });
  fireEvent.press(screen.getByText('Check invitation'));
  await screen.findByText('This invitation is for a different account');
  expect(mockPreview).toHaveBeenCalledTimes(2);
  expect(mockPreview).toHaveBeenLastCalledWith(mockToken);
  expect(signOut).not.toHaveBeenCalled();
  expect(clearPendingInvitation).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('keeps switching accounts available as a secondary choice for unverified email', async () => {
  previewWith({ accountMatches: false, verifiedEmailPresent: false });
  const screen = render(<InvitationAcceptScreen />);
  await screen.findByText('Confirm your account email');
  fireEvent.press(screen.getByText('Switch account'));
  await waitFor(() => expect(signOut).toHaveBeenCalledWith({ preservePendingInvitation: true }));
  expect(clearPendingInvitation).not.toHaveBeenCalled();
  expect(mockAccept).not.toHaveBeenCalled();
});

it('does not let a matching email or locally verified identity override the server preview', async () => {
  previewWith({ accountMatches: true, verifiedEmailPresent: false });
  const screen = render(<InvitationAcceptScreen />);
  await screen.findByText('Confirm your account email');
  expect(screen.queryByText('Accept invitation')).toBeNull();
  fireEvent.press(screen.getByText('Check invitation'));
  await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(2));
  await screen.findByText('Confirm your account email');
  expect(mockAccept).not.toHaveBeenCalled();
});

it('uses OAuth metadata only as an editable prefill when the global name is missing', async () => {
  auth({
    authIdentity: { id: 'oauth-auth', email: 'oauth@example.com', emailVerified: true, suggestedName: 'Provider Name' },
    accountContext: { account: { auth_user_id: 'oauth-auth', global_display_name: null }, organisations: [] },
  });
  const screen = render(<InvitationAcceptScreen />);
  await waitFor(() => expect(screen.getByDisplayValue('Provider Name')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Full name'), 'Confirmed Name');
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(mockToken, 'Confirmed Name'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
});

describe('invalid name recovery', () => {
  it('waits for validation layout, then reveals and focuses the field in scroll-content coordinates', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
    let formOffset = 420;
    let fieldOffset = 90;
    const measure = jest.spyOn(View.prototype, 'measureLayout').mockImplementation((_content, onSuccess) => {
      onSuccess(0, formOffset + fieldOffset, 335, 150);
    });
    auth({ accountContext: { account: { auth_user_id: 'auth', global_display_name: null }, organisations: [] } });
    const screen = render(<InvitationAcceptScreen />);
    await screen.findByLabelText('Full name');
    const field = screen.getByTestId('invitation-name-field');
    // The observer is installed at mount, before any validation content exists.
    expect(field).toHaveProp('onLayout', expect.any(Function));
    fireEvent(field, 'layout', { nativeEvent: { layout: { y: fieldOffset, height: 90 } } });
    expect(measure).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Accept invitation'));
    const message = 'Please confirm your full name (at least 2 characters).';
    expect(screen.getByLabelText('Full name')).toHaveProp('accessibilityHint', message);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();

    // The summary moves the field inside a form which is itself below context.
    fieldOffset += 160;
    fireEvent(screen.getByTestId('invitation-name-field'), 'layout', { nativeEvent: { layout: { y: fieldOffset, height: 150 } } });
    expect(measure).toHaveBeenCalledWith(42, expect.any(Function));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: formOffset + fieldOffset - spacing.md, animated: false });
    expect(focus).toHaveBeenCalledTimes(1);

    // A later summary tap re-measures, rather than relying on the old offset.
    formOffset += 120;
    fireEvent.press(screen.getByRole('button', { name: message }));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: formOffset + fieldOffset - spacing.md, animated: false });
    expect(focus).toHaveBeenCalledTimes(2);
    // Re-submitting the same invalid draft needs no new layout event.
    fireEvent.press(screen.getByText('Accept invitation'));
    expect(focus).toHaveBeenCalledTimes(3);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Confirmed Name');
    fireEvent.press(screen.getByText('Accept invitation'));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(mockToken, 'Confirmed Name'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('does not run a delayed field measurement after the invitation loses focus', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
    const measure = jest.spyOn(View.prototype, 'measureLayout').mockImplementation(() => {});
    auth({ accountContext: { account: { auth_user_id: 'auth', global_display_name: null }, organisations: [] } });
    const screen = render(<InvitationAcceptScreen />);
    await screen.findByLabelText('Full name');
    fireEvent.press(screen.getByText('Accept invitation'));
    fireEvent(screen.getByTestId('invitation-name-field'), 'layout', { nativeEvent: { layout: { y: 230, height: 150 } } });
    mockListeners.get('blur')!();
    act(() => measure.mock.calls[0][1](0, 650, 335, 150));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });
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
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
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

    await act(async () => { publishAcceptedAccount(); finishRefresh(); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
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
    expect(screen.queryByText('Not now')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    if (status === 'revoked') expect(screen.getByText('This invitation was cancelled by a church administrator.')).toBeTruthy();
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
    ['an unverified email account', {}, { accountMatches: false, verifiedEmailPresent: false }, 'Confirm your account email'],
    [
      'an account without email',
      { authIdentity: { id: 'auth', email: null, emailVerified: false } },
      { accountMatches: false, verifiedEmailPresent: false },
      'Use an account with email',
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
    await waitFor(() => expect(screen.getByText('Open church')).toBeTruthy());
    expect(screen.getByText('This invitation is already accepted. You can open this church.')).toBeTruthy();
    expect(screen.queryByText(/You’ll join as/)).toBeNull();
    expect(screen.queryByText(/No team or church-admin role/)).toBeNull();
    fireEvent.press(screen.getByText('Open church'));
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

describe('readiness and stale invitation results', () => {
  it('waits for token adoption before clearing a terminal invitation', async () => {
    let finishSave!: () => void;
    savePendingInvitation.mockReturnValue(new Promise<void>((done) => { finishSave = done; }));
    previewWith({ status: 'expired' });
    const screen = render(<InvitationAcceptScreen />);
    await screen.findByText('Invitation unavailable');
    expect(clearPendingInvitation).not.toHaveBeenCalled();
    await act(async () => finishSave());
    await waitFor(() => expect(clearPendingInvitation).toHaveBeenCalledTimes(1));
    expect(mockSetParams).toHaveBeenCalledWith({ token: undefined });
  });

  it('lets a signed-in account set aside a slow preview without running its late result', async () => {
    let finishPreview!: (value: unknown) => void;
    mockPreview.mockReturnValue(new Promise((done) => { finishPreview = done; }));
    const screen = render(<InvitationAcceptScreen />);
    expect(screen.getByText('Not now')).toBeTruthy();
    fireEvent.press(screen.getByText('Not now'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    await act(async () => finishPreview({ status: 'pending', organisationName: 'Old church' }));
    expect(screen.queryByText('Join Old church')).toBeNull();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('exposes preview failure and retry without showing acceptance before server verification', async () => {
    mockPreview.mockRejectedValue(new Error('We couldn’t open the invitation.'));
    const screen = render(<InvitationAcceptScreen />);
    await screen.findByText('Couldn’t open this invitation');
    expect(screen.queryByText('Accept invitation')).toBeNull();
    expect(screen.getByText('Not now')).toBeTruthy();
    previewWith(); fireEvent.press(screen.getByText('Try again'));
    await screen.findByText('Accept invitation');
  });

  it('does not infer account matching when the bounded server preview is unresolved', async () => {
    previewWith({ accountMatches: null, verifiedEmailPresent: null });
    const screen = render(<InvitationAcceptScreen />);
    await screen.findByText('Check this invitation again');
    expect(screen.queryByText('Accept invitation')).toBeNull();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('retains a name draft through same-account readiness and resets it for another account', async () => {
    const state = { accountContext: { account: { auth_user_id: 'auth', global_display_name: null }, organisations: [] } };
    auth(state);
    const screen = render(<InvitationAcceptScreen />);
    await screen.findByLabelText('Full name');
    fireEvent.changeText(screen.getByLabelText('Full name'), 'My Confirmed Name');
    auth({ ...state, accountStatus: 'loading' }); screen.rerender(<InvitationAcceptScreen />);
    expect(screen.queryByText('Accept invitation')).toBeNull();
    auth(state); screen.rerender(<InvitationAcceptScreen />);
    expect(screen.getByDisplayValue('My Confirmed Name')).toBeTruthy();
    auth({ authIdentity: { id: 'another-account', email: 'another@example.com', emailVerified: true, suggestedName: 'Another Person' },
      accountContext: { account: { auth_user_id: 'another-account', global_display_name: null }, organisations: [] } });
    screen.rerender(<InvitationAcceptScreen />);
    await screen.findByDisplayValue('Another Person'); expect(screen.queryByDisplayValue('My Confirmed Name')).toBeNull();
  });

  it('ignores acceptance from a previous account before clearing or refreshing the new account', async () => {
    let finishAccept!: (value: unknown) => void;
    mockAccept.mockReturnValue(new Promise((done) => { finishAccept = done; }));
    const screen = render(<InvitationAcceptScreen />); await screen.findByText('Accept invitation');
    fireEvent.press(screen.getByText('Accept invitation'));
    auth({ authIdentity: { id: 'another-account', email: 'another@example.com', emailVerified: true },
      accountContext: { account: { auth_user_id: 'another-account', global_display_name: 'Another Person' }, organisations: [] } });
    screen.rerender(<InvitationAcceptScreen />);
    await act(async () => finishAccept({ organisationId: 'old-org' }));
    expect(clearPendingInvitation).not.toHaveBeenCalled(); expect(refreshAccountContext).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('fences a late acceptance after a deliberate route exit', async () => {
    let finishAccept!: (value: unknown) => void;
    mockAccept.mockReturnValue(new Promise((done) => { finishAccept = done; }));
    const screen = render(<InvitationAcceptScreen />); await screen.findByText('Accept invitation');
    fireEvent.press(screen.getByText('Accept invitation')); mockListeners.get('beforeRemove')!();
    await act(async () => finishAccept({ organisationId: 'org' }));
    expect(clearPendingInvitation).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps confirmed acceptance when account refresh fails and never re-accepts during recovery', async () => {
    refreshAccountContext.mockRejectedValueOnce(new Error('offline'));
    const screen = render(<InvitationAcceptScreen />); await screen.findByText('Accept invitation');
    fireEvent.press(screen.getByText('Accept invitation'));
    await screen.findByText(/Your church membership is saved. We couldn’t refresh/);
    expect(screen.getByText('Invitation accepted')).toBeTruthy();
    fireEvent.press(screen.getByText('Check my churches'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockAccept).toHaveBeenCalledTimes(1); expect(clearPendingInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not navigate an authenticated account to login when sign-out fails', async () => {
    previewWith({ accountMatches: false }); signOut.mockRejectedValue(new Error('Couldn’t sign out.'));
    const screen = render(<InvitationAcceptScreen />); await screen.findByText('Switch account');
    fireEvent.press(screen.getByText('Switch account'));
    await screen.findByText('Couldn’t sign out.'); expect(mockReplace).not.toHaveBeenCalledWith('/login');
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it('queues a newly opened link after an older terminal token finishes clearing', async () => {
    const nextToken = 'B'.repeat(43);
    let finishClear!: () => void;
    clearPendingInvitation.mockReturnValueOnce(new Promise<void>((done) => { finishClear = done; }));
    mockPreview.mockImplementation(async (value) => ({ organisationName: value === nextToken ? 'Next Church' : 'Old Church', maskedEmail: 'p***@example.com',
      status: value === nextToken ? 'pending' : 'expired', accountMatches: true, verifiedEmailPresent: true, authenticationRequired: true }));
    const screen = render(<InvitationAcceptScreen />); await screen.findByText('Invitation unavailable');
    await waitFor(() => expect(clearPendingInvitation).toHaveBeenCalledTimes(1));
    mockParams = { token: nextToken }; screen.rerender(<InvitationAcceptScreen />);
    await screen.findByText('Join Next Church'); expect(savePendingInvitation).toHaveBeenCalledTimes(1);
    await act(async () => finishClear());
    await waitFor(() => expect(savePendingInvitation).toHaveBeenLastCalledWith(nextToken));
    expect(clearPendingInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not let an old completion release the new account’s duplicate-submit guard', async () => {
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    mockAccept.mockReturnValueOnce(new Promise((done) => { finishOld = done; }))
      .mockReturnValueOnce(new Promise((done) => { finishNew = done; }));
    const screen = render(<InvitationAcceptScreen />); await screen.findByText('Accept invitation');
    fireEvent.press(screen.getByText('Accept invitation'));
    mockParams = { token: 'B'.repeat(43) };
    auth({ authIdentity: { id: 'other-auth', email: 'other@example.com', emailVerified: true },
      accountContext: { account: { auth_user_id: 'other-auth', global_display_name: 'Other Person' }, organisations: [] } });
    screen.rerender(<InvitationAcceptScreen />); await screen.findByText('Accept invitation');
    fireEvent.press(screen.getByText('Accept invitation')); await act(async () => finishOld({ organisationId: 'old' }));
    fireEvent.press(screen.getByText('Accept invitation')); expect(mockAccept).toHaveBeenCalledTimes(2);
    await act(async () => finishNew(acceptedResult()));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });
});
