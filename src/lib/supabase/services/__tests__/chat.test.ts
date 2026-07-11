import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

import { getSupabase } from '../../client';
import { subscribeToSessionChatMessages } from '../chat';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const PROFILE_ID = '10000000-0000-4000-a000-000000000005';
const TEAM_ID = '30000000-0000-4000-a000-000000000001';

interface Filter {
  event: string;
  table: string;
}

function realtimeClient() {
  const callbacks = new Map<string, (payload: unknown) => void>();
  let statusCallback: ((status: string) => void) | undefined;
  const channel: { on: jest.Mock; subscribe: jest.Mock } = {
    on: jest.fn((_kind: string, filter: Filter, callback: (payload: unknown) => void) => {
      callbacks.set(`${filter.table}:${filter.event}`, callback);
      return channel;
    }),
    subscribe: jest.fn((callback: (status: string) => void) => {
      statusCallback = callback;
      return channel;
    }),
  };
  const client = {
    channel: jest.fn(() => channel),
    removeChannel: jest.fn().mockResolvedValue(undefined),
  };
  mockGetSupabase.mockReturnValue(client);
  return { callbacks, channel, client, status: (v: string) => statusCallback?.(v) };
}

function validRow() {
  return {
    id: 'aa11bb22-10b1-4a10-89a9-bedaffcf8857',
    organisation_id: 'a0000000-0000-4000-a000-000000000001',
    team_id: TEAM_ID,
    sender_id: '10000000-0000-4000-a000-000000000009',
    body: 'hello team',
    created_at: '2026-07-11T10:00:00.000Z',
  };
}

const handlers = () => ({
  onMessage: jest.fn(),
  onReadStateChanged: jest.fn(),
  onReconnect: jest.fn(),
  onStatus: jest.fn(),
});

beforeEach(() => jest.clearAllMocks());

describe('subscribeToSessionChatMessages', () => {
  it('creates no channel for a demo/mock or missing profile id', () => {
    const h = handlers();
    mockGetSupabase.mockReturnValue({ channel: jest.fn(), removeChannel: jest.fn() });
    subscribeToSessionChatMessages('user-demo', h);
    expect(h.onStatus).toHaveBeenCalledWith('disconnected');
    expect((mockGetSupabase.mock.results[0].value as { channel: jest.Mock }).channel)
      .not.toHaveBeenCalled();
  });

  it('opens one session channel with message and read-state listeners', () => {
    const { client, channel, callbacks } = realtimeClient();
    subscribeToSessionChatMessages(PROFILE_ID, handlers());
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.channel).toHaveBeenCalledWith(`chat-session:${PROFILE_ID}`);
    expect(channel.on).toHaveBeenCalledTimes(3);
    expect(new Set(callbacks.keys())).toEqual(
      new Set(['chat_messages:INSERT', 'chat_read_states:INSERT', 'chat_read_states:UPDATE']),
    );
  });

  it('delivers a well-formed message once and ignores malformed payloads', () => {
    const h = handlers();
    const { callbacks } = realtimeClient();
    subscribeToSessionChatMessages(PROFILE_ID, h);

    callbacks.get('chat_messages:INSERT')?.({ new: validRow() });
    expect(h.onMessage).toHaveBeenCalledTimes(1);
    expect(h.onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: validRow().id, team_id: TEAM_ID, attachment: null }),
    );

    callbacks.get('chat_messages:INSERT')?.({ new: { id: 'x' } }); // missing fields
    expect(h.onMessage).toHaveBeenCalledTimes(1);
  });

  it('signals a read-state change on the caller’s own INSERT or UPDATE', () => {
    const h = handlers();
    const { callbacks } = realtimeClient();
    subscribeToSessionChatMessages(PROFILE_ID, h);
    callbacks.get('chat_read_states:INSERT')?.({ new: {} });
    callbacks.get('chat_read_states:UPDATE')?.({ new: {} });
    expect(h.onReadStateChanged).toHaveBeenCalledTimes(2);
  });

  it('requests catch-up only after a genuine reconnect', () => {
    const h = handlers();
    const realtime = realtimeClient();
    subscribeToSessionChatMessages(PROFILE_ID, h);
    realtime.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(h.onReconnect).not.toHaveBeenCalled();
    realtime.status(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    expect(h.onStatus).toHaveBeenLastCalledWith('reconnecting');
    realtime.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(h.onReconnect).toHaveBeenCalledTimes(1);
  });

  it('removes the channel and ignores stale callbacks after unsubscribe', () => {
    const h = handlers();
    const realtime = realtimeClient();
    const unsubscribe = subscribeToSessionChatMessages(PROFILE_ID, h);
    unsubscribe();
    realtime.callbacks.get('chat_messages:INSERT')?.({ new: validRow() });
    realtime.callbacks.get('chat_read_states:UPDATE')?.({ new: {} });
    expect(h.onMessage).not.toHaveBeenCalled();
    expect(h.onReadStateChanged).not.toHaveBeenCalled();
    expect(realtime.client.removeChannel).toHaveBeenCalledWith(realtime.channel);
  });
});
