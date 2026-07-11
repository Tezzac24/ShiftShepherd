import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

import { getSupabase } from '../../client';
import { fetchChatMessageById } from '../chat';
import {
  CHAT_MESSAGE_BROADCAST_EVENT,
  CHAT_READ_STATE_BROADCAST_EVENT,
  decodeChatMessageBroadcast,
  decodeChatReadStateBroadcast,
  profileChatReadTopic,
  subscribeToSessionChatBroadcast,
  teamChatTopic,
} from '../chatBroadcast';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));
jest.mock('../chat', () => ({ fetchChatMessageById: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;
const mockFetchMessage = fetchChatMessageById as jest.Mock;
const PROFILE_ID = '10000000-0000-4000-a000-000000000005';
const OTHER_PROFILE_ID = '10000000-0000-4000-a000-000000000006';
const AUTH_USER_ID = '20000000-0000-4000-a000-000000000005';
const TEAM_A = '30000000-0000-4000-a000-000000000001';
const TEAM_B = '30000000-0000-4000-a000-000000000002';
const MESSAGE_ID = 'aa11bb22-10b1-4a10-89a9-bedaffcf8857';
const SENDER_ID = '10000000-0000-4000-a000-000000000009';

function messageSignal(overrides: Record<string, unknown> = {}) {
  return {
    payload: {
      version: 1,
      message_id: MESSAGE_ID,
      team_id: TEAM_A,
      sender_id: SENDER_ID,
      created_at: '2026-07-11T10:00:00.000Z',
      ...overrides,
    },
  };
}

function readSignal(overrides: Record<string, unknown> = {}) {
  return { payload: { version: 1, team_id: TEAM_A, ...overrides } };
}

function handlers() {
  return {
    onMessage: jest.fn(),
    onReadStateChanged: jest.fn(),
    onReconnect: jest.fn(),
    onReconcileRequired: jest.fn(),
    onStatus: jest.fn(),
  };
}

interface FakeChannel {
  topic: string;
  config: unknown;
  on: jest.Mock;
  subscribe: jest.Mock;
  emit: (event: string, payload: unknown) => void;
  status: (status: string) => void;
}

function realtimeClient() {
  const channels = new Map<string, FakeChannel>();
  let authCallback:
    | ((event: string, session: { access_token: string; user: { id: string } } | null) => void)
    | null = null;
  const authListenerUnsubscribe = jest.fn();
  const setAuth = jest.fn().mockResolvedValue(undefined);
  const removeChannel = jest.fn((target: FakeChannel) => {
    channels.delete(target.topic);
    return Promise.resolve(undefined);
  });
  const getSession = jest.fn().mockResolvedValue({
    data: { session: { access_token: 'token-a', user: { id: AUTH_USER_ID } } },
    error: null,
  });
  const onAuthStateChange = jest.fn((callback) => {
    authCallback = callback;
    return { data: { subscription: { unsubscribe: authListenerUnsubscribe } } };
  });
  const channel = jest.fn((topic: string, config: unknown) => {
    const eventCallbacks = new Map<string, (payload: unknown) => void>();
    let statusCallback: ((status: string) => void) | undefined;
    const fake: FakeChannel = {
      topic,
      config,
      on: jest.fn((_type: string, filter: { event: string }, callback) => {
        eventCallbacks.set(filter.event, callback);
        return fake;
      }),
      subscribe: jest.fn((callback) => {
        statusCallback = callback;
        return fake;
      }),
      emit: (event, payload) => eventCallbacks.get(event)?.(payload),
      status: (status) => statusCallback?.(status),
    };
    channels.set(topic, fake);
    return fake;
  });
  const client = {
    auth: { getSession, onAuthStateChange },
    realtime: { setAuth },
    channel,
    removeChannel,
  };
  mockGetSupabase.mockReturnValue(client);
  return {
    client,
    channels,
    setAuth,
    removeChannel,
    authListenerUnsubscribe,
    authEvent: (
      event: string,
      session: { access_token: string; user: { id: string } } | null,
    ) => authCallback?.(event, session),
  };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchMessage.mockResolvedValue({ id: MESSAGE_ID, team_id: TEAM_A });
});

describe('private chat Broadcast topics and payloads', () => {
  it('builds only the exact team and profile topic forms for live UUIDs', () => {
    expect(teamChatTopic(TEAM_A)).toBe(`team-chat:${TEAM_A}`);
    expect(profileChatReadTopic(PROFILE_ID)).toBe(`profile-chat-read:${PROFILE_ID}`);
    expect(() => teamChatTopic('team-demo')).toThrow('live team UUID');
    expect(() => profileChatReadTopic('not-a-uuid')).toThrow('live profile UUID');
  });

  it('accepts a valid minimal v1 message signal and trusts no extra fields', () => {
    expect(
      decodeChatMessageBroadcast(messageSignal({ body: 'must not be trusted' }), TEAM_A),
    ).toEqual({
      version: 1,
      message_id: MESSAGE_ID,
      team_id: TEAM_A,
      sender_id: SENDER_ID,
      created_at: '2026-07-11T10:00:00.000Z',
    });
  });

  it.each<[Record<string, unknown>, string]>([
    [{ version: 2 }, 'wrong version'],
    [{ message_id: 'bad' }, 'malformed message id'],
    [{ sender_id: undefined }, 'missing field'],
    [{ created_at: 'yesterday' }, 'invalid timestamp'],
    [{ team_id: TEAM_B }, 'team mismatch'],
  ])('rejects %s (%s)', (overrides) => {
    expect(decodeChatMessageBroadcast(messageSignal(overrides), TEAM_A)).toBeNull();
  });

  it('validates minimal read invalidations', () => {
    expect(decodeChatReadStateBroadcast(readSignal())).toEqual({ version: 1, team_id: TEAM_A });
    expect(decodeChatReadStateBroadcast(readSignal({ version: 2 }))).toBeNull();
    expect(decodeChatReadStateBroadcast(readSignal({ team_id: 'team-demo' }))).toBeNull();
  });
});

describe('session private Broadcast manager', () => {
  it('creates no channel or Realtime auth path for demo/invalid profiles', () => {
    const realtime = realtimeClient();
    const h = handlers();
    subscribeToSessionChatBroadcast('user-demo', [TEAM_A], h);
    expect(realtime.client.channel).not.toHaveBeenCalled();
    expect(realtime.setAuth).not.toHaveBeenCalled();
    expect(h.onStatus).toHaveBeenCalledWith('disconnected');
  });

  it('sets Realtime auth before one private profile channel and one channel per team', async () => {
    const realtime = realtimeClient();
    const h = handlers();
    subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A, TEAM_B], h);
    await flushAsync();

    expect(realtime.setAuth).toHaveBeenCalledWith('token-a');
    expect(realtime.channels.size).toBe(3);
    expect([...realtime.channels.keys()].sort()).toEqual(
      [profileChatReadTopic(PROFILE_ID), teamChatTopic(TEAM_A), teamChatTopic(TEAM_B)].sort(),
    );
    for (const channel of realtime.channels.values()) {
      expect(channel.config).toEqual({ config: { private: true } });
      expect(channel.on.mock.calls[0][0]).toBe('broadcast');
    }
    expect(realtime.setAuth.mock.invocationCallOrder[0]).toBeLessThan(
      realtime.client.channel.mock.invocationCallOrder[0],
    );
  });

  it('fetches a valid exact message once and ignores malformed/duplicate events', async () => {
    const realtime = realtimeClient();
    const h = handlers();
    subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    const channel = realtime.channels.get(teamChatTopic(TEAM_A))!;

    channel.emit(CHAT_MESSAGE_BROADCAST_EVENT, messageSignal());
    channel.emit(CHAT_MESSAGE_BROADCAST_EVENT, messageSignal());
    channel.emit(CHAT_MESSAGE_BROADCAST_EVENT, messageSignal({ version: 2 }));
    await flushAsync();

    expect(mockFetchMessage).toHaveBeenCalledTimes(1);
    expect(mockFetchMessage).toHaveBeenCalledWith({ teamId: TEAM_A, messageId: MESSAGE_ID });
    expect(h.onMessage).toHaveBeenCalledTimes(1);
  });

  it('reconciles safely when the exact row is inaccessible', async () => {
    mockFetchMessage.mockResolvedValueOnce(null);
    const realtime = realtimeClient();
    const h = handlers();
    subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    realtime.channels.get(teamChatTopic(TEAM_A))!.emit(
      CHAT_MESSAGE_BROADCAST_EVENT,
      messageSignal(),
    );
    await flushAsync();
    expect(h.onMessage).not.toHaveBeenCalled();
    expect(h.onReconcileRequired).toHaveBeenCalledTimes(1);
  });

  it('validates profile read events before requesting summary reconciliation', async () => {
    const realtime = realtimeClient();
    const h = handlers();
    subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    const channel = realtime.channels.get(profileChatReadTopic(PROFILE_ID))!;
    channel.emit(CHAT_READ_STATE_BROADCAST_EVENT, readSignal());
    channel.emit(CHAT_READ_STATE_BROADCAST_EVENT, readSignal({ version: 4 }));
    expect(h.onReadStateChanged).toHaveBeenCalledTimes(1);
    expect(h.onReadStateChanged).toHaveBeenCalledWith(TEAM_A);
  });

  it('adds/removes team channels set-wise and preserves unchanged channels', async () => {
    const realtime = realtimeClient();
    const subscription = subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], handlers());
    await flushAsync();
    const originalA = realtime.channels.get(teamChatTopic(TEAM_A));

    subscription.reconcileTeamIds([TEAM_A, TEAM_B]);
    expect(realtime.channels.get(teamChatTopic(TEAM_A))).toBe(originalA);
    expect(realtime.channels.has(teamChatTopic(TEAM_B))).toBe(true);
    expect(realtime.client.channel).toHaveBeenCalledTimes(3);

    subscription.reconcileTeamIds([TEAM_B]);
    expect(realtime.removeChannel).toHaveBeenCalledWith(originalA);
    expect(realtime.channels.has(teamChatTopic(TEAM_A))).toBe(false);

    subscription.reconcileTeamIds([TEAM_B]);
    expect(realtime.client.channel).toHaveBeenCalledTimes(3);
  });

  it('does not deliver a pending message after team access is removed', async () => {
    let resolveMessage: (value: unknown) => void = () => {};
    mockFetchMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMessage = resolve;
      }),
    );
    const realtime = realtimeClient();
    const h = handlers();
    const subscription = subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    realtime.channels.get(teamChatTopic(TEAM_A))!.emit(
      CHAT_MESSAGE_BROADCAST_EVENT,
      messageSignal(),
    );
    subscription.reconcileTeamIds([]);
    resolveMessage({ id: MESSAGE_ID, team_id: TEAM_A });
    await flushAsync();
    expect(h.onMessage).not.toHaveBeenCalled();
  });

  it('ignores a pending fetch failure after team access is removed', async () => {
    let rejectMessage: (reason: unknown) => void = () => {};
    mockFetchMessage.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectMessage = reject;
      }),
    );
    const realtime = realtimeClient();
    const h = handlers();
    const subscription = subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    realtime.channels.get(teamChatTopic(TEAM_A))!.emit(
      CHAT_MESSAGE_BROADCAST_EVENT,
      messageSignal(),
    );
    subscription.reconcileTeamIds([]);
    rejectMessage({ code: 'NETWORK' });
    await flushAsync();
    expect(h.onReconcileRequired).not.toHaveBeenCalled();
  });

  it('updates Realtime auth on token refresh without duplicating channels', async () => {
    const realtime = realtimeClient();
    subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], handlers());
    await flushAsync();
    const channelCount = realtime.client.channel.mock.calls.length;

    realtime.authEvent('TOKEN_REFRESHED', {
      access_token: 'token-b',
      user: { id: AUTH_USER_ID },
    });
    await flushAsync();
    expect(realtime.setAuth).toHaveBeenLastCalledWith('token-b');
    expect(realtime.client.channel).toHaveBeenCalledTimes(channelCount);
  });

  it('tears down old channels immediately on account switch and ignores stale callbacks', async () => {
    const realtime = realtimeClient();
    const h = handlers();
    subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    const oldChannel = realtime.channels.get(teamChatTopic(TEAM_A))!;

    realtime.authEvent('SIGNED_IN', {
      access_token: 'other-token',
      user: { id: OTHER_PROFILE_ID },
    });
    oldChannel.emit(CHAT_MESSAGE_BROADCAST_EVENT, messageSignal());
    await flushAsync();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(2);
    expect(h.onMessage).not.toHaveBeenCalled();
    expect(realtime.setAuth).not.toHaveBeenCalledWith('other-token');
  });

  it('treats initial joins as normal and reconciles once after genuine recovery', async () => {
    const realtime = realtimeClient();
    const h = handlers();
    subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    const profile = realtime.channels.get(profileChatReadTopic(PROFILE_ID))!;
    const team = realtime.channels.get(teamChatTopic(TEAM_A))!;

    profile.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    team.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(h.onReconnect).not.toHaveBeenCalled();
    expect(h.onStatus).toHaveBeenLastCalledWith('connected');

    team.status(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    team.status(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR);
    expect(h.onStatus).toHaveBeenLastCalledWith('reconnecting');
    team.status(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    expect(h.onReconnect).toHaveBeenCalledTimes(1);
  });

  it('cleans up every channel/auth listener and ignores later events', async () => {
    const realtime = realtimeClient();
    const h = handlers();
    const subscription = subscribeToSessionChatBroadcast(PROFILE_ID, [TEAM_A], h);
    await flushAsync();
    const oldTeam = realtime.channels.get(teamChatTopic(TEAM_A))!;
    subscription.unsubscribe();
    oldTeam.emit(CHAT_MESSAGE_BROADCAST_EVENT, messageSignal());
    await flushAsync();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(2);
    expect(realtime.authListenerUnsubscribe).toHaveBeenCalledTimes(1);
    expect(h.onMessage).not.toHaveBeenCalled();
  });
});
