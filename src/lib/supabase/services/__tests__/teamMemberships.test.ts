import { getSupabase } from '../../client';
import { TeamRole } from '../../../../types';
import {
  addTeamMember,
  leaveTeam,
  removeTeamMember,
  setTeamMemberRole,
  TEAM_MEMBERSHIP_ALREADY_MEMBER_ERROR,
  TEAM_MEMBERSHIP_ARCHIVED_ERROR,
  TEAM_MEMBERSHIP_CONFLICT_ERROR,
  TEAM_MEMBERSHIP_DEMO_ERROR,
  TEAM_MEMBERSHIP_FINAL_ADMIN_ERROR,
  TEAM_MEMBERSHIP_INVALID_ROLE_ERROR,
  TEAM_MEMBERSHIP_LEADER_ERROR,
  TEAM_MEMBERSHIP_LEAVE_FINAL_ADMIN_ERROR,
  TEAM_MEMBERSHIP_NOT_FOUND_ERROR,
  TEAM_MEMBERSHIP_OFFLINE_ERROR,
  TEAM_MEMBERSHIP_PERMISSION_ERROR,
  TEAM_MEMBERSHIP_PROFILE_NOT_ELIGIBLE_ERROR,
  TEAM_MEMBERSHIP_ROLE_ARCHIVED_ERROR,
  TEAM_MEMBERSHIP_ROLE_PERMISSION_ERROR,
  TEAM_MEMBERSHIP_SELF_REMOVAL_ERROR,
  TEAM_MEMBERSHIP_TEAM_NOT_FOUND_ERROR,
} from '../teamMemberships';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const TEAM_ID = '30000000-0000-4000-a000-000000000001';
const PROFILE_ID = '20000000-0000-4000-a000-000000000005';
const MEMBERSHIP_ROW = {
  membership_id: '40000000-0000-4000-a000-000000000099',
  team_id: TEAM_ID,
  profile_id: PROFILE_ID,
  role: 'member',
  created_at: '2026-07-11T06:34:12.000Z',
};

