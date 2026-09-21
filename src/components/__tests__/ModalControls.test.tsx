import React, { useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Text, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { ActionSheet } from '../ActionSheet';
import { ConfirmProvider, useConfirm } from '../ConfirmDialog';
import { SelectField } from '../SelectField';
import { FocusRef, ModalSurface } from '../ModalSurface';

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

describe('modal dismissal focus', () => {
  let frames: (() => void)[];
  let focus: jest.SpyInstance;
  let resolveNode: jest.SpyInstance;
  const opener = (): FocusRef => ({ current: { focus: jest.fn() } as unknown as View });
  const flushFrames = () => act(() => { frames.splice(0).forEach((callback) => callback()); });

  beforeEach(() => {
    frames = [];
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(() => callback(0));
      return frames.length;
    });
    resolveNode = jest.spyOn(jest.requireActual('react-native'), 'findNodeHandle').mockReturnValue(71);
    focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
  });

  afterEach(() => { jest.restoreAllMocks(); });

  function Sheet({ returnFocusRef, order, unmountOnClose = false }: {
    returnFocusRef: FocusRef; order: string[]; unmountOnClose?: boolean;
  }) {
    const [visible, setVisible] = useState(true);
    if (!visible && unmountOnClose) return <Text>Destination screen</Text>;
    return <ActionSheet visible={visible} title="Manage team" returnFocusRef={returnFocusRef}
      onClose={() => { order.push('close'); setVisible(false); }} actions={[
        { key: 'next', label: 'Edit team', onPress: () => order.push('action') },
        { key: 'disabled', label: 'Unavailable action', disabled: true, onPress: () => order.push('disabled') },
      ]} />;
  }

  test.each(['Close', 'platform back'])('%s restores the sheet opener after dismissal', (dismiss) => {
    const returnFocusRef = opener();
    const order: string[] = [];
    const screen = render(<Sheet returnFocusRef={returnFocusRef} order={order} />);
    // A disabled choice must not accidentally opt out of a later cancellation.
    fireEvent.press(screen.getByRole('button', { name: 'Unavailable action' }));
    if (dismiss === 'Close') fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    else act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(order).toEqual(['close']);
    expect(focus).not.toHaveBeenCalled();
    flushFrames();
    expect(resolveNode).toHaveBeenCalledWith(returnFocusRef.current);
    expect(focus).toHaveBeenCalledWith(71);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test('confirmation Cancel preserves native dismissal focus and resolves cancellation', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const returnFocusRef = opener();
    const screen = renderConfirmation();
    let result!: Promise<boolean>;
    act(() => { result = confirm({ title: 'Remove member?', message: 'Their church account stays.', returnFocusRef }); });
    const dismiss = screen.UNSAFE_getByType(Modal).props.onDismiss;
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await expect(result).resolves.toBe(false);
    expect(focus).not.toHaveBeenCalled();
    act(() => { dismiss(); dismiss(); });
    expect(resolveNode).toHaveBeenCalledWith(returnFocusRef.current);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test.each(['android', 'ios'] as const)('an action transfers focus before close/action callbacks, including unmount on %s', (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const order: string[] = [];
    const screen = render(<Sheet returnFocusRef={opener()} order={order} unmountOnClose />);
    const dismiss = screen.UNSAFE_getByType(Modal).props.onDismiss;
    fireEvent.press(screen.getByRole('button', { name: 'Edit team' }));
    expect(order).toEqual(['close', 'action']);
    expect(screen.getByText('Destination screen')).toBeTruthy();
    act(() => dismiss());
    flushFrames();
    expect(focus).not.toHaveBeenCalled();
    expect(resolveNode).not.toHaveBeenCalled();
  });

  test('an old iOS dismissal cannot restore focus after a newer opening, even once both have closed', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const firstOpener = opener();
    const nextOpener = opener();
    const surface = (visible: boolean, returnFocusRef = firstOpener) => <ModalSurface visible={visible} title="Choose a date"
      onClose={jest.fn()} returnFocusRef={returnFocusRef}><Text>Dates</Text></ModalSurface>;
    const screen = render(surface(true));
    const staleDismiss = screen.UNSAFE_getByType(Modal).props.onDismiss;
    screen.rerender(surface(false));
    screen.rerender(surface(true, nextOpener));
    act(() => staleDismiss());
    expect(focus).not.toHaveBeenCalled();
    const currentDismiss = screen.UNSAFE_getByType(Modal).props.onDismiss;
    screen.rerender(surface(false, nextOpener));
    act(() => staleDismiss());
    expect(focus).not.toHaveBeenCalled();
    act(() => currentDismiss());
    expect(resolveNode).toHaveBeenCalledWith(nextOpener.current);
    expect(resolveNode).not.toHaveBeenCalledWith(firstOpener.current);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test('an old Android focus frame is ignored after the modal reopens', () => {
    const returnFocusRef = opener();
    const surface = (visible: boolean) => <ModalSurface visible={visible} title="Options" onClose={jest.fn()}
      returnFocusRef={returnFocusRef}><Text>Choices</Text></ModalSurface>;
    const screen = render(surface(true));
    screen.rerender(surface(false));
    const oldFrame = frames.shift()!;
    screen.rerender(surface(true));
    act(() => oldFrame());
    expect(focus).not.toHaveBeenCalled();
    screen.rerender(surface(false));
    act(() => oldFrame());
    expect(focus).not.toHaveBeenCalled();
    flushFrames();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test('a sheet can restore cancellation focus after an earlier action transferred control', () => {
    const returnFocusRef = opener();
    const onClose = jest.fn();
    const action = jest.fn();
    const sheet = (visible: boolean) => <ActionSheet visible={visible} title="Manage team" returnFocusRef={returnFocusRef}
      onClose={onClose} actions={[{ key: 'edit', label: 'Edit team', onPress: action }]} />;
    const screen = render(sheet(true));
    fireEvent.press(screen.getByRole('button', { name: 'Edit team' }));
    screen.rerender(sheet(false));
    screen.rerender(sheet(true));
    flushFrames();
    expect(focus).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    screen.rerender(sheet(false));
    flushFrames();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test('web cancellation focuses the supplied element ref through the same guarded path', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const returnFocusRef = opener();
    const screen = render(<Sheet returnFocusRef={returnFocusRef} order={[]} />);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    flushFrames();
    expect(returnFocusRef.current?.focus).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });
});
