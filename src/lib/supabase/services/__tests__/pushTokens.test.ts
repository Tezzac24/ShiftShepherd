/**
 * Push token service (Push Token Registration V1).
 *
 * The Supabase client is mocked — nothing here reaches a real project.
 * Guards the register_push_token RPC contract (token + platform only, never
 * a profile id), the demo/live separation, the friendly error mapping, and
 * that the raw token never appears in logs or error messages.
 */
import { getSupabase } from '../../client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PushRegistrationAccessError,
  registerPushToken,
  unregisterPushToken,
} from '../pushTokens';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;

const TOKEN = 'ExponentPushToken[service-test-token]';
const LIVE_PROFILE_ID = '5f0d8f5e-1111-2222-3333-444455556666';

function mockClient(rpcResult: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(rpcResult);
  mockGetSupabase.mockReturnValue({ rpc });
  return { rpc };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('registerPushToken', () => {
  it('fails with the offline message when there is no Supabase client (demo mode)', async () => {
    mockGetSupabase.mockReturnValue(null);
    await expect(registerPushToken(LIVE_PROFILE_ID, TOKEN, 'ios')).rejects.toThrow(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  });

  it('refuses mock/demo profile ids without calling the RPC', async () => {
    const { rpc } = mockClient({ data: null, error: null });
    await expect(registerPushToken('user-1', TOKEN, 'ios')).rejects.toThrow(
      "We couldn't register this device for notifications. Please try again.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('registers via the register_push_token RPC with token and platform only', async () => {
    const { rpc } = mockClient({ data: '2026-07-11T12:00:00+00:00', error: null });
    await expect(registerPushToken(LIVE_PROFILE_ID, TOKEN, 'ios')).resolves.toBe(
      '2026-07-11T12:00:00+00:00',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    // The database derives the owner from auth.uid() — the app must never
    // send a profile id.
    expect(rpc).toHaveBeenCalledWith('register_push_token', {
      p_token: TOKEN,
      p_platform: 'ios',
    });
  });

  it.each([
    ['null', null],
    ['empty string', ''],
    ['invalid date string', 'not-a-date'],
    ['unexpected non-string', { registered_at: '2026-07-11T12:00:00+00:00' }],
  ])('rejects a malformed %s success response', async (_label, data) => {
    mockClient({ data, error: null });
    await expect(registerPushToken(LIVE_PROFILE_ID, TOKEN, 'ios')).rejects.toThrow(
      "We couldn't register this device for notifications. Please try again.",
    );
    expect(warnSpy.mock.calls.map((args) => JSON.stringify(args)).join(' ')).not.toContain(
      TOKEN,
    );
  });

  it('maps a missing RPC (migration not applied) to the friendly setup message', async () => {
    mockClient({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function register_push_token' },
    });
    await expect(registerPushToken(LIVE_PROFILE_ID, TOKEN, 'ios')).rejects.toThrow(
      'Device registration is not switched on for your church yet. Please try again after the next update.',
    );
  });

  it('maps network failures to the offline message', async () => {
    mockClient({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await expect(registerPushToken(LIVE_PROFILE_ID, TOKEN, 'ios')).rejects.toThrow(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  });

  it.each(['ORGANISATION_ACCESS_REMOVED', 'NO_LINKED_PROFILE'] as const)(
    'preserves the actionable %s access reason without exposing server detail',
    async (code) => {
      mockClient({ data: null, error: { code: 'P0001', message: code } });
      const failure = await registerPushToken(LIVE_PROFILE_ID, TOKEN, 'ios').catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(PushRegistrationAccessError);
      expect((failure as PushRegistrationAccessError).code).toBe(code);
      expect(String(failure)).not.toContain(TOKEN);
    },
  );

  it('never puts the raw token in errors or logs', async () => {
    mockClient({ data: null, error: { code: '500', message: 'unexpected' } });
    let thrown: Error | null = null;
    await registerPushToken(LIVE_PROFILE_ID, TOKEN, 'ios').catch((error: Error) => {
      thrown = error;
    });
    expect(thrown).not.toBeNull();
    expect(String(thrown)).not.toContain(TOKEN);
    const loggedText = warnSpy.mock.calls.map((args) => JSON.stringify(args)).join(' ');
    expect(loggedText).not.toContain(TOKEN);
  });
});

describe('unregisterPushToken', () => {
  it('returns true when the account-owned token was deleted', async () => {
    const { rpc } = mockClient({ data: true, error: null });
    await expect(unregisterPushToken(TOKEN)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('unregister_push_token', { p_token: TOKEN });
  });

  it('returns false for a missing, repeated, or differently-owned token', async () => {
    mockClient({ data: false, error: null });
    await expect(unregisterPushToken(TOKEN)).resolves.toBe(false);
  });

  it('does not make a network call in demo mode', async () => {
    mockGetSupabase.mockReturnValue(null);
    await expect(unregisterPushToken(TOKEN)).rejects.toThrow(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  });

  it('normalises Supabase failures and never exposes the token', async () => {
    mockClient({ data: null, error: { code: '500', message: 'unexpected' } });
    const failure = await unregisterPushToken(TOKEN).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(TOKEN);
    const loggedText = warnSpy.mock.calls.map((args) => JSON.stringify(args)).join(' ');
    expect(loggedText).not.toContain(TOKEN);
  });

  it('maps network failures to the existing offline message', async () => {
    mockClient({ data: null, error: { message: 'network timeout' } });
    await expect(unregisterPushToken(TOKEN)).rejects.toThrow(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  });

  it('rejects malformed RPC responses instead of guessing', async () => {
    mockClient({ data: 'true', error: null });
    await expect(unregisterPushToken(TOKEN)).rejects.toThrow(
      "We couldn't remove this device's notification registration. Please try again.",
    );
  });

  it('keeps the implementation free of any-based typing escapes', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/supabase/services/pushTokens.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bas any\b|:\s*any\b/);
  });
});
