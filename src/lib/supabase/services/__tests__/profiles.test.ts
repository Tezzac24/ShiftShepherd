import { getSupabase } from '../../client';
import {
  buildProfileUpdatePayload,
  PROFILE_NAME_REQUIRED,
  PROFILE_NAME_TOO_LONG,
  PROFILE_PHONE_TOO_LONG,
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
  it('allow-lists only full name and phone, trimming both', () => {
    const input = {
      full_name: '  Sarah Williams  ',
      phone: '  +44 7700 900104  ',
      email: 'changed@example.com',
      organisation_id: 'other-org',
      auth_user_id: 'other-auth-user',
      role: 'church_admin',
      teams: ['all'],
    };
    expect(buildProfileUpdatePayload(input)).toEqual({
      p_full_name: 'Sarah Williams',
      p_phone: '+44 7700 900104',
    });
  });

  it('returns calm validation errors', () => {
    expect(() => buildProfileUpdatePayload({ full_name: ' ', phone: null })).toThrow(
      PROFILE_NAME_REQUIRED,
    );
    expect(() => buildProfileUpdatePayload({ full_name: 'A'.repeat(101), phone: null })).toThrow(
      PROFILE_NAME_TOO_LONG,
    );
    expect(() => buildProfileUpdatePayload({ full_name: 'Sarah', phone: '1'.repeat(31) })).toThrow(
      PROFILE_PHONE_TOO_LONG,
    );
  });
});

describe('updateOwnProfile', () => {
  it('refuses demo ids without calling Supabase', async () => {
    const { rpc } = mockClient({ data: null, error: null });
    await expect(
      updateOwnProfile('user-sarah', { full_name: 'Sarah Williams', phone: null }),
    ).rejects.toThrow("We couldn't save your profile right now. Please try again.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the current-profile RPC with safe fields only', async () => {
    const { rpc } = mockClient({
      data: [{ profile_id: LIVE_PROFILE_ID, full_name: 'Sarah W.', phone: null }],
      error: null,
    });
    await expect(
      updateOwnProfile(LIVE_PROFILE_ID, { full_name: ' Sarah W. ', phone: ' ' }),
    ).resolves.toEqual({ id: LIVE_PROFILE_ID, full_name: 'Sarah W.', phone: null });
    expect(rpc).toHaveBeenCalledWith('update_own_profile', {
      p_full_name: 'Sarah W.',
      p_phone: '',
    });
  });

  it('rejects a mismatched returned profile instead of patching another user', async () => {
    mockClient({
      data: [{ profile_id: 'different-profile', full_name: 'Someone Else', phone: null }],
      error: null,
    });
    await expect(
      updateOwnProfile(LIVE_PROFILE_ID, { full_name: 'Sarah Williams', phone: null }),
    ).rejects.toThrow("We couldn't save your profile right now. Please try again.");
  });

  it('maps server validation and network failures to friendly copy', async () => {
    mockClient({ data: null, error: { message: 'Full name must be at least 2 characters' } });
    await expect(
      updateOwnProfile(LIVE_PROFILE_ID, { full_name: 'Sarah', phone: null }),
    ).rejects.toThrow(PROFILE_NAME_REQUIRED);

    mockClient({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await expect(
      updateOwnProfile(LIVE_PROFILE_ID, { full_name: 'Sarah', phone: null }),
    ).rejects.toThrow("We couldn't reach the server. Please check your connection and try again.");
  });
});
