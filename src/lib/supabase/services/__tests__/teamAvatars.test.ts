import { getSupabase } from '../../client';
import {
  buildTeamAvatarPath,
  createTeamAvatarSignedUrls,
  TEAM_AVATAR_MAX_BYTES,
  TEAM_AVATAR_SIZE_ERROR,
  TEAM_AVATAR_TYPE_ERROR,
  uploadTeamAvatar,
} from '../teamAvatars';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const LIVE_TEAM_ID = '30000000-0000-4000-a000-000000000001';
const FILE = { base64: 'aGVsbG8=', mimeType: 'image/jpeg', fileSize: 5 };

function mockClient({
  uploadError = null,
  rpcError = null,
  removeError = null,
  signedData = [],
  signedError = null,
}: {
  uploadError?: unknown;
  rpcError?: unknown;
  removeError?: unknown;
  signedData?: unknown[];
  signedError?: unknown;
} = {}) {
  const upload = jest.fn().mockResolvedValue({ error: uploadError });
  const remove = jest.fn().mockResolvedValue({ error: removeError });
  const createSignedUrls = jest.fn().mockResolvedValue({ data: signedData, error: signedError });
  const fromStorage = jest.fn(() => ({ upload, remove, createSignedUrls }));
  const rpc = jest.fn().mockResolvedValue({ data: null, error: rpcError });
  mockGetSupabase.mockReturnValue({ storage: { from: fromStorage }, rpc });
  return { upload, remove, createSignedUrls, fromStorage, rpc };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  jest.restoreAllMocks();
});

describe('team avatar validation and paths', () => {
  it('builds paths only under the target team prefix', () => {
    expect(buildTeamAvatarPath(LIVE_TEAM_ID, 'image/png', 1234)).toBe(
      `teams/${LIVE_TEAM_ID}/avatar-1234.png`,
    );
  });

  it('rejects invalid MIME and oversize files before upload', async () => {
    const { upload } = mockClient();
    await expect(
      uploadTeamAvatar(LIVE_TEAM_ID, null, { ...FILE, mimeType: 'image/gif' }),
    ).rejects.toThrow(TEAM_AVATAR_TYPE_ERROR);
    await expect(
      uploadTeamAvatar(LIVE_TEAM_ID, null, { ...FILE, fileSize: TEAM_AVATAR_MAX_BYTES + 1 }),
    ).rejects.toThrow(TEAM_AVATAR_SIZE_ERROR);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses demo team ids before upload', async () => {
    const { upload, rpc } = mockClient();
    await expect(uploadTeamAvatar('team-choir', null, FILE)).rejects.toThrow(
      'You do not have permission to change this team photo.',
    );
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });
});

describe('team avatar storage flow', () => {
  it('uploads with a generated path and repoints through the narrow RPC', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(9876);
    const { upload, rpc } = mockClient();
    const expectedPath = `teams/${LIVE_TEAM_ID}/avatar-9876.jpg`;
    await expect(uploadTeamAvatar(LIVE_TEAM_ID, null, FILE)).resolves.toBe(expectedPath);
    expect(upload).toHaveBeenCalledWith(
      expectedPath,
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    );
    expect(rpc).toHaveBeenCalledWith('set_team_avatar_path', {
      p_team_id: LIVE_TEAM_ID,
      p_avatar_path: expectedPath,
    });
  });

  it('treats old-object cleanup failure as non-fatal after a successful replace', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(9876);
    const { remove } = mockClient({ removeError: { code: 'cleanup-failed' } });
    await expect(
      uploadTeamAvatar(LIVE_TEAM_ID, `teams/${LIVE_TEAM_ID}/old.jpg`, FILE),
    ).resolves.toBe(`teams/${LIVE_TEAM_ID}/avatar-9876.jpg`);
    expect(remove).toHaveBeenCalledWith([`teams/${LIVE_TEAM_ID}/old.jpg`]);
  });

  it('maps only successfully signed paths and falls back to null on signing failure', async () => {
    const path = `teams/${LIVE_TEAM_ID}/avatar.jpg`;
    mockClient({
      signedData: [
        { path, signedUrl: 'https://signed.example/avatar', error: null },
        { path: 'bad', signedUrl: null, error: 'failed' },
      ],
    });
    await expect(createTeamAvatarSignedUrls([path])).resolves.toEqual({
      [path]: 'https://signed.example/avatar',
    });

    mockClient({ signedError: { code: 'offline' } });
    await expect(createTeamAvatarSignedUrls([path])).resolves.toBeNull();
  });
});
