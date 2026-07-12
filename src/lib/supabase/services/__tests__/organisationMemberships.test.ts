import { getSupabase } from '../../client';
import {
  leaveOrganisation,
  listOrganisationMembers,
  ORGANISATION_MEMBERSHIP_ALREADY_REMOVED_ERROR,
  ORGANISATION_MEMBERSHIP_CONFLICT_ERROR,
  ORGANISATION_MEMBERSHIP_INVALID_ROLE_ERROR,
  ORGANISATION_MEMBERSHIP_LAST_ADMIN_ERROR,
  ORGANISATION_MEMBERSHIP_MEMBER_NOT_FOUND_ERROR,
  ORGANISATION_MEMBERSHIP_MEMBER_NOT_LINKED_ERROR,
  ORGANISATION_MEMBERSHIP_OFFLINE_ERROR,
  ORGANISATION_MEMBERSHIP_PERMISSION_ERROR,
  ORGANISATION_MEMBERSHIP_SELF_REMOVAL_ERROR,
  removeOrganisationMember,
  setOrganisationMemberRole,
} from '../organisationMemberships';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const PROFILE_ID = '20000000-0000-4000-a000-000000000002';
const MEMBER_ROW = {
  profile_id: PROFILE_ID,
  full_name: 'Ruth Johnson',
  email: 'ruth@example.church',
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removal_reason: null,
  linked: true,
  role: 'general_member',
  team_count: 0,
  pending_invitation_status: null,
  is_current_user: false,
  is_last_church_admin: false,
};
const ACCESS_ROW = {
  profile_id: PROFILE_ID,
  access_status: 'removed',
  active_profile_id: null,
  remaining_profile_count: 0,
  transition: 'no_organisations',
};

function client(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const from = jest.fn();
  const auth = { admin: { deleteUser: jest.fn() } };
  mockGetSupabase.mockReturnValue({ rpc, from, auth });
  return { rpc, from, auth };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warnSpy.mockRestore());

describe('listOrganisationMembers', () => {
  it('uses one bounded admin RPC and maps the member read model', async () => {
    const { rpc } = client({ data: [{ ...MEMBER_ROW, team_count: '2' }] });
    await expect(listOrganisationMembers('  ruth  ')).resolves.toEqual([
      { ...MEMBER_ROW, team_count: 2 },
    ]);
    expect(rpc).toHaveBeenCalledWith('list_organisation_members', {
      p_search: 'ruth',
      p_limit: 200,
    });
  });

  it('maps permission, network, and unexpected failures to bounded copy', async () => {
    client({ error: { message: 'NOT_AUTHORISED' } });
    await expect(listOrganisationMembers()).rejects.toThrow(
      ORGANISATION_MEMBERSHIP_PERMISSION_ERROR,
    );
    client({ error: { message: 'Network request failed' } });
    await expect(listOrganisationMembers()).rejects.toThrow(
      ORGANISATION_MEMBERSHIP_OFFLINE_ERROR,
    );
    client({ error: { message: 'secret postgres detail' } });
    await expect(listOrganisationMembers()).rejects.toThrow(
      'We couldnâ€™t load organisation members right now. Please try again.',
    );
  });
});

describe('setOrganisationMemberRole', () => {
  it('sends only the target profile and catalog role', async () => {
    const { rpc } = client({ data: [{ profile_id: PROFILE_ID, role: 'event_manager' }] });
    await expect(setOrganisationMemberRole(PROFILE_ID, 'event_manager')).resolves.toEqual({
      profile_id: PROFILE_ID,
      role: 'event_manager',
    });
    expect(rpc).toHaveBeenCalledWith('set_organisation_member_role', {
      p_profile_id: PROFILE_ID,
      p_role: 'event_manager',
    });
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(['p_profile_id', 'p_role']);
  });

  it('rejects invalid runtime roles before obtaining a client', async () => {
    client({ data: [] });
    await expect(
      setOrganisationMemberRole(PROFILE_ID, 'owner' as never),
    ).rejects.toThrow(ORGANISATION_MEMBERSHIP_INVALID_ROLE_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });

  it.each([
    ['LAST_CHURCH_ADMIN', ORGANISATION_MEMBERSHIP_LAST_ADMIN_ERROR],
    ['MEMBER_NOT_FOUND', ORGANISATION_MEMBERSHIP_MEMBER_NOT_FOUND_ERROR],
    ['MEMBER_NOT_LINKED', ORGANISATION_MEMBERSHIP_MEMBER_NOT_LINKED_ERROR],
    ['ALREADY_REMOVED', ORGANISATION_MEMBERSHIP_ALREADY_REMOVED_ERROR],
    ['INVALID_ROLE', ORGANISATION_MEMBERSHIP_INVALID_ROLE_ERROR],
  ])('maps %s without leaking server detail', async (server, expected) => {
    client({ error: { code: 'P0001', message: server } });
    await expect(setOrganisationMemberRole(PROFILE_ID, 'general_member')).rejects.toThrow(expected);
  });
});

describe('removeOrganisationMember', () => {
  it('calls one RPC and never deletes profiles, user_accounts, or Auth users from the client', async () => {
    const { rpc, from, auth } = client({ data: [ACCESS_ROW] });
    await expect(removeOrganisationMember(PROFILE_ID)).resolves.toEqual(ACCESS_ROW);
    expect(rpc).toHaveBeenCalledWith('remove_organisation_member', { p_profile_id: PROFILE_ID });
    expect(from).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ['LAST_CHURCH_ADMIN', ORGANISATION_MEMBERSHIP_LAST_ADMIN_ERROR],
    ['CANNOT_REMOVE_SELF_HERE', ORGANISATION_MEMBERSHIP_SELF_REMOVAL_ERROR],
    ['MEMBER_NOT_FOUND', ORGANISATION_MEMBERSHIP_MEMBER_NOT_FOUND_ERROR],
    ['ALREADY_REMOVED', ORGANISATION_MEMBERSHIP_ALREADY_REMOVED_ERROR],
  ])('maps %s to stable user copy', async (server, expected) => {
    client({ error: { code: 'P0001', message: server } });
    await expect(removeOrganisationMember(PROFILE_ID)).rejects.toThrow(expected);
  });

  it('maps concurrent conflicts to a retryable message', async () => {
    client({ error: { code: '40001', message: 'serialization failure' } });
    await expect(removeOrganisationMember(PROFILE_ID)).rejects.toThrow(
      ORGANISATION_MEMBERSHIP_CONFLICT_ERROR,
    );
  });
});

describe('leaveOrganisation', () => {
  it('derives caller identity server-side with a zero-argument RPC', async () => {
    const { rpc, from, auth } = client({ data: [ACCESS_ROW] });
    await expect(leaveOrganisation()).resolves.toEqual(ACCESS_ROW);
    expect(rpc).toHaveBeenCalledWith('leave_organisation');
    expect(from).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('protects the final church admin and keeps generic failures calm', async () => {
    client({ error: { message: 'LAST_CHURCH_ADMIN' } });
    await expect(leaveOrganisation()).rejects.toThrow(
      ORGANISATION_MEMBERSHIP_LAST_ADMIN_ERROR,
    );
    client({ error: { message: 'internal table name and sql detail' } });
    await expect(leaveOrganisation()).rejects.toThrow(
      'We couldnâ€™t leave this organisation right now. Please try again.',
    );
  });
});