function mockClient(result: { data?: unknown; error?: unknown } = {}) {
  const rpc = jest.fn().mockResolvedValue({
    data: result.data ?? [MEMBERSHIP_ROW],
    error: result.error ?? null,
  });
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

afterEach(() => {
  warnSpy.mockRestore();
});

describe('addTeamMember', () => {
  it('calls the narrow add RPC once with only team and target profile ids', async () => {
    const { rpc } = mockClient();
    await expect(addTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).resolves.toEqual({
      id: MEMBERSHIP_ROW.membership_id,
      team_id: TEAM_ID,
      user_id: PROFILE_ID,
      role: 'member',
      created_at: MEMBERSHIP_ROW.created_at,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('add_team_member', {
      p_team_id: TEAM_ID,
      p_profile_id: PROFILE_ID,
    });
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(['p_profile_id', 'p_team_id']);
  });

  it('refuses demo/mock ids before obtaining a Supabase client', async () => {
    const { rpc } = mockClient();
    await expect(
      addTeamMember({ teamId: 'team-choir', profileId: 'user-ruth' }),
    ).rejects.toThrow(TEAM_MEMBERSHIP_DEMO_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['ALREADY_MEMBER', TEAM_MEMBERSHIP_ALREADY_MEMBER_ERROR],
    ['NOT_AUTHORISED', TEAM_MEMBERSHIP_PERMISSION_ERROR],
    ['TEAM_NOT_FOUND', TEAM_MEMBERSHIP_TEAM_NOT_FOUND_ERROR],
    ['TEAM_ARCHIVED', TEAM_MEMBERSHIP_ARCHIVED_ERROR],
    ['PROFILE_NOT_ELIGIBLE', TEAM_MEMBERSHIP_PROFILE_NOT_ELIGIBLE_ERROR],
  ])('maps %s to calm safe copy', async (serverMessage, friendlyMessage) => {
    mockClient({ error: { code: 'P0001', message: serverMessage } });
    await expect(addTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).rejects.toThrow(
      friendlyMessage,
    );
  });

  it('maps network and unexpected failures without leaking raw server details', async () => {
    mockClient({ error: { message: 'TypeError: Network request failed' } });
    await expect(addTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).rejects.toThrow(
      TEAM_MEMBERSHIP_OFFLINE_ERROR,
    );

    mockClient({ error: { message: 'sensitive internal database detail' } });
    await expect(addTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).rejects.toThrow(
      "We couldn't add this person right now. Please try again.",
    );
  });
});

describe('removeTeamMember', () => {
  it('calls the narrow remove RPC once and never touches profiles or Auth users', async () => {
    const { rpc, from, auth } = mockClient();
    await expect(removeTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).resolves.toEqual(
      expect.objectContaining({ id: MEMBERSHIP_ROW.membership_id, user_id: PROFILE_ID }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('remove_team_member', {
      p_team_id: TEAM_ID,
      p_profile_id: PROFILE_ID,
    });
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(['p_profile_id', 'p_team_id']);
    expect(from).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses demo/mock ids without calling Supabase', async () => {
    const { rpc } = mockClient();
    await expect(
      removeTeamMember({ teamId: 'team-choir', profileId: 'user-hannah' }),
    ).rejects.toThrow(TEAM_MEMBERSHIP_DEMO_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['MEMBERSHIP_NOT_FOUND', TEAM_MEMBERSHIP_NOT_FOUND_ERROR],
    ['PEER_TEAM_ADMIN_REMOVAL_BLOCKED', TEAM_MEMBERSHIP_LEADER_ERROR],
    ['FINAL_TEAM_ADMIN_REMOVAL_BLOCKED', TEAM_MEMBERSHIP_FINAL_ADMIN_ERROR],
    ['SELF_REMOVAL_USE_LEAVE_TEAM', TEAM_MEMBERSHIP_SELF_REMOVAL_ERROR],
    ['NOT_AUTHORISED', TEAM_MEMBERSHIP_PERMISSION_ERROR],
  ])('maps %s to calm safe copy', async (serverMessage, friendlyMessage) => {
    mockClient({ error: { code: 'P0001', message: serverMessage } });
    await expect(removeTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).rejects.toThrow(
      friendlyMessage,
    );
  });

  it('keeps network and unexpected errors friendly', async () => {
    mockClient({ error: { message: 'fetch timed out' } });
    await expect(removeTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).rejects.toThrow(
      TEAM_MEMBERSHIP_OFFLINE_ERROR,
    );

    mockClient({ error: { message: 'delete from profiles failed with secret detail' } });
    await expect(removeTeamMember({ teamId: TEAM_ID, profileId: PROFILE_ID })).rejects.toThrow(
      "We couldn't remove this person right now. Please try again.",
    );
  });
});

describe('leaveTeam', () => {
  it('calls leave_team exactly once with only the team id', async () => {
    const { rpc, from, auth } = mockClient();
    await expect(leaveTeam({ teamId: TEAM_ID })).resolves.toEqual(
      expect.objectContaining({ team_id: TEAM_ID, user_id: PROFILE_ID }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('leave_team', { p_team_id: TEAM_ID });
    expect(Object.keys(rpc.mock.calls[0][1])).toEqual(['p_team_id']);
    expect(from).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses demo ids before obtaining a Supabase client', async () => {
    const { rpc } = mockClient();
    await expect(leaveTeam({ teamId: 'team-choir' })).rejects.toThrow(
      TEAM_MEMBERSHIP_DEMO_ERROR,
    );
    expect(mockGetSupabase).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['FINAL_TEAM_ADMIN_LEAVE_BLOCKED', TEAM_MEMBERSHIP_LEAVE_FINAL_ADMIN_ERROR],
    ['MEMBERSHIP_NOT_FOUND', TEAM_MEMBERSHIP_NOT_FOUND_ERROR],
    ['NOT_AUTHORISED', TEAM_MEMBERSHIP_PERMISSION_ERROR],
  ])('maps %s to stable friendly copy', async (serverMessage, friendlyMessage) => {
    mockClient({ error: { code: 'P0001', message: serverMessage } });
    await expect(leaveTeam({ teamId: TEAM_ID })).rejects.toThrow(friendlyMessage);
  });

  it('keeps network and generic failures friendly', async () => {
    mockClient({ error: { message: 'Network request timed out' } });
    await expect(leaveTeam({ teamId: TEAM_ID })).rejects.toThrow(
      TEAM_MEMBERSHIP_OFFLINE_ERROR,
    );

    mockClient({ error: { message: 'sensitive internal role detail' } });
    await expect(leaveTeam({ teamId: TEAM_ID })).rejects.toThrow(
      "We couldn't leave this team right now. Please try again.",
    );
  });
});

describe('setTeamMemberRole', () => {
  const LEADER_ROW = { ...MEMBERSHIP_ROW, role: 'team_leader' };

  it('promotes with exactly team, profile, and role arguments and returns the canonical row', async () => {
    const { rpc, from, auth } = mockClient({ data: [LEADER_ROW] });
    await expect(
      setTeamMemberRole({ teamId: TEAM_ID, profileId: PROFILE_ID, role: 'team_leader' }),
    ).resolves.toEqual({
      id: MEMBERSHIP_ROW.membership_id,
      team_id: TEAM_ID,
      user_id: PROFILE_ID,
      role: 'team_leader',
      created_at: MEMBERSHIP_ROW.created_at,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('set_team_member_role', {
      p_team_id: TEAM_ID,
      p_profile_id: PROFILE_ID,
      p_role: 'team_leader',
    });
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual([
      'p_profile_id',
      'p_role',
      'p_team_id',
    ]);
    expect(from).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('demotes to member and preserves the same membership id and created_at', async () => {
    mockClient({ data: [MEMBERSHIP_ROW] });
    await expect(
      setTeamMemberRole({ teamId: TEAM_ID, profileId: PROFILE_ID, role: 'member' }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: MEMBERSHIP_ROW.membership_id,
        role: 'member',
        created_at: MEMBERSHIP_ROW.created_at,
      }),
    );
  });

  it('refuses demo/mock ids before obtaining a Supabase client', async () => {
    const { rpc } = mockClient();
    await expect(
      setTeamMemberRole({ teamId: 'team-choir', profileId: 'user-ruth', role: 'team_leader' }),
    ).rejects.toThrow(TEAM_MEMBERSHIP_DEMO_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses an unknown role before obtaining a Supabase client', async () => {
    const { rpc } = mockClient();
    await expect(
      setTeamMemberRole({
        teamId: TEAM_ID,
        profileId: PROFILE_ID,
        role: 'church_admin' as TeamRole,
      }),
    ).rejects.toThrow(TEAM_MEMBERSHIP_INVALID_ROLE_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_AUTHORISED', TEAM_MEMBERSHIP_ROLE_PERMISSION_ERROR],
    ['ORGANISATION_ACCESS_REMOVED', TEAM_MEMBERSHIP_ROLE_PERMISSION_ERROR],
    ['TEAM_NOT_FOUND', TEAM_MEMBERSHIP_TEAM_NOT_FOUND_ERROR],
    ['TEAM_ARCHIVED', TEAM_MEMBERSHIP_ROLE_ARCHIVED_ERROR],
    ['MEMBERSHIP_NOT_FOUND', TEAM_MEMBERSHIP_NOT_FOUND_ERROR],
    ['INVALID_ROLE', TEAM_MEMBERSHIP_INVALID_ROLE_ERROR],
    ['CONFLICT_RETRY', TEAM_MEMBERSHIP_CONFLICT_ERROR],
  ])('maps %s to stable safe copy', async (serverMessage, friendlyMessage) => {
    mockClient({ error: { code: 'P0001', message: serverMessage } });
    await expect(
      setTeamMemberRole({ teamId: TEAM_ID, profileId: PROFILE_ID, role: 'team_leader' }),
    ).rejects.toThrow(friendlyMessage);
  });

  it.each([
    ['empty result', []],
    ['multiple rows', [LEADER_ROW, LEADER_ROW]],
    ['wrong team id', [{ ...LEADER_ROW, team_id: '30000000-0000-4000-a000-000000000009' }]],
    ['wrong profile id', [{ ...LEADER_ROW, profile_id: '20000000-0000-4000-a000-000000000009' }]],
    ['unchanged role mismatch', [MEMBERSHIP_ROW]],
    ['missing membership id', [{ ...LEADER_ROW, membership_id: '' }]],
    ['unknown role value', [{ ...LEADER_ROW, role: 'owner' }]],
  ])('rejects a malformed success response: %s', async (_label, data) => {
    mockClient({ data });
    await expect(
      setTeamMemberRole({ teamId: TEAM_ID, profileId: PROFILE_ID, role: 'team_leader' }),
    ).rejects.toThrow("We couldn't change this team role right now. Please try again.");
  });

  it('keeps network and unexpected failures friendly without leaking details', async () => {
    mockClient({ error: { message: 'TypeError: Network request failed' } });
    await expect(
      setTeamMemberRole({ teamId: TEAM_ID, profileId: PROFILE_ID, role: 'member' }),
    ).rejects.toThrow(TEAM_MEMBERSHIP_OFFLINE_ERROR);

    mockClient({ error: { message: 'sensitive internal enum detail' } });
    await expect(
      setTeamMemberRole({ teamId: TEAM_ID, profileId: PROFILE_ID, role: 'member' }),
    ).rejects.toThrow("We couldn't change this team role right now. Please try again.");
  });
});
