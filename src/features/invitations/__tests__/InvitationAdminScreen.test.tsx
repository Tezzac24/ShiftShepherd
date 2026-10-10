import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { listOrganisationMembers } from '../../../lib/supabase/services/organisationMemberships';
import { listOrganisationInvitations, resendOrganisationInvitation, revokeOrganisationInvitation, sendOrganisationInvitation } from '../../../lib/supabase/services/invitations';
import { ADMIN, adminAuth, deferred, DIRECTORY, MEMBER, memberProfile, ORGANISATION_ID, REMOVED } from '../../organisations/__tests__/organisationAdminFixtures';
import InvitationAdminScreen from '../InvitationAdminScreen';

const mockBack = jest.fn(); const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
let mockFocused = true;
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
    useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => true }),
    useFocusEffect: (callback: () => void) => { const focused = mockFocused; return React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: jest.fn() }));
jest.mock('../../../lib/supabase/services/organisationMemberships', () => ({ listOrganisationMembers: jest.fn() }));
jest.mock('../../../lib/supabase/services/invitations', () => ({ listOrganisationInvitations: jest.fn(), resendOrganisationInvitation: jest.fn(), revokeOrganisationInvitation: jest.fn(),
  sendOrganisationInvitation: jest.fn(), wasInvitationSaved: jest.requireActual('../../../lib/supabase/services/invitations').wasInvitationSaved }));

const list = listOrganisationInvitations as jest.Mock;
const search = listOrganisationMembers as jest.Mock;
const send = sendOrganisationInvitation as jest.Mock;
const resend = resendOrganisationInvitation as jest.Mock;
const revoke = revokeOrganisationInvitation as jest.Mock;
const auth = useAuth as jest.Mock;
const requiredUser = useRequiredUser as jest.Mock;
const confirm = jest.fn(); const toast = jest.fn();
const invitation = { id: 'invite-1', invited_email: 'person@example.com', target_profile_id: null, target_display_name: null, status: 'pending',
  created_at: '2026-07-12T00:00:00Z', last_sent_at: '2026-07-12T00:01:00Z', expires_at: '2026-07-19T00:00:00Z', accepted_at: null, revoked_at: null, send_count: 1, invited_by_display_name: 'Admin User' };
const unsent = { ...invitation, id: 'invite-unsent', invited_email: 'new@example.com', last_sent_at: null };
const savedNotSent = 'The invitation was saved, but its email couldn’t be delivered. Check the email address, then use Resend.';
beforeEach(() => {
  jest.clearAllMocks(); mockParams = {}; mockFocused = true;
  auth.mockReturnValue(adminAuth()); requiredUser.mockReturnValue(ADMIN);
  (useAppData as jest.Mock).mockReturnValue({ organisation: { id: ORGANISATION_ID, name: 'Grace Church' }, users: [memberProfile(DIRECTORY), memberProfile(REMOVED)], getAvatarUri: jest.fn() });
  (useConfirm as jest.Mock).mockReturnValue(confirm); (useToast as jest.Mock).mockReturnValue(toast);
  list.mockResolvedValue([invitation]); search.mockImplementation(async (query) => query === REMOVED.email ? [REMOVED] : [DIRECTORY]);
  send.mockResolvedValue({ invitationId: 'invite-2' }); resend.mockResolvedValue({ invitationId: 'invite-3' }); revoke.mockResolvedValue({ invitationId: 'invite-1', status: 'revoked' });
  confirm.mockResolvedValue(true);
});

async function createEmail(view: ReturnType<typeof render>, email = 'new@example.com') {
  fireEvent.press(view.getByText('Invite')); fireEvent.changeText(view.getByLabelText('Email'), email);
}

it('separates the short form from readable current and historical invitations', async () => {
  list.mockResolvedValue([invitation, { ...invitation, id: 'old-invite', invited_email: 'old@example.com', status: 'superseded' }]);
  const view = render(<InvitationAdminScreen />); await view.findByText('person@example.com');
  expect(view.queryByLabelText('Email')).toBeNull(); expect(view.queryByText(DIRECTORY.full_name)).toBeNull();
  fireEvent.press(view.getByRole('tab', { name: 'History' })); expect(view.getByText('old@example.com')).toBeTruthy(); expect(view.getByText(/Replaced · Expires/)).toBeTruthy();
  fireEvent.press(view.getByText('Invite')); expect(view.getByLabelText('Email')).toBeTruthy(); expect(view.queryByText('old@example.com')).toBeNull();
});

