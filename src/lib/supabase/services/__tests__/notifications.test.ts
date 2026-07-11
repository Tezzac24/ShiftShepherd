/**
 * Notification preferences service.
 *
 * The Supabase client is mocked — nothing here reaches a real project.
 * Guards the "no row = all-on defaults" contract the chat push Edge Function
 * mirrors, the upsert-on-user_id save shape, and the demo/live separation
 * (mock ids must never become live queries).
 */
import { NotificationPreferences } from '../../../../types';
import { getSupabase } from '../../client';
import { fetchNotificationPreferences, saveNotificationPreferences } from '../notifications';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;

const LIVE_PROFILE_ID = '5f0d8f5e-1111-2222-3333-444455556666';

const SAVED_ROW: NotificationPreferences = {
  id: 'b0e7c9d2-1111-2222-3333-444455556666',
  user_id: LIVE_PROFILE_ID,
  announcement_notifications: true,
  team_announcement_notifications: true,
  chat_notifications: false,
  rota_notifications: true,
  event_reminders: true,
  availability_reminders: true,
};

function mockSelectClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  mockGetSupabase.mockReturnValue({ from });
  return { from, select, eq, maybeSingle };
}

function mockUpsertClient(result: { data: unknown; error: unknown }) {
  const single = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ single }));
  const upsert = jest.fn(() => ({ select }));
  const from = jest.fn(() => ({ upsert }));
  mockGetSupabase.mockReturnValue({ from });
  return { from, upsert, select, single };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('fetchNotificationPreferences', () => {
  it('returns null for a user with no saved row (the app then assumes all-on defaults)', async () => {
    mockSelectClient({ data: null, error: null });
    await expect(fetchNotificationPreferences(LIVE_PROFILE_ID)).resolves.toBeNull();
  });

  it('returns an explicitly saved row unchanged, including switched-off types', async () => {
    mockSelectClient({ data: SAVED_ROW, error: null });
    const prefs = await fetchNotificationPreferences(LIVE_PROFILE_ID);
    expect(prefs).toEqual(SAVED_ROW);
    expect(prefs?.chat_notifications).toBe(false);
  });

  it('refuses mock/demo profile ids without querying (demo mode never hits Supabase)', async () => {
    const { from } = mockSelectClient({ data: null, error: null });
    await expect(fetchNotificationPreferences('user-1')).rejects.toThrow(
      "We couldn't load your notification settings right now. Please try again.",
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('fails with the offline message when there is no Supabase client (demo mode)', async () => {
    mockGetSupabase.mockReturnValue(null);
    await expect(fetchNotificationPreferences(LIVE_PROFILE_ID)).rejects.toThrow(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  });
});

describe('saveNotificationPreferences', () => {
  const PATCH = {
    announcement_notifications: true,
    team_announcement_notifications: true,
    chat_notifications: false,
    rota_notifications: true,
    event_reminders: true,
    availability_reminders: true,
  };

  it('upserts onto the unique user_id so the first save creates the row', async () => {
    const { upsert } = mockUpsertClient({ data: SAVED_ROW, error: null });
    await expect(saveNotificationPreferences(LIVE_PROFILE_ID, PATCH)).resolves.toEqual(SAVED_ROW);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: LIVE_PROFILE_ID, ...PATCH },
      { onConflict: 'user_id' },
    );
  });

  it('refuses mock/demo profile ids without writing', async () => {
    const { from } = mockUpsertClient({ data: SAVED_ROW, error: null });
    await expect(saveNotificationPreferences('user-1', PATCH)).rejects.toThrow(
      "We couldn't save your notification settings. Check your connection and try again.",
    );
    expect(from).not.toHaveBeenCalled();
  });
});
