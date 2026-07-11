import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { ChatMessage } from '../../../types';
import { subscribeToSessionChatMessages } from '../../supabase/services/chat';
import { useSessionChatMessaging } from '../useSessionChatMessaging';

jest.mock('../../supabase/services/chat', () => ({
  subscribeToSessionChatMessages: jest.fn(() => jest.fn()),
}));

const mockSubscribe = subscribeToSessionChatMessages as jest.Mock;
const PROFILE_A = '10000000-0000-4000-a000-000000000005';
const PROFILE_B = '10000000-0000-4000-a000-000000000006';

type Handlers = {
  onMessage: (m: ChatMessage) => void;
  onReadStateChanged: () => void;
  onReconnect: () => void;
  onStatus?: (s: string) => void;
};

function lastHandlers(): Handlers {
  return mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][1];
}

let listeners: ((state: string) => void)[];
let addListenerSpy: jest.SpyInstance;

function params(overrides: Partial<Parameters<typeof useSessionChatMessaging>[0]> = {}) {
  return {
    enabled: true,
    profileId: PROFILE_A,
    onIncomingMessage: jest.fn(),
    reconcile: jest.fn().mockResolvedValue(undefined),
    onStatus: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  listeners = [];
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  addListenerSpy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      listeners.push(callback as (state: string) => void);
      return { remove: jest.fn() } as never;
    });
});

afterEach(() => {
  addListenerSpy.mockRestore();
  jest.useRealTimers();
});

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(200);
    await Promise.resolve();
  });
}

describe('useSessionChatMessaging lifecycle', () => {
  it('creates no channel and no listener in demo/logged-out/unlinked states', async () => {
    const p = params({ enabled: false, profileId: null });
    renderHook(() => useSessionChatMessaging(p));
    await flush();
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(addListenerSpy).not.toHaveBeenCalled();
    expect(p.reconcile).not.toHaveBeenCalled();

    const p2 = params({ enabled: true, profileId: null });
    renderHook(() => useSessionChatMessaging(p2));
    await flush();
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(p2.reconcile).not.toHaveBeenCalled();
  });

  it('opens exactly one channel per live session and reconciles once on mount', async () => {
    const p = params();
    renderHook(() => useSessionChatMessaging(p));
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith(PROFILE_A, expect.any(Object));
    await flush();
    expect(p.reconcile).toHaveBeenCalledTimes(1); // no duplicate initial load
  });

  it('reconciles on reconnect, on a read-state event, and on app foreground', async () => {
    const p = params();
    renderHook(() => useSessionChatMessaging(p));
    await flush();
    expect(p.reconcile).toHaveBeenCalledTimes(1);

    act(() => lastHandlers().onReconnect());
    await flush();
    expect(p.reconcile).toHaveBeenCalledTimes(2);

    act(() => lastHandlers().onReadStateChanged());
    await flush();
    expect(p.reconcile).toHaveBeenCalledTimes(3);

    act(() => {
      listeners[0]?.('background');
      listeners[0]?.('active');
    });
    await flush();
    expect(p.reconcile).toHaveBeenCalledTimes(4);
  });

  it('forwards incoming messages and channel status to its callbacks', async () => {
    const p = params();
    renderHook(() => useSessionChatMessaging(p));
    const msg = { id: 'm1', team_id: 'team-a' } as ChatMessage;
    act(() => lastHandlers().onMessage(msg));
    expect(p.onIncomingMessage).toHaveBeenCalledWith(msg);
    act(() => lastHandlers().onStatus?.('reconnecting'));
    expect(p.onStatus).toHaveBeenCalledWith('reconnecting');
  });

  it('tears down and ignores stale callbacks after an account switch', async () => {
    const unsubA = jest.fn();
    mockSubscribe.mockReturnValueOnce(unsubA);
    let profileId = PROFILE_A;
    const p = params({ profileId });
    const hook = renderHook((props: typeof p) => useSessionChatMessaging(props), {
      initialProps: p,
    });
    await flush();
    const staleHandlers = lastHandlers();
    (p.reconcile as jest.Mock).mockClear();

    profileId = PROFILE_B;
    hook.rerender({ ...p, profileId });
    expect(unsubA).toHaveBeenCalledTimes(1);

    // A late event from the torn-down session must not reconcile the new one.
    act(() => {
      staleHandlers.onReadStateChanged();
      staleHandlers.onReconnect();
      jest.advanceTimersByTime(200);
    });
    await act(async () => Promise.resolve());
    // Only the fresh session's mount reconcile ran.
    expect(p.reconcile).toHaveBeenCalledTimes(1);
  });
});
