import { getSupabase } from '../../client';
import {
  CHAT_READ_DEMO_ERROR,
  CHAT_READ_MARK_ERROR,
  CHAT_READ_OFFLINE_ERROR,
  fetchTeamChatUnreadSummary,
  markTeamChatRead,
} from '../chatReadState';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;

const TEAM_ID = '30000000-0000-4000-a000-000000000001';
const MESSAGE_ID = '24bdb3ab-10b1-4a10-89a9-bedaffcf8857';
const OTHER_PROFILE = '10000000-0000-4000-a000-000000000009';

const SUMMARY_ROW = {
  team_id: TEAM_ID,
  unread_count: 3,
  latest_message_id: MESSAGE_ID,
  latest_message_created_at: '2026-07-11T10:00:00.000Z',
  latest_message_sender_id: OTHER_PROFILE,
  last_read_message_id: null,
  last_read_at: null,
};

function mockClient(result: { data?: unknown; error?: unknown } = {}) {
  const rpc = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  const from = jest.fn();
  mockGetSupabase.mockReturnValue({ rpc, from });
  return { rpc, from };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('fetchTeamChatUnreadSummary', () => {
  it('calls the summary RPC exactly once and sends no profile/caller identity', async () => {
    const { rpc } = mockClient({ data: [SUMMARY_ROW] });
    const result = await fetchTeamChatUnreadSummary();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_team_chat_unread_summary');
    // No arguments object at all — the caller is derived server-side.
    expect(rpc.mock.calls[0]).toHaveLength(1);
    expect(result).toEqual([
      {
        team_id: TEAM_ID,
        unread_count: 3,
        latest_message_id: MESSAGE_ID,
        latest_message_created_at: '2026-07-11T10:00:00.000Z',
        latest_message_sender_id: OTHER_PROFILE,
        last_read_message_id: null,
        last_read_at: null,
      },
    ]);
  });

  it('validates rows: drops malformed entries and clamps the count', async () => {
    mockClient({
      data: [
        { ...SUMMARY_ROW, team_id: 'not-a-uuid' },
        { ...SUMMARY_ROW, unread_count: -5 },
        { ...SUMMARY_ROW, team_id: '30000000-0000-4000-a000-000000000002', unread_count: '4' },
      ],
    });
    const result = await fetchTeamChatUnreadSummary();
    expect(result).toEqual([
      expect.objectContaining({ team_id: TEAM_ID, unread_count: 0 }),
      expect.objectContaining({
        team_id: '30000000-0000-4000-a000-000000000002',
        unread_count: 4,
      }),
    ]);
  });

  it('returns null (badges just hide) without a client and never throws on error', async () => {
    mockGetSupabase.mockReturnValue(null);
    await expect(fetchTeamChatUnreadSummary()).resolves.toBeNull();

    mockClient({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(fetchTeamChatUnreadSummary()).resolves.toBeNull();
  });
});

describe('markTeamChatRead', () => {
  it('calls mark_team_chat_read once with only team and message ids', async () => {
    const { rpc } = mockClient({
      data: [{ team_id: TEAM_ID, last_read_message_id: MESSAGE_ID, last_read_at: '2026-07-11T10:00:00.000Z' }],
    });
    const result = await markTeamChatRead({ teamId: TEAM_ID, messageId: MESSAGE_ID });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_team_chat_read', {
      p_team_id: TEAM_ID,
      p_message_id: MESSAGE_ID,
    });
    // Never a profile id, caller id, read timestamp, role, or org.
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(['p_message_id', 'p_team_id']);
    expect(result).toEqual({
      team_id: TEAM_ID,
      last_read_message_id: MESSAGE_ID,
      last_read_at: '2026-07-11T10:00:00.000Z',
    });
  });

  it('refuses demo/mock ids before obtaining a Supabase client', async () => {
    const { rpc } = mockClient();
    await expect(
      markTeamChatRead({ teamId: 'team-choir', messageId: 'msg-1' }),
    ).rejects.toThrow(CHAT_READ_DEMO_ERROR);
    expect(mockGetSupabase).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats a forward-only no-op (existing row) as success', async () => {
    // The RPC legitimately returns the current cursor when the call does not
    // advance it; the service still resolves to a stable cursor.
    mockClient({
      data: [{ team_id: TEAM_ID, last_read_message_id: MESSAGE_ID, last_read_at: '2026-07-11T12:00:00.000Z' }],
    });
    await expect(
      markTeamChatRead({ teamId: TEAM_ID, messageId: MESSAGE_ID }),
    ).resolves.toEqual({
      team_id: TEAM_ID,
      last_read_message_id: MESSAGE_ID,
      last_read_at: '2026-07-11T12:00:00.000Z',
    });
  });

  it.each([
    ['Team chat is not accessible'],
    ['Message not found for team'],
    ['No linked profile for the current user'],
    ['fetch failed: network down'],
    ['sensitive internal detail'],
  ])('maps "%s" to one calm bookkeeping message', async (serverMessage) => {
    mockClient({ error: { code: 'P0001', message: serverMessage } });
    await expect(
      markTeamChatRead({ teamId: TEAM_ID, messageId: MESSAGE_ID }),
    ).rejects.toThrow(CHAT_READ_MARK_ERROR);
  });

  it('surfaces the offline message when there is no client', async () => {
    mockGetSupabase.mockReturnValue(null);
    // Live-shaped ids get past the demo guard, then requireClient throws offline
    // (mapped through to the calm mark error is acceptable; offline is friendly).
    await expect(
      markTeamChatRead({ teamId: TEAM_ID, messageId: MESSAGE_ID }),
    ).rejects.toThrow(CHAT_READ_OFFLINE_ERROR);
  });
});
