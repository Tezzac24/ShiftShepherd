import { getSupabase } from '../../client';
import { fetchChatMessageById } from '../chat';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const TEAM_ID = '30000000-0000-4000-a000-000000000001';
const MESSAGE_ID = 'aa11bb22-10b1-4a10-89a9-bedaffcf8857';

function messageRow() {
  return {
    id: MESSAGE_ID,
    organisation_id: 'a0000000-0000-4000-a000-000000000001',
    team_id: TEAM_ID,
    sender_id: '10000000-0000-4000-a000-000000000009',
    body: 'hello team',
    created_at: '2026-07-11T10:00:00.000Z',
    chat_attachments: [],
  };
}

function exactMessageClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const secondEq = jest.fn(() => ({ maybeSingle }));
  const firstEq = jest.fn(() => ({ eq: secondEq }));
  const select = jest.fn(() => ({ eq: firstEq }));
  const from = jest.fn(() => ({ select }));
  const client = { from };
  mockGetSupabase.mockReturnValue(client);
  return { client, select, firstEq, secondEq, maybeSingle };
}

beforeEach(() => jest.clearAllMocks());

describe('fetchChatMessageById', () => {
  it('fetches exactly one authoritative row constrained by team and message id', async () => {
    const query = exactMessageClient({ data: messageRow(), error: null });

    await expect(fetchChatMessageById({ teamId: TEAM_ID, messageId: MESSAGE_ID })).resolves.toEqual(
      expect.objectContaining({ id: MESSAGE_ID, team_id: TEAM_ID, attachment: null }),
    );
    expect(query.client.from).toHaveBeenCalledWith('chat_messages');
    expect(query.firstEq).toHaveBeenCalledWith('team_id', TEAM_ID);
    expect(query.secondEq).toHaveBeenCalledWith('id', MESSAGE_ID);
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('returns null when RLS or access changes make the exact row unavailable', async () => {
    exactMessageClient({ data: null, error: null });
    await expect(fetchChatMessageById({ teamId: TEAM_ID, messageId: MESSAGE_ID })).resolves.toBeNull();
  });

  it('rejects malformed or demo ids before creating a Supabase client', async () => {
    await expect(
      fetchChatMessageById({ teamId: 'team-demo', messageId: MESSAGE_ID }),
    ).rejects.toThrow("We couldn't load messages right now");
    await expect(
      fetchChatMessageById({ teamId: TEAM_ID, messageId: 'not-a-uuid' }),
    ).rejects.toThrow("We couldn't load messages right now");
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });
});
