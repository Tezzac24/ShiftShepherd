import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

import { getSupabase } from '../../client';
import {
  SHARED_REALTIME_TABLES,
  SHARED_TABLE_DOMAINS,
  subscribeToSharedDataChanges,
} from '../sharedRealtime';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const PROFILE_ID = '20000000-0000-4000-a000-000000000001';

function realtimeClient() {
  const callbacks = new Map<string, () => void>();
  let statusCallback: ((status: string) => void) | undefined;
  const channel: { on: jest.Mock; subscribe: jest.Mock } = {
    on: jest.fn((_kind: string, filter: { table: string }, callback: () => void) => {
      callbacks.set(filter.table, callback);
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
  return {
    callbacks,
    channel,
    client,
    status: (value: string) => statusCallback?.(value),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('subscribeToSharedDataChanges', () => {
  it('creates no channel in demo mode or without a linked profile', () => {
    subscribeToSharedDataChanges(null, {
      onInvalidate: jest.fn(),
      onReconnect: jest.fn(),
    });
    subscribeToSharedDataChanges('user-demo', {
      onInvalidate: jest.fn(),
      onReconnect: jest.fn(),
    });
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });

  it('creates exactly one session channel with every required non-chat listener', () => {
    const { client, channel, callbacks } = realtimeClient();
    subscribeToSharedDataChanges(PROFILE_ID, {
      onInvalidate: jest.fn(),
      onReconnect: jest.fn(),
    });
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.channel).toHaveBeenCalledWith(`shared-data:${PROFILE_ID}`);
    expect(channel.on).toHaveBeenCalledTimes(SHARED_REALTIME_TABLES.length);
    expect(new Set(callbacks.keys())).toEqual(new Set(SHARED_REALTIME_TABLES));
    expect(callbacks.has('chat_messages')).toBe(false);
    expect(callbacks.has('chat_attachments')).toBe(false);
    expect(SHARED_TABLE_DOMAINS.user_accounts).toEqual(['directory']);
  });

  it('maps each table event to its declared refresh domains', () => {
    const onInvalidate = jest.fn();
    const { callbacks } = realtimeClient();
    subscribeToSharedDataChanges(PROFILE_ID, {
      onInvalidate,
      onReconnect: jest.fn(),
    });
    for (const table of SHARED_REALTIME_TABLES) {
      callbacks.get(table)?.();
      expect(onInvalidate).toHaveBeenLastCalledWith(SHARED_TABLE_DOMAINS[table]);
    }
  });

  it('requests catch-up only after a genuine subscription recovery', () => {
    const onReconnect = jest.fn();
    const onStatus = jest.fn();
    const realtime = realtimeClient();
    subscribeToSharedDataChanges(PROFILE_ID, {
      onInvalidate: jest.fn(),
      onReconnect,
      onStatus,
    });
    realtime.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(onReconnect).not.toHaveBeenCalled();
    realtime.status(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting');
    realtime.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('removes the channel and ignores stale callbacks after cleanup', () => {
    const onInvalidate = jest.fn();
    const realtime = realtimeClient();
    const unsubscribe = subscribeToSharedDataChanges(PROFILE_ID, {
      onInvalidate,
      onReconnect: jest.fn(),
    });
    unsubscribe();
    realtime.callbacks.get('announcements')?.();
    expect(onInvalidate).not.toHaveBeenCalled();
    expect(realtime.client.removeChannel).toHaveBeenCalledWith(realtime.channel);
  });
});
