import { getSupabase } from '../../client';
import {
  createOrganisation,
  fetchAccountContext,
  mapAccountContext,
  setGlobalDisplayName,
  setOrganisationDisplayNameOverride,
  setProfileDisplayNames,
  switchActiveProfile,
} from '../accounts';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));
const mockGetSupabase = getSupabase as jest.Mock;

const AUTH_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_A = '22222222-2222-4222-8222-222222222222';
const PROFILE_B = '33333333-3333-4333-8333-333333333333';

function row(profileId: string | null, organisationId: string | null, name: string | null) {
  return {
    account_auth_user_id: AUTH_ID,
    global_display_name: 'Sarah Williams',
    name_confirmed_at: '2026-07-12T00:00:00Z',
    active_profile_id: PROFILE_A,
    profile_id: profileId,
    organisation_id: organisationId,
    organisation_name: name,
    profile_full_name: profileId ? 'Sarah Williams' : null,
    display_name_override: null,
    profile_email: profileId ? 'sarah@example.com' : null,
    profile_phone: null,
    profile_avatar_url: null,
    profile_created_at: profileId ? '2026-01-01T00:00:00Z' : null,
  };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('account context mapping', () => {
  it('represents an authenticated no-organisation account without inventing a profile', () => {
    const context = mapAccountContext([{ ...row(null, null, null), active_profile_id: null }]);
    expect(context?.account.auth_user_id).toBe(AUTH_ID);
    expect(context?.account.active_profile_id).toBeNull();
    expect(context?.organisations).toEqual([]);
  });

  it('keeps two organisations distinct and preserves the active profile', () => {
    const context = mapAccountContext([
      row(PROFILE_A, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Grace Church'),
      row(PROFILE_B, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Hope Church'),
    ]);
    expect(context?.organisations.map((entry) => entry.profile.id)).toEqual([PROFILE_A, PROFILE_B]);
    expect(context?.account.active_profile_id).toBe(PROFILE_A);
  });
});

describe('account RPC contracts', () => {
  it('loads canonical account context through one RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [row(PROFILE_A, 'org-a', 'Grace')], error: null });
    mockGetSupabase.mockReturnValue({ rpc });
    await expect(fetchAccountContext()).resolves.toMatchObject({
      account: { global_display_name: 'Sarah Williams' },
    });
    expect(rpc).toHaveBeenCalledWith('get_account_context');
  });

  it('switches by profile id only and sends no account/caller/organisation authority', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ profile_id: PROFILE_B }], error: null });
    mockGetSupabase.mockReturnValue({ rpc });
    await switchActiveProfile(PROFILE_B);
    expect(rpc).toHaveBeenCalledWith('switch_active_profile', { p_profile_id: PROFILE_B });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_auth_user_id');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_organisation_id');
  });

  it('creates an organisation with name only', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ organisation_id: 'org', profile_id: PROFILE_A, organisation_name: 'New Church' }],
      error: null,
    });
    mockGetSupabase.mockReturnValue({ rpc });
    await createOrganisation(' New Church ');
    expect(rpc).toHaveBeenCalledWith('create_organisation', {
      p_organisation_name: 'New Church',
    });
  });

  it('keeps global and organisation names on separate narrow RPCs', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({
        data: [{ account_auth_user_id: AUTH_ID, global_display_name: 'Sarah W.', name_confirmed_at: 'now' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ profile_id: PROFILE_A, full_name: 'Sarah Choir', display_name_override: 'Sarah Choir' }],
        error: null,
      });
    mockGetSupabase.mockReturnValue({ rpc });
    await setGlobalDisplayName(' Sarah W. ');
    await setOrganisationDisplayNameOverride(' Sarah Choir ');
    expect(rpc).toHaveBeenNthCalledWith(1, 'set_global_display_name', { p_display_name: 'Sarah W.' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_organisation_display_name_override', {
      p_display_name: 'Sarah Choir',
    });
  });

  it('saves the Profile screen name pair through one transactional RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        profile_id: PROFILE_A,
        full_name: 'Sarah Choir',
        display_name_override: 'Sarah Choir',
      }],
      error: null,
    });
    mockGetSupabase.mockReturnValue({ rpc });
    await setProfileDisplayNames(' Sarah W. ', ' Sarah Choir ');
    expect(rpc).toHaveBeenCalledWith('set_profile_display_names', {
      p_global_display_name: 'Sarah W.',
      p_organisation_display_name: 'Sarah Choir',
    });
  });
});
