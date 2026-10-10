import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { ToastProvider, useToast } from '../Toast';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useSegments: () => ['(tabs)', 'home'] }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 34, left: 0 }),
}));

let show: ReturnType<typeof useToast>;
function CaptureToast() { show = useToast(); return null; }

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis').mockImplementation(async (duration) => duration);
});
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('a newer message receives its full reading time instead of an old timeout', async () => {
  const screen = render(<ToastProvider><CaptureToast /></ToastProvider>);
  await act(async () => { show('First saved'); });
  act(() => jest.advanceTimersByTime(4000));
  await act(async () => { show('Second saved'); });
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('alert')).toHaveTextContent('Second saved');
  act(() => jest.advanceTimersByTime(4000));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('the visible Dismiss action clears the current message', async () => {
  const screen = render(<ToastProvider><CaptureToast /></ToastProvider>);
  await act(async () => { show('Your changes were saved'); });
  fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('showing the same message again restarts its reading time', async () => {
  const screen = render(<ToastProvider><CaptureToast /></ToastProvider>);
  await act(async () => { show('Saved'); });
  act(() => jest.advanceTimersByTime(4000));
  await act(async () => { show('Saved'); });
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('alert')).toHaveTextContent('Saved');
});
