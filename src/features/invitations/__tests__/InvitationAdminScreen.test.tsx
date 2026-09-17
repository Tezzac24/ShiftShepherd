import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import InvitationAdminScreen from '../InvitationAdminScreen';
import {
  listOrganisationInvitations,
  resendOrganisationInvitation,
  revokeOrganisationInvitation,
  sendOrganisationInvitation,
} from '../../../lib/supabase/services/invitations';

const mockConfirm = jest.fn();
const mockToast = jest.fn();
let mockOrgRole: 'church_admin' | 'general_member' = 'church_admin';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: () => ({ authMode: 'supabase' }),
  useRequiredUser: () => ({
    profile: { id: 'admin-profile' },
    orgRole: mockOrgRole,
    memberships: [],
    supabaseProfileId: 'admin-profile',
  }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({
  useAppData: () => ({
    organisation: { id: 'org-1', name: 'Grace Church' },
    users: [
      {
        id: 'unlinked-profile',
        auth_user_id: '',
        organisation_id: 'org-1',
        full_name: 'Alex Morgan',
        email: 'alex@example.com',
        phone: null,
        avatar_url: null,
        access_status: 'active',
        access_removed_at: null,
        access_removed_by: null,
        access_removal_reason: null,
        created_at: '2026-07-01T00:00:00Z',
      },
      {
        id: 'removed-profile',
        auth_user_id: 'removed-auth-user',
        organisation_id: 'org-1',
        full_name: 'Former Member',
        email: 'former@example.com',
        phone: null,
        avatar_url: null,
        access_status: 'removed',
        access_removed_at: '2026-07-11T00:00:00Z',
        access_removed_by: 'admin-profile',
        access_removal_reason: 'admin_removed',
        created_at: '2026-07-01T00:00:00Z',
      },
    ],
    getAvatarUri: () => null,
  }),
}));
jest.mock('../../../components/ConfirmDialog', () => ({
  useConfirm: () => mockConfirm,
}));
jest.mock('../../../components/Toast', () => ({
  useToast: () => mockToast,
}));
jest.mock('../../../components/TextField', () => {
  const ReactRuntime = jest.requireActual<typeof import('react')>('react');
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TextField: ({ label, ...props }: { label?: string }) =>
      ReactRuntime.createElement(TextInput, { ...props, accessibilityLabel: label }),
  };
});
jest.mock('../../../lib/supabase/services/invitations', () => ({
  listOrganisationInvitations: jest.fn(),
  resendOrganisationInvitation: jest.fn(),
  revokeOrganisationInvitation: jest.fn(),
  sendOrganisationInvitation: jest.fn(),
}));

const mockList = listOrganisationInvitations as jest.MockedFunction<
  typeof listOrganisationInvitations
>;
const mockSend = sendOrganisationInvitation as jest.MockedFunction<
  typeof sendOrganisationInvitation
>;
const mockResend = resendOrganisationInvitation as jest.MockedFunction<
  typeof resendOrganisationInvitation
>;
const mockRevoke = revokeOrganisationInvitation as jest.MockedFunction<
  typeof revokeOrganisationInvitation
>;

const pendingInvitation = {
  id: 'invite-1',
  invited_email: 'person@example.com',
  target_profile_id: null,
  target_display_name: null,
  status: 'pending' as const,
  created_at: '2026-07-12T00:00:00Z',
  last_sent_at: '2026-07-12T00:01:00Z',
  expires_at: '2026-07-19T00:00:00Z',
  accepted_at: null,
  revoked_at: null,
  send_count: 1,
  invited_by_display_name: 'Admin User',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgRole = 'church_admin';
  mockList.mockResolvedValue([pendingInvitation]);
  mockSend.mockResolvedValue({ invitationId: 'invite-2' });
  mockResend.mockResolvedValue({ invitationId: 'invite-3' });
  mockRevoke.mockResolvedValue({ invitationId: 'invite-1', status: 'revoked' });
  mockConfirm.mockResolvedValue(true);
});

it('shows the expiry as the explicit UTC instant the invitation email also uses', async () => {
  mockList.mockResolvedValue([
    { ...pendingInvitation, expires_at: '2026-07-19T00:00:00Z' },
    { ...pendingInvitation, id: 'invite-late', expires_at: '2026-07-18T23:59:59Z' },
  ]);
  render(<InvitationAdminScreen />);

  expect(await screen.findByText(/Expires 19 July 2026, 00:00 UTC/)).toBeTruthy();
  expect(screen.getByText(/Expires 18 July 2026, 23:59 UTC/)).toBeTruthy();
  expect(screen.queryByText(/Expires 18 Jul 2026(?!,)/)).toBeNull();
  expect(screen.queryByText(/Invalid Date/)).toBeNull();
});

it('does not load or expose invitation controls to an ordinary member', async () => {
  mockOrgRole = 'general_member';
  render(<InvitationAdminScreen />);

  expect(await screen.findByText('No permission')).toBeTruthy();
  expect(mockList).not.toHaveBeenCalled();
  expect(screen.queryByText('Send invitation')).toBeNull();
});

it('supports Add & invite and an existing unlinked directory person', async () => {
  render(<InvitationAdminScreen />);
  await screen.findByText('person@example.com');

  fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.com');
  fireEvent.press(screen.getByText('Send invitation'));
  await waitFor(() =>
    expect(mockSend).toHaveBeenCalledWith({
      organisationId: 'org-1',
      email: 'new@example.com',
    }),
  );
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));

  fireEvent.press(screen.getAllByText('Invite')[0]!);
  await waitFor(() =>
    expect(mockSend).toHaveBeenCalledWith({
      organisationId: 'org-1',
      targetProfileId: 'unlinked-profile',
    }),
  );
});

it('offers a removed profile for baseline-only re-invitation', async () => {
  render(<InvitationAdminScreen />);
  await screen.findByText('Former Member');
  expect(screen.getByText(/restores baseline access only/i)).toBeTruthy();
  fireEvent.press(screen.getAllByText('Invite')[1]!);
  await waitFor(() =>
    expect(mockSend).toHaveBeenCalledWith({
      organisationId: 'org-1',
      targetProfileId: 'removed-profile',
    }),
  );
});

it('confirms and performs bounded resend and revoke actions', async () => {
  render(<InvitationAdminScreen />);
  await screen.findByText('person@example.com');

  fireEvent.press(screen.getByText('Resend'));
  await waitFor(() => expect(mockResend).toHaveBeenCalledWith('invite-1'));

  fireEvent.press(screen.getByText('Revoke'));
  await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('invite-1'));
  expect(mockConfirm).toHaveBeenCalledTimes(2);
});