it('preserves the stored explicit UTC expiry', async () => {
  list.mockResolvedValue([invitation, { ...invitation, id: 'late', expires_at: '2026-07-18T23:59:59Z' }]);
  const view = render(<InvitationAdminScreen />);
  await view.findByText(/Expires 19 July 2026, 00:00 UTC/); expect(view.getByText(/Expires 18 July 2026, 23:59 UTC/)).toBeTruthy();
});

it('validates email with a visible summary, then sends only the short service payload', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email);
  await createEmail(view, 'bad-address'); fireEvent.press(view.getByText('Send invitation'));
  expect(view.getByText('Please check these details')).toBeTruthy(); expect(send).not.toHaveBeenCalled();
  fireEvent.changeText(view.getByLabelText('Email'), 'new@example.com'); fireEvent.press(view.getByText('Send invitation'));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ organisationId: ORGANISATION_ID, email: 'new@example.com' }));
  await view.findByText('Invitation email sent');
});

it('uses a searchable sheet for an existing person, then rechecks and sends their exact ID', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email);
  fireEvent.press(view.getByText('Invite')); fireEvent.press(view.getByRole('tab', { name: 'Already listed' }));
  fireEvent.press(view.getByRole('button', { name: 'Listed person: Choose a listed person' }));
  await view.findByText(DIRECTORY.full_name); fireEvent.changeText(view.getByLabelText('Search people'), DIRECTORY.email);
  await waitFor(() => expect(search).toHaveBeenCalledWith(DIRECTORY.email));
  fireEvent.press(view.getByText(DIRECTORY.full_name)); fireEvent.press(view.getByText('Send invitation'));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ organisationId: ORGANISATION_ID, targetProfileId: DIRECTORY.profile_id }));
  expect(search).toHaveBeenCalledWith(DIRECTORY.email);
});

it('opens a manually chosen pending person’s exact current invitation and retains the email draft', async () => {
  const person = { ...DIRECTORY, pending_invitation_status: 'pending' };
  const exact = { ...invitation, id: 'exact-pending', target_profile_id: DIRECTORY.profile_id, target_display_name: DIRECTORY.full_name, invited_email: DIRECTORY.email };
  list.mockResolvedValue([invitation, exact]); search.mockResolvedValue([person]);
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email);
  await createEmail(view, 'kept.draft@example.com'); fireEvent.press(view.getByRole('tab', { name: 'Already listed' }));
  fireEvent.press(view.getByRole('button', { name: 'Listed person: Choose a listed person' }));
  await view.findByText(person.full_name); fireEvent.press(view.getByText(person.full_name));
  await view.findByText('Invitations for this person');
  expect(view.queryByText('Send invitation')).toBeNull(); expect(view.queryByText(invitation.invited_email)).toBeNull();
  expect(view.getByText('Manage')).toBeTruthy(); expect(send).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('Invite'));
  expect(view.getByRole('button', { name: 'View current invitation' }).props.accessibilityState.disabled).toBe(false);
  expect(view.queryByText('Send invitation')).toBeNull();
  fireEvent.press(view.getByRole('tab', { name: 'By email' })); expect(view.getByDisplayValue('kept.draft@example.com')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Send invitation' }).props.accessibilityState.disabled).toBe(false);
});

