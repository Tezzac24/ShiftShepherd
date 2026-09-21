import React, { useState } from 'react';
import { Modal, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { ActionSheet } from '../ActionSheet';
import { ConfirmProvider, useConfirm } from '../ConfirmDialog';
import { SelectField } from '../SelectField';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 34, left: 0 }),
}));

let confirm: ReturnType<typeof useConfirm>;
function CaptureConfirm() {
  confirm = useConfirm();
  return <Text>Underlying screen</Text>;
}
function renderConfirmation() {
  return render(<ConfirmProvider><CaptureConfirm /></ConfirmProvider>);
}

test.each(['Cancel', 'Close'])('%s cancels a confirmation and exposes the underlying screen again', async (label) => {
  const screen = renderConfirmation();
  let result!: Promise<boolean>;
  act(() => { result = confirm({ title: 'Archive choir?', message: 'The dates and messages will be kept.', confirmLabel: 'Archive' }); });
  expect(screen.queryByText('Underlying screen')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: label }));
  await expect(result).resolves.toBe(false);
  expect(screen.getByText('Underlying screen')).toBeOnTheScreen();
});

test('platform back/Escape cancels the confirmation', async () => {
  const screen = renderConfirmation();
  let result!: Promise<boolean>;
  act(() => { result = confirm({ title: 'Leave team?', message: 'You can ask an admin to add you again.' }); });
  act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
  await expect(result).resolves.toBe(false);
});

test('replacement cancels the earlier promise; only the current action can be confirmed', async () => {
  const screen = renderConfirmation();
  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  act(() => { first = confirm({ title: 'First action', message: 'First consequence' }); });
  act(() => { second = confirm({ title: 'Second action', message: 'Second consequence', confirmLabel: 'Continue', destructive: false }); });
  await expect(first).resolves.toBe(false);
  expect(screen.queryByText('First consequence')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await expect(second).resolves.toBe(true);
});

test('unmount cancels the outstanding promise and a stale provider callback', async () => {
  const screen = renderConfirmation();
  let result!: Promise<boolean>;
  act(() => { result = confirm({ title: 'Delete song?', message: 'This cannot be undone.' }); });
  screen.unmount();
  await expect(result).resolves.toBe(false);
  await expect(confirm({ title: 'Stale action', message: 'No screen remains.' })).resolves.toBe(false);
});

const options = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Team admin', description: 'Help manage the team' },
  { value: 'unavailable', label: 'Unavailable person', disabled: true },
];

function Picker() {
  const [value, setValue] = useState<string>('member');
  return <SelectField label="Role" value={value} options={options} onChange={setValue} searchable />;
}

test('picker exposes the selection, supports search and returns the chosen value', () => {
  const screen = render(<Picker />);
  fireEvent.press(screen.getByRole('button', { name: 'Role: Member' }));
  expect(screen.getByRole('radio', { name: 'Member' })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true, checked: true }));
  expect(screen.getByRole('radio', { name: 'Unavailable person' })).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  fireEvent.changeText(screen.getByLabelText('Search role'), 'help manage');
  expect(screen.queryByRole('radio', { name: 'Member' })).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: 'Team admin. Help manage the team' }));
  expect(screen.getByRole('button', { name: 'Role: Team admin' })).toHaveProp('accessibilityState', expect.objectContaining({ expanded: false }));

  fireEvent.press(screen.getByRole('button', { name: 'Role: Team admin' }));
  expect(screen.getByRole('radio', { name: 'Team admin. Help manage the team' })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
});

test('picker cancellation and disabled choices do not change the value', () => {
  const onChange = jest.fn();
  const screen = render(<SelectField label="Role" value="member" options={options} onChange={onChange} />);
  fireEvent.press(screen.getByRole('button', { name: 'Role: Member' }));
  fireEvent.press(screen.getByRole('radio', { name: 'Unavailable person' }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Role: Member' })).toHaveProp('accessibilityState', expect.objectContaining({ expanded: false }));

  screen.rerender(<SelectField label="Role" value="member" options={options} onChange={onChange} disabled />);
  fireEvent.press(screen.getByRole('button', { name: 'Role: Member' }));
  expect(screen.queryByRole('radio')).toBeNull();
});

test('action sheets ignore disabled actions and close before invoking a selected action', () => {
  const order: string[] = [];
  const blocked = jest.fn();
  const screen = render(<ActionSheet
    visible title="Manage choir" onClose={() => order.push('close')}
    actions={[
      { key: 'edit', label: 'Edit team', onPress: () => order.push('edit') },
      { key: 'archive', label: 'Archive team', onPress: blocked, disabled: true, destructive: true },
    ]}
  />);
  fireEvent.press(screen.getByRole('button', { name: 'Archive team' }));
  expect(blocked).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Edit team' }));
  expect(order).toEqual(['close', 'edit']);
});
