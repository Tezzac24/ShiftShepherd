import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { PROFILE_NAME_REQUIRED, PROFILE_NAME_TOO_LONG } from '../../../lib/supabase/services/profiles';
import ProfileScreen from '../ProfileScreen';
import EditProfileScreen from '../EditProfileScreen';
import { useProfileAvatar } from '../useProfileAvatar';

const mockToast = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('../useProfileAvatar', () => ({ useProfileAvatar: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const mockUseAppData = useAppData as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;
const mockUseProfileAvatar = useProfileAvatar as jest.Mock;
const mockUseConfirm = useConfirm as jest.Mock;
const setProfileDisplayNames = jest.fn();
const leaveOrganisation = jest.fn();
const signOut = jest.fn();
const resetDemoData = jest.fn();
const confirm = jest.fn();
const LIVE_USER = {
  profile: {
    id: 'profile-live', auth_user_id: 'auth-live', organisation_id: 'org-live',
    full_name: 'Sarah Williams', display_name_override: null,
    email: 'sarah@example.com', phone: '+44 7700 900104', avatar_url: null,
    access_status: 'active', access_removed_at: null, access_removed_by: null,
    access_removal_reason: null, created_at: '2026-07-11T00:00:00Z',
  },
  orgRole: 'general_member', memberships: [], supabaseProfileId: 'profile-live',
};

beforeEach(() => {
  mockUseRequiredUser.mockReturnValue(LIVE_USER);
  setProfileDisplayNames.mockReset().mockResolvedValue(undefined);
  leaveOrganisation.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  resetDemoData.mockReset().mockResolvedValue(undefined);
  confirm.mockReset().mockResolvedValue(true);
  mockUseConfirm.mockReturnValue(confirm);
  mockUseAuth.mockReturnValue({
    user: LIVE_USER, authMode: 'supabase', isLoading: false, accountStatus: 'ready', signOut,
    accountContext: {
      account: { global_display_name: 'Sarah Williams', active_profile_id: 'profile-live' },
      organisations: [{ profile: LIVE_USER.profile, organisation: { id: 'org-live', name: 'Grace' } }],
    },
    setProfileDisplayNames, leaveOrganisation, refreshAccountContext: jest.fn(),
  });
  mockUseProfileAvatar.mockReturnValue({
    canManagePhoto: true, hasPhoto: false, avatarUri: undefined, busy: null,
    changePhoto: jest.fn(), takePhoto: jest.fn(), removePhoto: jest.fn(),
  });
  mockUseAppData.mockReturnValue({
    teams: [], memberships: [], organisation: { id: 'org-live', name: 'Fallback church' },
    teamsLoading: false, teamsError: null, updateOwnProfile: jest.fn(), resetDemoData,
  });
});

function demo() {
  mockUseAuth.mockReturnValue({ ...mockUseAuth(), authMode: 'demo', accountContext: null });
  mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, supabaseProfileId: undefined });
  mockUseProfileAvatar.mockReturnValue({ ...mockUseProfileAvatar(), canManagePhoto: false });
}

function edit() {
  return render(<EditProfileScreen />);
}

describe('Profile identity and names', () => {
  it('shows compact identity, resolved church and read-only contact details before editing', () => {
    const screen = render(<ProfileScreen />);
    expect(screen.getByLabelText('Current church: Grace')).toBeTruthy();
    expect(screen.queryByText('Fallback church')).toBeNull();
    expect(screen.getByText('Sarah Williams')).toBeTruthy();
    expect(screen.getByText('sarah@example.com')).toBeTruthy();
    expect(screen.getByText('+44 7700 900104')).toBeTruthy();
    expect(screen.getByTestId('edit-profile-action')).toBeTruthy();
    expect(screen.queryByTestId('profile-edit-form')).toBeNull();
  });

  it('opens editing in its own route and presents both names directly', () => {
    const profile = render(<ProfileScreen />);
    fireEvent.press(profile.getByRole('button', { name: 'Edit profile' }));
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
    profile.unmount();
    const screen = edit();
    expect(screen.getByLabelText('Your name')).toBeTruthy();
    expect(screen.getByLabelText('Username at this church')).toBeTruthy();
    expect(screen.queryByTestId('profile-phone-input')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('opens an existing church name without confusing it with the account name', () => {
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, profile: { ...LIVE_USER.profile, full_name: 'Sarah Choir', display_name_override: 'Sarah Choir' } });
    const screen = edit();
    expect(screen.getByTestId('profile-full-name-input')).toHaveProp('value', 'Sarah Williams');
    expect(screen.getByTestId('profile-organisation-name-input')).toHaveProp('value', 'Sarah Choir');
  });

  it('Cancel confirms before leaving without saving, and a fresh visit starts with the current names', async () => {
    const screen = edit();
    fireEvent.changeText(screen.getByTestId('profile-full-name-input'), 'Someone Else');
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), 'Other Name');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Discard changes?',
      message: 'Your changes to your name and username at this church will not be saved.',
      confirmLabel: 'Discard changes', cancelLabel: 'Keep editing',
    }));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(setProfileDisplayNames).not.toHaveBeenCalled();
    screen.unmount();
    const reopened = edit();
    expect(reopened.getByDisplayValue('Sarah Williams')).toBeTruthy();
    expect(reopened.getByTestId('profile-organisation-name-input')).toHaveProp('value', '');
  });

  it.each([
    ['profile-full-name-input', 'Sarah W.'],
    ['profile-organisation-name-input', 'Choir Sarah'],
    ['profile-full-name-input', 'Sarah Williams '],
    ['profile-organisation-name-input', ' '],
  ])('keeps the draft when discard confirmation is dismissed after changing %s to %j', async (field, value) => {
    confirm.mockResolvedValue(false);
    const screen = edit();
    fireEvent.changeText(screen.getByTestId(field), value);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Cancel' })));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(setProfileDisplayNames).not.toHaveBeenCalled();
    expect(screen.getByTestId(field)).toHaveProp('value', value);
  });

  it('leaves immediately without confirmation when the fields are unchanged or reverted', () => {
    const screen = edit();
    fireEvent.changeText(screen.getByTestId('profile-full-name-input'), 'Sarah W.');
    fireEvent.changeText(screen.getByTestId('profile-full-name-input'), 'Sarah Williams');
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), 'Choir Sarah');
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(setProfileDisplayNames).not.toHaveBeenCalled();
  });

  it('waits for one discard decision when Cancel or visible Back is pressed repeatedly', async () => {
    let finish!: (discard: boolean) => void;
    confirm.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const screen = edit();
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), 'Choir Sarah');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => finish(true));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(setProfileDisplayNames).not.toHaveBeenCalled();
  });

  it('saves exactly the two trimmed names in one atomic action, with no contact or role payload', async () => {
    const screen = edit();
    fireEvent.changeText(screen.getByTestId('profile-full-name-input'), '  Sarah W.  ');
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), '  Sarah Choir  ');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setProfileDisplayNames.mock.calls).toEqual([['Sarah W.', 'Sarah Choir']]));
    expect(mockUseAppData().updateOwnProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith('Profile updated.');
  });

  it('saves a blank church name as null', async () => {
    const screen = edit();
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), '   ');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setProfileDisplayNames).toHaveBeenCalledWith('Sarah Williams', null));
  });

  it.each([['', PROFILE_NAME_REQUIRED], ['x', PROFILE_NAME_REQUIRED], ['x'.repeat(101), PROFILE_NAME_TOO_LONG]])(
    'rejects invalid names with an inline error and a visible field recovery action (%s)', (name, message) => {
      const screen = edit();
      fireEvent.changeText(screen.getByTestId('profile-full-name-input'), name);
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('alert', { name: 'Please check these details' })).toBeTruthy();
      expect(screen.getByRole('button', { name: message })).toBeTruthy();
      expect(screen.getByTestId('profile-full-name-input')).toHaveProp('accessibilityHint', message);
      expect(setProfileDisplayNames).not.toHaveBeenCalled();
      fireEvent.press(screen.getByRole('button', { name: message }));
      expect(screen.getByTestId('profile-edit-form')).toBeTruthy();
    },
  );

  it('preserves drafts on save failure and clears the error on cancellation', async () => {
    setProfileDisplayNames.mockRejectedValue(new Error('Please try again when you are connected.'));
    const screen = edit();
    fireEvent.changeText(screen.getByTestId('profile-full-name-input'), 'Sarah W.');
    fireEvent.changeText(screen.getByTestId('profile-organisation-name-input'), 'Choir Sarah');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Please try again when you are connected.')).toBeTruthy());
    expect(screen.getByDisplayValue('Sarah W.')).toBeTruthy();
    expect(screen.getByDisplayValue('Choir Sarah')).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    screen.unmount();
    const reopened = edit();
    expect(reopened.queryByText('Please try again when you are connected.')).toBeNull();
    expect(reopened.getByDisplayValue('Sarah Williams')).toBeTruthy();
  });

  it('holds the submitted names and blocks repeat save, cancellation and photo actions while saving', async () => {
    let finish!: () => void;
    setProfileDisplayNames.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const screen = edit();
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProp('accessibilityState', expect.objectContaining({ busy: true, disabled: true }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit photo' })).toBeDisabled();
    expect(screen.getByTestId('profile-full-name-input')).toHaveProp('editable', false);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(setProfileDisplayNames).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('profile-edit-form')).toBeTruthy();
    await act(async () => finish());
  });

  it('delegates photo actions to the existing hook, only after an explicit tap', () => {
    mockUseProfileAvatar.mockReturnValue({ ...mockUseProfileAvatar(), hasPhoto: true });
    const screen = edit();
    const photo = mockUseProfileAvatar();
    expect(photo.changePhoto).not.toHaveBeenCalled();
    expect(photo.removePhoto).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Upload photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
    expect(photo.changePhoto).toHaveBeenCalledTimes(1);
    expect(photo.removePhoto).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Photo changes are saved when you make them.')).toBeTruthy();
  });

  it('offers camera capture only from the photo drawer and disables viewing without a photo', () => {
    const screen = edit();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
    expect(screen.getByRole('button', { name: 'View photo' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    expect(mockUseProfileAvatar().takePhoto).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  });

  it('views the resolved photo without starting an upload', () => {
    mockUseProfileAvatar.mockReturnValue({ ...mockUseProfileAvatar(), hasPhoto: true, avatarUri: 'https://example.test/avatar.png' });
    const screen = edit();
    fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
    fireEvent.press(screen.getByRole('button', { name: 'View photo' }));
    expect(screen.getByLabelText("Sarah Williams's profile photo")).toBeTruthy();
    expect(mockUseProfileAvatar().changePhoto).not.toHaveBeenCalled();
  });

  it.each(['picking', 'uploading', 'removing'])('keeps save and cancel blocked while a photo is %s', (busy) => {
    mockUseProfileAvatar.mockReturnValue({ ...mockUseProfileAvatar(), busy, hasPhoto: true });
    const screen = edit();
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(setProfileDisplayNames).not.toHaveBeenCalled();
    expect(screen.getByTestId('profile-edit-form')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps demo identity read-only and reset explicitly demo-only', () => {
    const live = render(<ProfileScreen />);
    expect(live.queryByText('Demo only')).toBeNull();
    expect(live.queryByRole('button', { name: 'Reset demo data' })).toBeNull();
    live.unmount();
    demo();
    const screen = render(<ProfileScreen />);
    expect(screen.queryByTestId('edit-profile-action')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect this church' })).toBeNull();
    expect(screen.getByText('Demo only')).toBeTruthy();
  });
});

describe('Profile church context and destinations', () => {
  it('keeps notification preferences and teams reachable through their existing routes', () => {
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: /Notification preferences/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/notifications');
    fireEvent.press(screen.getByRole('button', { name: /^Teams\./ }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/teams');
  });

  it('summarises only active own memberships without reproducing the team directory', () => {
    mockUseAppData.mockReturnValue({ ...mockUseAppData(),
      teams: [
        { id: 'mine', name: 'Choir', organisation_id: 'org-live', archived_at: null },
        { id: 'other', name: 'Media', organisation_id: 'org-live', archived_at: null },
        { id: 'archived', name: 'Old team', organisation_id: 'org-live', archived_at: '2026-01-01' },
        { id: 'cross', name: 'Other church team', organisation_id: 'other-org', archived_at: null },
      ],
      memberships: [
        { user_id: LIVE_USER.profile.id, team_id: 'mine' }, { user_id: 'someone-else', team_id: 'other' },
        { user_id: LIVE_USER.profile.id, team_id: 'archived' }, { user_id: LIVE_USER.profile.id, team_id: 'cross' },
      ],
    });
    const screen = render(<ProfileScreen />);
    expect(screen.getByText('You belong to 1 team')).toBeTruthy();
    expect(screen.queryByText('Choir')).toBeNull();
    expect(screen.queryByText('Old team')).toBeNull();
  });

  it.each([
    [{ teamsLoading: true }, 'Loading your memberships…'],
    [{ teamsError: 'Offline' }, 'Open Teams to retry your memberships'],
  ])('does not mistake unresolved memberships for no teams (%j)', (state, message) => {
    mockUseAppData.mockReturnValue({ ...mockUseAppData(), ...state });
    const screen = render(<ProfileScreen />);
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText('Find out how to take part in a team')).toBeNull();
  });

  it.each(['general_member', 'announcement_manager', 'event_manager'])('does not show church management to %s', (orgRole) => {
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, orgRole });
    const screen = render(<ProfileScreen />);
    expect(screen.queryByText('Manage church')).toBeNull();
    expect(screen.queryByText('Invitations')).toBeNull();
  });

  it('gives only resolved live church admins the existing member and invitation destinations', () => {
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, orgRole: 'church_admin' });
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: /Church members/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/organisations/members');
    fireEvent.press(screen.getByRole('button', { name: /Invitations/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/organisations/invitations');
    screen.unmount();
    demo();
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, orgRole: 'church_admin', supabaseProfileId: undefined });
    expect(render(<ProfileScreen />).queryByText('Manage church')).toBeNull();
  });

  it('uses the shared church switch and retains its selector route', () => {
    const auth = mockUseAuth();
    mockUseAuth.mockReturnValue({ ...auth, accountContext: { ...auth.accountContext,
      organisations: [...auth.accountContext.organisations, { profile: { id: 'other-profile' }, organisation: { id: 'other-org', name: 'Hope' } }],
    } });
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Switch church' }));
    expect(mockPush).toHaveBeenCalledWith('/organisations/select');
  });

  it('never names a live church from the demo fallback or allows leave while the church is unresolved', () => {
    mockUseAuth.mockReturnValue({ ...mockUseAuth(), accountContext: null, accountStatus: 'loading' });
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, orgRole: 'church_admin' });
    const screen = render(<ProfileScreen />);
    expect(screen.getByText('Loading church…')).toBeTruthy();
    expect(screen.queryByText('Fallback church')).toBeNull();
    expect(screen.queryByText('Manage church')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(leaveOrganisation).not.toHaveBeenCalled();
  });

  it('shows truthful help without advertising a support service', () => {
    const screen = render(<ProfileScreen />);
    expect(screen.getByText('For help with a team, a serving date or church access, speak to your team admin or church admin.')).toBeTruthy();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });
});

describe('Profile account actions', () => {
  it('uses routine confirmation styling and lets Auth own the sign-out destination', async () => {
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Sign out', destructive: false }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it.each(['Sign out', 'Disconnect this church'])('does nothing when %s is cancelled', async (label) => {
    confirm.mockResolvedValue(false);
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(signOut).not.toHaveBeenCalled();
    expect(leaveOrganisation).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('prevents duplicate account actions while a confirmation is pending', async () => {
    let finish!: (value: boolean) => void;
    confirm.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    await act(async () => finish(false));
  });

  it('keeps repeat sign-out and leave blocked during sign-out', async () => {
    let finish!: () => void;
    signOut.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(leaveOrganisation).not.toHaveBeenCalled();
    await act(async () => finish());
  });

  it.each([new Error('Sign-out did not complete.'), 'not-an-error'])('reports sign-out failure and allows retry (%s)', async (failure) => {
    signOut.mockRejectedValue(failure);
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(failure instanceof Error ? failure.message : 'We couldn’t complete the sign out.', 'error'));
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
  });

  it('names the resolved church and preserves every leave consequence without forcing a destination', async () => {
    let finish!: () => void;
    leaveOrganisation.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    await waitFor(() => expect(leaveOrganisation).toHaveBeenCalledTimes(1));
    expect(leaveOrganisation).toHaveBeenCalledWith();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Disconnect from Grace?', confirmLabel: 'Disconnect', destructive: true }));
    const message = confirm.mock.calls[0][0].message;
    expect(message).toMatch(/removes your app access to this church and its teams/);
    expect(message).toMatch(/church role, team memberships and notification registration/);
    expect(message).toMatch(/profile, messages, rota history and account will be kept/);
    expect(message).toMatch(/access to any other churches/);
    expect(message).toMatch(/new invitation/);
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    expect(leaveOrganisation).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(mockToast).toHaveBeenCalledWith('Grace has been disconnected from your account.');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('explains final-admin protection and reports the existing server refusal without local bypass', async () => {
    mockUseRequiredUser.mockReturnValue({ ...LIVE_USER, orgRole: 'church_admin' });
    leaveOrganisation.mockRejectedValue(new Error('Another church admin must be appointed first.'));
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Another church admin must be appointed first.', 'error'));
    expect(confirm.mock.calls[0][0].message).toMatch(/final church admin/);
    expect(screen.getByRole('button', { name: 'Disconnect this church' })).not.toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    await waitFor(() => expect(leaveOrganisation).toHaveBeenCalledTimes(2));
  });

  it('uses friendly fallback copy for an unknown leave failure', async () => {
    leaveOrganisation.mockRejectedValue('not-an-error');
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Disconnect this church' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('We couldn’t disconnect this church.', 'error'));
  });

  it('reset requires confirmation and only delegates to the existing demo reset action', async () => {
    demo();
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Reset demo data' }));
    await waitFor(() => expect(resetDemoData).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0].message).toMatch(/changes you made in this demo/);
    expect(signOut).not.toHaveBeenCalled();
    expect(setProfileDisplayNames).not.toHaveBeenCalled();
    expect(leaveOrganisation).not.toHaveBeenCalled();
  });

  it('does not reset demo data when confirmation is cancelled', async () => {
    demo();
    confirm.mockResolvedValue(false);
    const screen = render(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Reset demo data' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(resetDemoData).not.toHaveBeenCalled();
  });
});
