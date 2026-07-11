import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { ChatMessage } from '../../../types';
import { subscribeToSessionChatBroadcast } from '../../supabase/services/chatBroadcast';
import { useSessionChatMessaging } from '../useSessionChatMessaging';

jest.mock('../../supabase/services/chatBroadcast', () => ({
  subscribeToSessionChatBroadcast: jest.fn(() => ({
    reconcileTeamIds: jest.fn(),
    unsubscribe: jest.fn(),
  })),
}));

const mockSubscribe = subscribeToSessionChatBroadcast as jest.Mock;
const PROFILE_A = '10000000-0000-4000-a000-000000000005';
const PROFILE_B = '10000000-0000-4000-a000-000000000006';
const TEAM_A = '30000000-0000-4000-a000-000000000001';
const TEAM_B = '30000000-0000-4000-a000-000000000002';

type Handlers = {
  onMessage: (m: ChatMessage) => void;
  onReadStateChanged: () => void;
  onReconnect: () => void;
  onReconcileRequired: () => void;
  onStatus?: (s: string) => void;
};

function lastHandlers(): Handlers {
  return mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][2];
}

let listeners: ((state: string) => void)[];
let addListenerSpy: jest.SpyInstance;

function params(overrides: Partial<Parameters<typeof useSessionChatMessaging>[0]> = {}) {
  return {
    enabled: true,
    profileId: PROFILE_A,
    teamIds: [TEAM_A],
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
    expect(mockSubscribe).toHaveBeenCalledWith(PROFILE_A, [TEAM_A], expect.any(Object));
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

    act(() => lastHandlers().onReconcileRequired());
    await flush();
    expect(p.reconcile).toHaveBeenCalledTimes(5);
  });

  it('coalesces repeated read-state invalidations into one summary request', async () => {
    const p = params();
    renderHook(() => useSessionChatMessaging(p));
    await flush();
    (p.reconcile as jest.Mock).mockClear();

    act(() => {
      lastHandlers().onReadStateChanged();
      lastHandlers().onReadStateChanged();
      lastHandlers().onReadStateChanged();
    });
    await flush();
    expect(p.reconcile).toHaveBeenCalledTimes(1);
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
    const subscriptionA = { reconcileTeamIds: jest.fn(), unsubscribe: jest.fn() };
    mockSubscribe.mockReturnValueOnce(subscriptionA);
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
    expect(subscriptionA.unsubscribe).toHaveBeenCalledTimes(1);

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

  it('reconciles team channels without recreating the session subscription', () => {
    const subscription = { reconcileTeamIds: jest.fn(), unsubscribe: jest.fn() };
    mockSubscribe.mockReturnValueOnce(subscription);
    const p = params();
    const hook = renderHook((props: typeof p) => useSessionChatMessaging(props), {
      initialProps: p,
    });

    hook.rerender({ ...p, teamIds: [TEAM_A, TEAM_B] });
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(subscription.reconcileTeamIds).toHaveBeenLastCalledWith([TEAM_A, TEAM_B]);

    hook.rerender({ ...p, teamIds: [TEAM_B, TEAM_A] });
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    // Same set in a different order does not run the reconciliation effect.
    expect(subscription.reconcileTeamIds).toHaveBeenCalledTimes(2);
  });
});
