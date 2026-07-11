import { getSupabase } from '../../client';
import {
  buildProfileUpdatePayload,
  PROFILE_NAME_REQUIRED,
  PROFILE_NAME_TOO_LONG,
  updateOwnProfile,
} from '../profiles';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const LIVE_PROFILE_ID = '5f0d8f5e-1111-2222-3333-444455556666';

function mockClient(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  mockGetSupabase.mockReturnValue({ rpc });
  return { rpc };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warnSpy.mockRestore());

describe('buildProfileUpdatePayload', () => {
  it('allow-lists only the trimmed full name — phone and admin-owned fields never pass through', () => {
    const input = {
      full_name: '  Sarah Williams  ',
      phone: '+44 7700 900104',
      email: 'changed@example.com',
      avatar_url: 'profiles/other/avatar.jpg',
      organisation_id: 'other-org',
      auth_user_id: 'other-auth-user',
      role: 'church_admin',
      teams: ['all'],
    };
    expect(buildProfileUpdatePayload(input)).toEqual({ p_full_name: 'Sarah Williams' });
  });

  it('returns calm validation errors', () => {
    expect(() => buildProfileUpdatePayload({ full_name: ' ' })).toThrow(PROFILE_NAME_REQUIRED);
    expect(() => buildProfileUpdatePayload({ full_name: 'A'.repeat(101) })).toThrow(
      PROFILE_NAME_TOO_LONG,
    );
  });
});

describe('updateOwnProfile', () => {
  it('refuses demo ids without calling Supabase', async () => {
    const { rpc } = mockClient({ data: null, error: null });
    await expect(updateOwnProfile('user-sarah', { full_name: 'Sarah Williams' })).rejects.toThrow(
      "We couldn't save your profile right now. Please try again.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls the name-only RPC and never sends a phone value', async () => {
    const { rpc } = mockClient({
      data: [{ profile_id: LIVE_PROFILE_ID, full_name: 'Sarah W.', phone: '+44 7700 900104' }],
      error: null,
    });
    await expect(updateOwnProfile(LIVE_PROFILE_ID, { full_name: ' Sarah W. ' })).resolves.toEqual({
      id: LIVE_PROFILE_ID,
      full_name: 'Sarah W.',
      phone: '+44 7700 900104',
    });
    expect(rpc).toHaveBeenCalledWith('update_own_profile', { p_full_name: 'Sarah W.' });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_phone');
  });

  it('returns the stored phone unchanged so the app can keep displaying it', async () => {
    mockClient({
      data: [{ profile_id: LIVE_PROFILE_ID, full_name: 'Sarah Williams', phone: null }],
      error: null,
    });
    await expect(
      updateOwnProfile(LIVE_PROFILE_ID, { full_name: 'Sarah Williams' }),
    ).resolves.toEqual({ id: LIVE_PROFILE_ID, full_name: 'Sarah Williams', phone: null });
  });

  it('rejects a mismatched returned profile instead of patching another user', async () => {
    mockClient({
      data: [{ profile_id: 'different-profile', full_name: 'Someone Else', phone: null }],
      error: null,
    });
    await expect(
      updateOwnProfile(LIVE_PROFILE_ID, { full_name: 'Sarah Williams' }),
    ).rejects.toThrow("We couldn't save your profile right now. Please try again.");
  });

  it('maps server validation and network failures to friendly copy', async () => {
    mockClient({ data: null, error: { message: 'Full name must be at least 2 characters' } });
    await expect(updateOwnProfile(LIVE_PROFILE_ID, { full_name: 'Sarah' })).rejects.toThrow(
      PROFILE_NAME_REQUIRED,
    );

    mockClient({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await expect(updateOwnProfile(LIVE_PROFILE_ID, { full_name: 'Sarah' })).rejects.toThrow(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  });
});
