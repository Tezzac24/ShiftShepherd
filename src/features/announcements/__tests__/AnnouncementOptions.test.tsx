import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text } from 'react-native';

import { AnnouncementOptions } from '../AnnouncementOptions';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

afterEach(() => jest.restoreAllMocks());

test('field remeasurement during closing does not restart the animation or delay removal', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const completions: ((result: { finished: boolean }) => void)[] = [];
  const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (callback) => { if (callback) completions.push(callback); },
    stop: jest.fn(), reset: jest.fn(),
  }));
  const screen = render(<AnnouncementOptions summary="" disabled={false}>
    <Text>Linked event (optional)</Text>
  </AnnouncementOptions>);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: /More options/ }));
  const panel = screen.getByTestId('announcement-options-panel');
  const content = panel.find((node) => typeof node.props.onLayout === 'function');
  fireEvent(content, 'layout', { nativeEvent: { layout: { height: 240 } } });
  act(() => completions[completions.length - 1]({ finished: true }));
  timing.mockClear();

  fireEvent.press(screen.getByRole('button', { name: /More options/ }));
  const finishClose = completions[completions.length - 1];
  // Native layout can report a different content height as the wrapper shrinks.
  for (const height of [120, 60, 24]) {
    fireEvent(content, 'layout', { nativeEvent: { layout: { height } } });
  }
  expect(timing).toHaveBeenCalledTimes(1);
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, duration: 180 }));
  act(() => finishClose({ finished: true }));
  expect(screen.queryByText('Linked event (optional)', { includeHiddenElements: true })).toBeNull();
});