it('recovers an exact pending record outside the initial results through the filtered existing RPC', async () => {
  const person = { ...REMOVED, pending_invitation_status: 'pending' };
  const exact = { ...invitation, id: 'exact-pending', target_profile_id: REMOVED.profile_id, target_display_name: REMOVED.full_name, invited_email: REMOVED.email };
  const namesake = { ...exact, id: 'wrong-invite', target_profile_id: DIRECTORY.profile_id, target_display_name: 'Same email, different person' };
  mockParams = { targetProfileId: REMOVED.profile_id, targetEmail: REMOVED.email, organisationId: ORGANISATION_ID, create: '1' };
  search.mockResolvedValue([person]); list.mockImplementation(async (options) => options?.targetProfileId === REMOVED.profile_id ? [exact] : [invitation, namesake]);
  const view = render(<InvitationAdminScreen />); await view.findByText('Manage');
  expect(list).toHaveBeenCalledWith({ targetProfileId: REMOVED.profile_id });
  expect(view.queryByText(namesake.target_display_name)).toBeNull(); expect(view.queryByText('Send invitation')).toBeNull();
  fireEvent.press(view.getByText('Manage')); fireEvent.press(view.getByText('Resend invitation'));
  await waitFor(() => expect(resend).toHaveBeenCalledWith(exact.id)); expect(send).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(`${person.full_name}\n${person.email}\nGrace Church`), returnFocusRef: expect.any(Object) }));
});

it('offers honest recovery when an exact pending record still cannot be read, without choosing a same-email substitute', async () => {
  const person = { ...REMOVED, pending_invitation_status: 'pending' };
  mockParams = { targetProfileId: REMOVED.profile_id, targetEmail: REMOVED.email, organisationId: ORGANISATION_ID, create: '0' };
  search.mockResolvedValue([person]); list.mockResolvedValue([{ ...invitation, invited_email: REMOVED.email, target_profile_id: DIRECTORY.profile_id }]);
  const view = render(<InvitationAdminScreen />); await view.findByText(/its details aren’t available/);
  expect(list).toHaveBeenCalledWith({ targetProfileId: REMOVED.profile_id });
  expect(view.queryByText('Manage')).toBeNull(); expect(view.queryByText('Send invitation')).toBeNull();
  expect(send).not.toHaveBeenCalled(); expect(resend).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
});

it('ignores filtered pending recovery after the screen loses focus', async () => {
  const person = { ...REMOVED, pending_invitation_status: 'pending' };
  const exact = { ...invitation, id: 'exact-pending', target_profile_id: REMOVED.profile_id, invited_email: REMOVED.email };
  const held = deferred<typeof exact[]>();
  mockParams = { targetProfileId: REMOVED.profile_id, targetEmail: REMOVED.email, organisationId: ORGANISATION_ID, create: '0' };
  search.mockResolvedValue([person]); list.mockImplementation((options) => options ? held.promise : Promise.resolve([invitation]));
  const view = render(<InvitationAdminScreen />); await waitFor(() => expect(list).toHaveBeenCalledWith({ targetProfileId: REMOVED.profile_id }));
  mockFocused = false; view.rerender(<InvitationAdminScreen />);
  await act(async () => held.resolve([exact])); expect(view.queryByText('Manage')).toBeNull(); expect(send).not.toHaveBeenCalled(); expect(resend).not.toHaveBeenCalled();
});

it('keeps All invitations after a same-account access refresh rather than reapplying the initial target view', async () => {
  const person = { ...REMOVED, pending_invitation_status: 'pending' };
  const exact = { ...invitation, id: 'exact-pending', target_profile_id: REMOVED.profile_id, invited_email: REMOVED.email };
  mockParams = { targetProfileId: REMOVED.profile_id, targetEmail: REMOVED.email, organisationId: ORGANISATION_ID, create: '0' };
  search.mockResolvedValue([person]); list.mockResolvedValue([invitation, exact]);
  const view = render(<InvitationAdminScreen />); await view.findByText('Invitations for this person');
  fireEvent.press(view.getByText('All invitations')); expect(view.getByText(invitation.invited_email)).toBeTruthy();
  auth.mockReturnValue(adminAuth(ADMIN, { accountStatus: 'loading' })); view.rerender(<InvitationAdminScreen />);
  auth.mockReturnValue(adminAuth()); view.rerender(<InvitationAdminScreen />);
  await view.findByText(invitation.invited_email); expect(view.queryByText('Invitations for this person')).toBeNull();
});

it('preselects a removed target beyond the initial 200 by fresh exact-ID search', async () => {
  mockParams = { targetProfileId: REMOVED.profile_id, targetEmail: REMOVED.email, organisationId: ORGANISATION_ID, create: '1' };
  search.mockImplementation(async (query) => query === REMOVED.email ? [REMOVED] : [DIRECTORY]);
  const view = render(<InvitationAdminScreen />); await view.findByText(REMOVED.full_name);
  expect(view.getByText(/previous teams, elevated roles and notification devices do not return/)).toBeTruthy();
  fireEvent.press(view.getByText('Send invitation')); await waitFor(() => expect(send).toHaveBeenCalledWith({ organisationId: ORGANISATION_ID, targetProfileId: REMOVED.profile_id }));
});

