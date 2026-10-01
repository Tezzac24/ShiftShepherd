import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { DateField, DateListField, TimeField } from '../DateTimeFields';
import { formatUpcoming } from '../../utils/dates';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// Jest has no measured viewport. Render all time choices to exercise their
// visible order and selection without depending on virtual scrolling metrics.
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ActualList = jest.requireActual('react-native/Libraries/Lists/FlatList').default;
  return { __esModule: true, default: function AllChoices(props: object) {
    return React.createElement(ActualList, { ...props, initialNumToRender: 100 });
  } };
});

const dateLabel = (month: number, day: number) => new Date(2026, month - 1, day).toLocaleDateString(undefined, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, 21, 12));
});
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

test('calendar retains its inclusive range, blocks past dates and returns a date key', () => {
  const change = jest.fn();
  const screen = render(<DateField label="Date" value={null} daysAhead={4} onChange={change} />);
  fireEvent.press(screen.getByRole('button', { name: 'Date: Choose a date' }));
  expect(screen.getByRole('button', { name: 'Previous month' })).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  expect(screen.getByRole('button', { name: 'Next month' })).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  const yesterday = screen.getByRole('button', { name: dateLabel(9, 20) });
  const tooLate = screen.getByRole('button', { name: dateLabel(9, 26) });
  expect(yesterday).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  expect(tooLate).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  fireEvent.press(yesterday);
  fireEvent.press(tooLate);
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: dateLabel(9, 25) }));
  expect(change).toHaveBeenCalledWith('2026-09-25');
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
});

test('an existing past date remains selectable and its month remains reachable', () => {
  const change = jest.fn();
  const screen = render(<DateField label="Date" value="2026-08-20" onChange={change} />);
  fireEvent.press(screen.getByRole('button', { name: 'Date: ' + dateLabel(8, 20) }));
  expect(screen.getByRole('button', { name: dateLabel(8, 20) })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true, disabled: false }));
  expect(screen.getByRole('button', { name: dateLabel(8, 19) })).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  fireEvent.press(screen.getByRole('button', { name: dateLabel(8, 20) }));
  expect(change).toHaveBeenCalledWith('2026-08-20');
});

test('closing or pressing back keeps the date unchanged', () => {
  const change = jest.fn();
  const screen = render(<DateField label="Date" value={null} onChange={change} />);
  fireEvent.press(screen.getByRole('button', { name: 'Date: Choose a date' }));
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  fireEvent.press(screen.getByRole('button', { name: 'Date: Choose a date' }));
  act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
});

test('date-list editing keeps the existing past-date choice', () => {
  const change = jest.fn();
  const label = formatUpcoming(new Date(2026, 7, 20));
  const screen = render(<DateListField label="Date" value="2026-08-20" daysAhead={2} onChange={change} />);
  fireEvent.press(screen.getByRole('button', { name: 'Date: ' + label }));
  fireEvent.press(screen.getByRole('radio', { name: label }));
  expect(change).toHaveBeenCalledWith('2026-08-20');
});

test('time selection keeps quarter-hour values and the explicit no-time option', () => {
  const change = jest.fn();
  const screen = render(<TimeField label="Time" value={null} onChange={change} optional />);
  fireEvent.press(screen.getByRole('button', { name: 'Time: No set time' }));
  fireEvent.press(screen.getByRole('radio', { name: 'No set time' }));
  expect(change).toHaveBeenLastCalledWith(null);

  fireEvent.press(screen.getByRole('button', { name: 'Time: No set time' }));
  const label = new Date(2026, 8, 21, 6, 15).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  fireEvent.press(screen.getByRole('radio', { name: label }));
  expect(change).toHaveBeenLastCalledWith('06:15');
});

test.each(['05:07', '23:15', '10:07'])('a saved time outside the ordinary options remains labelled and selectable: %s', (value) => {
  const change = jest.fn();
  const [hour, minute] = value.split(':').map(Number);
  const label = new Date(2026, 8, 21, hour, minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const screen = render(<TimeField label="Start" value={value} onChange={change} />);
  fireEvent.press(screen.getByRole('button', { name: 'Start: ' + label }));
  expect(screen.getByRole('radio', { name: label })).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
  fireEvent.press(screen.getByRole('radio', { name: label }));
  expect(change).toHaveBeenCalledWith(value);
});

test.each([
  ['05:07', null, '06:00'],
  ['10:07', '10:00', '10:15'],
  ['23:15', '22:45', null],
])('a retained time %s appears chronologically after the optional no-time choice', (value, before, after) => {
  const label = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return new Date(2026, 8, 21, hour, minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  const screen = render(<TimeField label="Time" value={value} onChange={jest.fn()} optional />);
  fireEvent.press(screen.getByRole('button', { name: 'Time: ' + label(value!) }));
  const choices = screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel);
  const position = choices.indexOf(label(value!));
  expect(choices[0]).toBe('No set time');
  expect(choices[position - 1]).toBe(before ? label(before) : 'No set time');
  expect(choices[position + 1]).toBe(after ? label(after) : undefined);
});

test('date field closes an open picker on disable and displays its named error without changing the value', () => {
  const change = jest.fn();
  const screen = render(<DateField label="Date" value={null} onChange={change} />);
  fireEvent.press(screen.getByRole('button', { name: 'Date: Choose a date' }));
  screen.rerender(<DateField label="Date" value={null} onChange={change} disabled error="Choose a date." />);
  expect(screen.queryByRole('button', { name: 'Next month' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Date: Choose a date' })).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, expanded: false }));
  expect(screen.getByText('Choose a date.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Date: Choose a date' }));
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull(); expect(change).not.toHaveBeenCalled();
});

test('time field closes an open selection when disabled and preserves the explicit optional null state', () => {
  const change = jest.fn();
  const screen = render(<TimeField label="Time" value={null} onChange={change} optional />);
  fireEvent.press(screen.getByRole('button', { name: 'Time: No set time' }));
  expect(screen.getByRole('radio', { name: 'No set time' })).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
  screen.rerender(<TimeField label="Time" value={null} onChange={change} optional disabled error="Time is unavailable." />);
  expect(screen.queryByRole('radio', { name: 'No set time' })).toBeNull();
  expect(screen.getByText('Time is unavailable.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Time: No set time' })).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  expect(change).not.toHaveBeenCalled();
});

test('calendar exposes the selected button as pressed to the web adapter', () => {
  const screen = render(<DateField label="Date" value="2026-09-21" onChange={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: 'Date: ' + dateLabel(9, 21) }));
  expect(screen.getByRole('button', { name: dateLabel(9, 21) })).toHaveProp('aria-pressed', true);
  expect(screen.getByRole('button', { name: dateLabel(9, 22) })).toHaveProp('aria-pressed', false);
});
