import { getSupabase } from '../../client';
import {
  archiveTeam,
  createTeam,
  restoreTeam,
  TEAM_LIFECYCLE_ALREADY_ARCHIVED_ERROR,
  TEAM_LIFECYCLE_ARCHIVED_ERROR,
  TEAM_LIFECYCLE_CONFLICT_ERROR,
  TEAM_LIFECYCLE_DEMO_ERROR,
  TEAM_LIFECYCLE_INVALID_DESCRIPTION_ERROR,
  TEAM_LIFECYCLE_INVALID_INITIAL_ADMIN_ERROR,
  TEAM_LIFECYCLE_INVALID_NAME_ERROR,
  TEAM_LIFECYCLE_NOT_ARCHIVED_ERROR,
  TEAM_LIFECYCLE_NOT_FOUND_ERROR,
  TEAM_LIFECYCLE_OFFLINE_ERROR,
  TEAM_LIFECYCLE_PERMISSION_ERROR,
  updateTeam,
} from '../teams';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const TEAM_ID = '30000000-0000-4000-a000-000000000001';
const ORG_ID = '10000000-0000-4000-a000-000000000001';
const ADMIN_ID = '20000000-0000-4000-a000-000000000001';
const OTHER_ID = '20000000-0000-4000-a000-000000000002';
const MEMBERSHIP_ID = '40000000-0000-4000-a000-000000000001';
const CREATED_AT = '2026-07-15T00:45:13.000Z';
const REQUEST_ID = '50000000-0000-4000-a000-000000000001';

function row(overrides: Record<string, unknown> = {}) {
  return {
    team_id: TEAM_ID,
    organisation_id: ORG_ID,
    team_name: 'Welcome Team',
    team_description: 'Welcomes people each Sunday.',
    team_type: 'generic',
    avatar_url: null,
    archived_at: null,
    archived_by: null,
    created_at: CREATED_AT,
    initial_admin_membership_id: null,
    initial_admin_profile_id: null,
    initial_admin_role: null,
    initial_admin_created_at: null,
    ...overrides,
  };
}

function mockClient(result: { data?: unknown; error?: unknown } = {}) {
  const rpc = jest.fn().mockResolvedValue({
    data: result.data ?? [row()],
    error: result.error ?? null,
  });
  mockGetSupabase.mockReturnValue({ rpc });
  return { rpc };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warnSpy.mockRestore());

