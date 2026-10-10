import { act, fireEvent, render } from '@testing-library/react-native';
import React, { useState } from 'react';
import { AccessibilityInfo, Animated, TextInput } from 'react-native';

import { AnimatedDisclosure } from '../AnimatedDisclosure';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

afterEach(() => jest.restoreAllMocks());

function DraftDisclosure({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  return <AnimatedDisclosure title="Artist and notes" open={open} disabled={disabled}
    onToggle={() => setOpen((value) => !value)} panelTestID="panel">
    <TextInput accessibilityLabel="Artist" value={draft} onChangeText={setDraft} />
  </AnimatedDisclosure>;
}

test('reduced motion reveals immediately and collapsing preserves the controlled draft', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const timing = jest.spyOn(Animated, 'timing');
  const screen = render(<DraftDisclosure />);
  await act(async () => {});
  const trigger = screen.getByRole('button', { name: /Artist and notes/ });
  expect(trigger.props.accessibilityState.expanded).toBe(false);
  fireEvent.press(trigger);
  const content = screen.getByTestId('panel').find((node) => typeof node.props.onLayout === 'function');
  fireEvent(content, 'layout', { nativeEvent: { layout: { height: 120 } } });
  expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 0 }));
  fireEvent.changeText(screen.getByLabelText('Artist'), 'Choir draft');
  fireEvent.press(trigger);
  expect(screen.queryByLabelText('Artist')).toBeNull();
  fireEvent.press(trigger);
  expect(screen.getByDisplayValue('Choir draft')).toBeTruthy();
  expect(trigger.props.accessibilityState.expanded).toBe(true);
});

test('a disabled disclosure cannot open its fields', async () => {
  const screen = render(<DraftDisclosure disabled />);
  await act(async () => {});
  const trigger = screen.getByRole('button', { name: /Artist and notes/ });
  fireEvent.press(trigger);
  expect(trigger.props.accessibilityState.disabled).toBe(true);
  expect(screen.queryByLabelText('Artist')).toBeNull();
});