it('refuses same-email substitution and gives honest recovery for an unconfirmed exact target', async () => {
  mockParams = { targetProfileId: REMOVED.profile_id, targetEmail: REMOVED.email, create: '1' };
  search.mockResolvedValue([{ ...REMOVED, profile_id: DIRECTORY.profile_id }]);
  const view = render(<InvitationAdminScreen />); await view.findByText('Couldn’t confirm selected person');
  expect(view.getByText(/could not be confirmed in these bounded results/)).toBeTruthy();
  fireEvent.press(view.getByText('Send invitation')); expect(send).not.toHaveBeenCalled();
});

it('never acts on a target from another church or one with active linked access', async () => {
  mockParams = { targetProfileId: REMOVED.profile_id, organisationId: 'other-church', create: '1' };
  const wrong = render(<InvitationAdminScreen />); expect(wrong.getByText('Different church')).toBeTruthy(); expect(search).not.toHaveBeenCalled(); wrong.unmount();
  mockParams = { targetProfileId: MEMBER.profile_id, targetEmail: MEMBER.email, create: '1' }; search.mockResolvedValue([MEMBER]);
  const linked = render(<InvitationAdminScreen />); await linked.findByText('This person already has app access. They do not need another invitation.'); expect(send).not.toHaveBeenCalled();
});

it('retains an email draft across same-account readiness and blocks unresolved submission', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email); await createEmail(view);
  auth.mockReturnValue(adminAuth(ADMIN, { accountStatus: 'loading' })); view.rerender(<InvitationAdminScreen />);
  expect(view.getByDisplayValue('new@example.com')).toBeTruthy(); fireEvent.press(view.getByText('Send invitation')); expect(send).not.toHaveBeenCalled();
  auth.mockReturnValue(adminAuth()); view.rerender(<InvitationAdminScreen />);
  expect(view.getByDisplayValue('new@example.com')).toBeTruthy();
  await waitFor(() => expect(view.getByRole('button', { name: 'Send invitation' }).props.accessibilityState.disabled).toBe(false));
});

it('confirms resend rotation and revocation in plain language', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email);
  fireEvent.press(view.getByText('Manage')); fireEvent.press(view.getByText('Resend invitation')); await waitFor(() => expect(resend).toHaveBeenCalledWith(invitation.id));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Resend invitation?', message: expect.stringContaining('previous link, which stops working') }));
  await waitFor(() => expect(view.getByRole('button', { name: /Manage invitation$/ }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(view.getByText('Manage')); fireEvent.press(view.getByText('Cancel invitation')); await waitFor(() => expect(revoke).toHaveBeenCalledWith(invitation.id));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cancel invitation?', confirmLabel: 'Cancel invitation', destructive: true, message: expect.stringContaining('history will be kept') }));
});

it('never resends after a pending confirmation loses authority or focus', async () => {
  const approval = deferred<boolean>(); confirm.mockReturnValue(approval.promise);
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email); fireEvent.press(view.getByText('Manage')); fireEvent.press(view.getByText('Resend invitation'));
  const user = { ...ADMIN, orgRole: 'general_member' as const }; requiredUser.mockReturnValue(user); auth.mockReturnValue(adminAuth(user)); view.rerender(<InvitationAdminScreen />);
  await act(async () => approval.resolve(true)); expect(resend).not.toHaveBeenCalled();
});

it('ignores a send completion after blur instead of navigating or reporting success', async () => {
  const result = deferred<{ invitationId: string }>(); send.mockReturnValue(result.promise);
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email); await createEmail(view); fireEvent.press(view.getByText('Send invitation'));
  mockFocused = false; view.rerender(<InvitationAdminScreen />); await act(async () => result.resolve({ invitationId: 'later' }));
  expect(toast).not.toHaveBeenCalled(); expect(view.queryByText('Invitation email sent')).toBeNull();
});

