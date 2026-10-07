import { act, renderHook } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';

import { greetingForNow, toDateKey } from '../dates';
import { useCurrentTime } from '../useCurrentTime';

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: { currentState: 'active', addEventListener: jest.fn() },
}));

let notify: (state: AppStateStatus) => void;
let remove: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 6, 23, 59, 59));
  jest.replaceProperty(AppState, 'currentState', 'active');
  remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event !== 'change') throw new Error('Only foreground changes are needed.');
    notify = listener;
    return { remove };
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('a mounted view rolls to the next local day without another data event', () => {
  const { result } = renderHook(useCurrentTime);
  expect(toDateKey(result.current)).toBe('2026-10-06');
  act(() => jest.advanceTimersByTime(1000));
  expect(toDateKey(result.current)).toBe('2026-10-07');
  expect(greetingForNow(result.current)).toBe('Good morning');
});

test('the next local hour refreshes a changed greeting', () => {
  jest.setSystemTime(new Date(2026, 9, 7, 11, 59, 59));
  const { result } = renderHook(useCurrentTime);
  expect(greetingForNow(result.current)).toBe('Good morning');
  act(() => jest.advanceTimersByTime(1000));
  expect(greetingForNow(result.current)).toBe('Good afternoon');
});

test('background time is unscheduled and foreground resumes immediately after skipped days', () => {
  const { result } = renderHook(useCurrentTime);
  act(() => notify('background'));
  expect(jest.getTimerCount()).toBe(0);
  act(() => { jest.setSystemTime(new Date(2026, 9, 9, 18, 12)); notify('active'); });
  expect(toDateKey(result.current)).toBe('2026-10-09');
  expect(greetingForNow(result.current)).toBe('Good evening');
  expect(jest.getTimerCount()).toBe(1);
  act(() => notify('inactive'));
  expect(jest.getTimerCount()).toBe(0);
});

test('mounting in the background waits for foreground to schedule, and unmount removes all work', () => {
  jest.replaceProperty(AppState, 'currentState', 'background');
  const { unmount } = renderHook(useCurrentTime);
  expect(jest.getTimerCount()).toBe(0);
  act(() => notify('active'));
  expect(jest.getTimerCount()).toBe(1);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledTimes(1);
});
