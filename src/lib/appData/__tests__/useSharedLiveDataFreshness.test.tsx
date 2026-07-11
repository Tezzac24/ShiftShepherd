import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { SharedRefreshDomain } from '../liveInvalidation';
import { useSharedLiveDataFreshness } from '../useSharedLiveDataFreshness';
import { subscribeToSharedDataChanges } from '../../supabase/services/sharedRealtime';

jest.mock('../../supabase/services/sharedRealtime', () => ({
  subscribeToSharedDataChanges: jest.fn(() => jest.fn()),
}));

const mockSubscribe = subscribeToSharedDataChanges as jest.Mock;
const PROFILE_A = '20000000-0000-4000-a000-000000000001';
const PROFILE_B = '20000000-0000-4000-a000-000000000002';

function makeRefreshers() {
  return {
    announcements: jest.fn().mockResolvedValue(undefined),
    events: jest.fn().mockResolvedValue(undefined),
    rotas: jest.fn().mockResolvedValue(undefined),
    songs: jest.fn().mockResolvedValue(undefined),
    directory: jest.fn().mockResolvedValue(undefined),
  } satisfies Record<SharedRefreshDomain, jest.Mock>;
}

let listeners: ((state: string) => void)[];
let addListenerSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  listeners = [];
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  addListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(
    (_event, callback) => {
      listeners.push(callback as (state: string) => void);
      return { remove: jest.fn() } as never;
    },
  );
});

afterEach(() => {
  addListenerSpy.mockRestore();
  jest.useRealTimers();
});

describe('useSharedLiveDataFreshness AppState lifecycle', () => {
  it('does nothing in demo mode and does not duplicate initial active loading', () => {
    const refreshers = makeRefreshers();
    renderHook(() =>
      useSharedLiveDataFreshness({ enabled: false, profileId: null, refreshers }),
    );
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(addListenerSpy).not.toHaveBeenCalled();
    for (const refresh of Object.values(refreshers)) expect(refresh).not.toHaveBeenCalled();
  });

  it('coalesces background-to-active catch-up across every shared domain', async () => {
    const refreshers = makeRefreshers();
    renderHook(() =>
      useSharedLiveDataFreshness({ enabled: true, profileId: PROFILE_A, refreshers }),
    );
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(1);
    act(() => {
      listeners[0]?.('background');
      listeners[0]?.('active');
      listeners[0]?.('active');
      jest.advanceTimersByTime(180);
    });
    await act(async () => Promise.resolve());
    for (const refresh of Object.values(refreshers)) {
      expect(refresh).toHaveBeenCalledTimes(1);
    }
  });

  it('ignores an old account listener after user switch cleanup', () => {
    const refreshers = makeRefreshers();
    let profileId = PROFILE_A;
    const hook = renderHook(() =>
      useSharedLiveDataFreshness({ enabled: true, profileId, refreshers }),
    );
    const staleListener = listeners[0]!;
    profileId = PROFILE_B;
    hook.rerender(undefined);
    act(() => {
      staleListener('background');
      staleListener('active');
      jest.runAllTimers();
    });
    for (const refresh of Object.values(refreshers)) expect(refresh).not.toHaveBeenCalled();
  });
});