it('shows saved-but-unsent adjacent to Resend and preserves its explanation when history refresh fails', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email); await createEmail(view);
  send.mockRejectedValue(Object.assign(new Error(savedNotSent), { invitationSaved: true })); list.mockResolvedValue([unsent]);
  fireEvent.press(view.getByText('Send invitation')); await view.findByText('Saved; email not sent');
  expect(view.getByText(/Email not sent yet. Open Manage to resend./)).toBeTruthy(); expect(view.getAllByText(savedNotSent).length).toBeGreaterThan(0);
  list.mockRejectedValue(new Error('Couldn’t load history.')); fireEvent.press(view.getByText('Refresh'));
  await view.findByText('Couldn’t refresh invitations'); expect(view.getByText('Saved; email not sent')).toBeTruthy();
});

it('does not claim a configuration failure issued or superseded an invitation and retains the draft', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email); await createEmail(view);
  send.mockRejectedValue(new Error('Invitation emails aren’t set up yet, so nothing was sent. Please try again later.'));
  fireEvent.press(view.getByText('Send invitation')); await view.findByText('Email is not configured');
  expect(view.getByDisplayValue('new@example.com')).toBeTruthy(); expect(view.queryByText('Invitation email sent')).toBeNull();
  expect(view.queryByText(/Email not sent yet. Open Manage to resend./)).toBeNull();
});

it('keeps an uncertain send draft and makes Check invitations the primary recovery', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email); await createEmail(view);
  send.mockRejectedValue(new Error('We couldn’t reach the server.')); fireEvent.press(view.getByText('Send invitation'));
  await view.findByText('Couldn’t confirm invitation outcome'); expect(view.getByText(/may already be saved/)).toBeTruthy();
  expect(view.getByDisplayValue('new@example.com')).toBeTruthy(); expect(view.getByText('Check invitations')).toBeTruthy();
  fireEvent.press(view.getByText('Check invitations')); await view.findByText(invitation.invited_email);
  fireEvent.press(view.getByText('Invite')); expect(view.getByDisplayValue('new@example.com')).toBeTruthy();
});

it('maintains saved-unsent recovery after resend replaces the old link', async () => {
  const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email);
  resend.mockRejectedValue(Object.assign(new Error(savedNotSent), { invitationSaved: true })); list.mockResolvedValue([{ ...unsent, invited_email: invitation.invited_email }]);
  fireEvent.press(view.getByText('Manage')); fireEvent.press(view.getByText('Resend invitation')); await view.findByText('Saved; email not sent');
  expect(view.getByText(/Email not sent yet. Open Manage to resend./)).toBeTruthy(); expect(view.getByText('Manage')).toBeTruthy();
});

it('blocks duplicate submissions while a send is pending', async () => {
  send.mockReturnValue(new Promise(() => {})); const view = render(<InvitationAdminScreen />); await view.findByText(invitation.invited_email); await createEmail(view);
  fireEvent.press(view.getByText('Send invitation')); fireEvent.press(view.getByText('Send invitation')); expect(send).toHaveBeenCalledTimes(1);
});

it.each(['general_member', 'demo'])('makes no invitation calls for %s', (mode) => {
  const user = { ...ADMIN, orgRole: mode === 'general_member' ? 'general_member' as const : ADMIN.orgRole }; requiredUser.mockReturnValue(user); auth.mockReturnValue(adminAuth(user, mode === 'demo' ? { authMode: 'demo' } : {}));
  const view = render(<InvitationAdminScreen />); expect(view.getByText('No permission')).toBeTruthy(); expect(list).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it('keeps invitation details when Cancel confirmation is dismissed, and never sends on discard', async () => {
  confirm.mockResolvedValue(false);
  const view = render(<InvitationAdminScreen />); await view.findByText('person@example.com');
  await createEmail(view, 'draft@example.com');
  await act(async () => fireEvent.press(view.getByLabelText('Cancel')));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your invitation details will not be sent.' }));
  expect(view.getByDisplayValue('draft@example.com')).toBeTruthy(); expect(send).not.toHaveBeenCalled();
  confirm.mockResolvedValue(true);
  await act(async () => fireEvent.press(view.getByLabelText('Cancel')));
  expect(view.queryByLabelText('Email')).toBeNull(); expect(send).not.toHaveBeenCalled();
});