describe('createTeam', () => {
  it('creates without an initial admin, sends no authority ids, and returns no membership', async () => {
    const { rpc } = mockClient();
    await expect(
      createTeam({ requestId: REQUEST_ID,
        name: '  Welcome Team  ',
        description: '  Welcomes people each Sunday.  ',
        initialAdminProfileId: null,
      }),
    ).resolves.toEqual({
      team: {
        id: TEAM_ID,
        organisation_id: ORG_ID,
        name: 'Welcome Team',
        description: 'Welcomes people each Sunday.',
        type: 'generic',
        avatar_url: null,
        archived_at: null,
        archived_by: null,
        created_at: CREATED_AT,
      },
      initialAdminMembership: null,
    });
    expect(rpc).toHaveBeenCalledWith('create_team', {
      p_name: 'Welcome Team',
      p_description: 'Welcomes people each Sunday.',
      p_initial_admin_profile_id: null,
      p_request_id: REQUEST_ID,
    });
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual([
      'p_description',
      'p_initial_admin_profile_id',
      'p_name',
      'p_request_id',
    ]);
  });

  it('returns exactly the selected initial team-admin membership', async () => {
    const { rpc } = mockClient({
      data: [
        row({
          initial_admin_membership_id: MEMBERSHIP_ID,
          initial_admin_profile_id: OTHER_ID,
          initial_admin_role: 'team_leader',
          initial_admin_created_at: CREATED_AT,
        }),
      ],
    });
    const result = await createTeam({ requestId: REQUEST_ID,
      name: 'Welcome Team',
      description: null,
      initialAdminProfileId: OTHER_ID,
    });
    expect(result.initialAdminMembership).toEqual({
      id: MEMBERSHIP_ID,
      team_id: TEAM_ID,
      user_id: OTHER_ID,
      role: 'team_leader',
      created_at: CREATED_AT,
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_team',
      expect.objectContaining({ p_initial_admin_profile_id: OTHER_ID }),
    );
  });

  it('allows the creator profile when it is explicitly selected', async () => {
    mockClient({
      data: [
        row({
          initial_admin_membership_id: MEMBERSHIP_ID,
          initial_admin_profile_id: ADMIN_ID,
          initial_admin_role: 'team_leader',
          initial_admin_created_at: CREATED_AT,
        }),
      ],
    });
    await expect(
      createTeam({ requestId: REQUEST_ID, name: 'Welcome Team', description: null, initialAdminProfileId: ADMIN_ID }),
    ).resolves.toEqual(
      expect.objectContaining({
        initialAdminMembership: expect.objectContaining({ user_id: ADMIN_ID }),
      }),
    );
  });

  it('does not infer or auto-return a creator membership when none was selected', async () => {
    mockClient();
    const result = await createTeam({ requestId: REQUEST_ID,
      name: 'Welcome Team',
      description: null,
      initialAdminProfileId: null,
    });
    expect(result.initialAdminMembership).toBeNull();
  });

  it('rejects an invalid initial-admin id before obtaining a client', async () => {
    mockClient();
    await expect(
      createTeam({ requestId: REQUEST_ID,
        name: 'Welcome Team',
        description: null,
        initialAdminProfileId: 'user-demo',
      }),
    ).rejects.toThrow(TEAM_LIFECYCLE_INVALID_INITIAL_ADMIN_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });

  it('validates and trims draft fields before the RPC', async () => {
    mockClient();
    await expect(
      createTeam({ requestId: REQUEST_ID, name: '   ', description: null, initialAdminProfileId: null }),
    ).rejects.toThrow(TEAM_LIFECYCLE_INVALID_NAME_ERROR);
    await expect(
      createTeam({ requestId: REQUEST_ID,
        name: 'Valid',
        description: 'x'.repeat(501),
        initialAdminProfileId: null,
      }),
    ).rejects.toThrow(TEAM_LIFECYCLE_INVALID_DESCRIPTION_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });
});

describe('team update/archive/restore', () => {
  it('updates only the target id, trimmed name, and normalized description', async () => {
    const { rpc } = mockClient({ data: [row({ team_name: 'Care Team', team_description: '' })] });
    await expect(
      updateTeam({ teamId: TEAM_ID, name: '  Care Team ', description: '   ' }),
    ).resolves.toEqual(expect.objectContaining({ id: TEAM_ID, name: 'Care Team', description: '' }));
    expect(rpc).toHaveBeenCalledWith('update_team', {
      p_team_id: TEAM_ID,
      p_name: 'Care Team',
      p_description: null,
    });
  });

  it('archives with server attribution and restores the same id', async () => {
    const archivedAt = '2026-07-15T01:00:00.000Z';
    const archiveClient = mockClient({
      data: [row({ archived_at: archivedAt, archived_by: ADMIN_ID })],
    });
    await expect(archiveTeam(TEAM_ID)).resolves.toEqual(
      expect.objectContaining({ id: TEAM_ID, archived_at: archivedAt, archived_by: ADMIN_ID }),
    );
    expect(archiveClient.rpc).toHaveBeenCalledWith('archive_team', { p_team_id: TEAM_ID });

    const restoreClient = mockClient();
    await expect(restoreTeam(TEAM_ID)).resolves.toEqual(
      expect.objectContaining({ id: TEAM_ID, archived_at: null, archived_by: null }),
    );
    expect(restoreClient.rpc).toHaveBeenCalledWith('restore_team', { p_team_id: TEAM_ID });
  });

  it('refuses demo team ids without obtaining a Supabase client', async () => {
    mockClient();
    await expect(archiveTeam('team-demo')).rejects.toThrow(TEAM_LIFECYCLE_DEMO_ERROR);
    await expect(restoreTeam('team-demo')).rejects.toThrow(TEAM_LIFECYCLE_DEMO_ERROR);
    await expect(
      updateTeam({ teamId: 'team-demo', name: 'Team', description: null }),
    ).rejects.toThrow(TEAM_LIFECYCLE_DEMO_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });
});

describe('team lifecycle response and error safety', () => {
  it.each([
    ['NOT_AUTHORISED', TEAM_LIFECYCLE_PERMISSION_ERROR],
    ['NO_LINKED_PROFILE', TEAM_LIFECYCLE_PERMISSION_ERROR],
    ['ORGANISATION_ACCESS_REMOVED', TEAM_LIFECYCLE_PERMISSION_ERROR],
    ['TEAM_NOT_FOUND', TEAM_LIFECYCLE_NOT_FOUND_ERROR],
    ['INVALID_INITIAL_ADMIN', TEAM_LIFECYCLE_INVALID_INITIAL_ADMIN_ERROR],
    ['TEAM_ARCHIVED', TEAM_LIFECYCLE_ARCHIVED_ERROR],
    ['TEAM_ALREADY_ARCHIVED', TEAM_LIFECYCLE_ALREADY_ARCHIVED_ERROR],
    ['TEAM_NOT_ARCHIVED', TEAM_LIFECYCLE_NOT_ARCHIVED_ERROR],
    ['CONFLICT_RETRY', TEAM_LIFECYCLE_CONFLICT_ERROR],
  ])('maps %s to stable safe copy', async (serverMessage, friendlyMessage) => {
    mockClient({ error: { code: 'P0001', message: serverMessage } });
    await expect(archiveTeam(TEAM_ID)).rejects.toThrow(friendlyMessage);
  });

  it('maps network and unexpected details without leaking them', async () => {
    mockClient({ error: { message: 'Network request timed out' } });
    await expect(restoreTeam(TEAM_ID)).rejects.toThrow(TEAM_LIFECYCLE_OFFLINE_ERROR);
    mockClient({ error: { message: 'secret schema detail from postgres' } });
    await expect(restoreTeam(TEAM_ID)).rejects.toThrow(
      "We couldn't restore this team right now. Please try again.",
    );
  });

  it.each([
    [[]],
    [[row(), row({ team_id: '30000000-0000-4000-a000-000000000002' })]],
    [[row({ team_id: 'not-a-uuid' })]],
    [[row({ organisation_id: 'wrong-org' })]],
    [[row({ archived_at: CREATED_AT, archived_by: ADMIN_ID })]],
  ])('rejects malformed create success data', async (data) => {
    mockClient({ data });
    await expect(
      createTeam({ requestId: REQUEST_ID, name: 'Welcome Team', description: null, initialAdminProfileId: null }),
    ).rejects.toThrow("We couldn't create this team right now. Please try again.");
  });

  it('rejects a mismatched selected membership response', async () => {
    mockClient({
      data: [
        row({
          initial_admin_membership_id: MEMBERSHIP_ID,
          initial_admin_profile_id: ADMIN_ID,
          initial_admin_role: 'team_leader',
          initial_admin_created_at: CREATED_AT,
        }),
      ],
    });
    await expect(
      createTeam({ requestId: REQUEST_ID, name: 'Welcome Team', description: null, initialAdminProfileId: OTHER_ID }),
    ).rejects.toThrow("We couldn't create this team right now. Please try again.");
  });
});

describe('createTeam request idempotency', () => {
  it('sends the caller request id unchanged and never derives its own', async () => {
    const { rpc } = mockClient();
    await createTeam({
      requestId: REQUEST_ID,
      name: 'Welcome Team',
      description: null,
      initialAdminProfileId: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_team',
      expect.objectContaining({ p_request_id: REQUEST_ID }),
    );
  });

  it('rejects a malformed request id before obtaining a client', async () => {
    mockClient();
    for (const requestId of ['', 'request-1', 'not-a-uuid', REQUEST_ID.slice(0, -1)]) {
      await expect(
        createTeam({ requestId, name: 'Welcome Team', description: null, initialAdminProfileId: null }),
      ).rejects.toThrow("We couldn't create this team right now. Please try again.");
    }
    await expect(
      createTeam({
        requestId: undefined as unknown as string,
        name: 'Welcome Team',
        description: null,
        initialAdminProfileId: null,
      }),
    ).rejects.toThrow("We couldn't create this team right now. Please try again.");
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });

  it('returns the same team for the same request id after an ambiguous failure', async () => {
    const rpc = jest
      .fn()
      .mockRejectedValueOnce({ message: 'Network request timed out' })
      .mockResolvedValueOnce({ data: [row()], error: null })
      .mockResolvedValueOnce({ data: [row()], error: null });
    mockGetSupabase.mockReturnValue({ rpc });
    const input = {
      requestId: REQUEST_ID,
      name: 'Welcome Team',
      description: 'Welcomes people each Sunday.',
      initialAdminProfileId: null,
    };
    await expect(createTeam(input)).rejects.toThrow(TEAM_LIFECYCLE_OFFLINE_ERROR);
    const first = await createTeam(input);
    const second = await createTeam(input);
    expect(first.team.id).toBe(TEAM_ID);
    expect(second).toEqual(first);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.map(([, args]) => args.p_request_id)).toEqual([
      REQUEST_ID,
      REQUEST_ID,
      REQUEST_ID,
    ]);
  });

  it('accepts a replayed initial-admin response exactly like a first response', async () => {
    const replayRow = row({
      initial_admin_membership_id: MEMBERSHIP_ID,
      initial_admin_profile_id: OTHER_ID,
      initial_admin_role: 'team_leader',
      initial_admin_created_at: CREATED_AT,
    });
    const rpc = jest.fn().mockResolvedValue({ data: [replayRow], error: null });
    mockGetSupabase.mockReturnValue({ rpc });
    const input = {
      requestId: REQUEST_ID,
      name: 'Welcome Team',
      description: null,
      initialAdminProfileId: OTHER_ID,
    };
    const first = await createTeam(input);
    const replay = await createTeam(input);
    expect(replay).toEqual(first);
    expect(replay.initialAdminMembership).toEqual({
      id: MEMBERSHIP_ID,
      team_id: TEAM_ID,
      user_id: OTHER_ID,
      role: 'team_leader',
      created_at: CREATED_AT,
    });
  });

  it('maps request contract failures to stable safe copy', async () => {
    const input = {
      requestId: REQUEST_ID,
      name: 'Welcome Team',
      description: null,
      initialAdminProfileId: null,
    };
    mockClient({ error: { code: 'P0001', message: 'CREATE_REQUEST_MISMATCH' } });
    await expect(createTeam(input)).rejects.toThrow(TEAM_LIFECYCLE_CONFLICT_ERROR);
    mockClient({ error: { code: 'P0001', message: 'INVALID_REQUEST_ID' } });
    await expect(createTeam(input)).rejects.toThrow(
      "We couldn't create this team right now. Please try again.",
    );
    mockClient({ error: { code: '22P02', message: 'invalid input syntax for type uuid' } });
    await expect(createTeam(input)).rejects.toThrow(
      "We couldn't create this team right now. Please try again.",
    );
  });
});
