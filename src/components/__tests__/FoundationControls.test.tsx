import React, { createRef } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { fireEvent, isHiddenFromAccessibility, render } from '@testing-library/react-native';

import { Button } from '../Button';
import { AppText } from '../AppText';
import { FormErrorSummary } from '../FormErrorSummary';
import { ListGroup } from '../ListGroup';
import { PageHeading } from '../PageHeading';
import { SectionHeader } from '../SectionHeader';
import { ListRow, SwitchRow } from '../ListRow';
import { SegmentedControl } from '../SegmentedControl';
import { StatePanel } from '../StatePanel';
import { TextField } from '../TextField';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

type AccessibilityNode = { props: Record<string, unknown> };

test('visual text variants do not turn card titles into document headings', () => {
  const screen = render(<View>
    <AppText variant="title">A large card title</AppText>
    <AppText variant="heading">An event name</AppText>
    <AppText variant="subheading">A team name</AppText>
  </View>);
  expect(screen.queryByRole('header')).toBeNull();
});

test('explicit heading levels retain native headers and provide document hierarchy', () => {
  const screen = render(<View>
    <PageHeading title="Schedule" />
    <SectionHeader title="Upcoming dates" />
    <AppText variant="bodyBold" headingLevel={3}>September</AppText>
    <AppText headingLevel={2} accessibilityRole="alert">Your changes were not saved</AppText>
  </View>);
  expect(screen.getAllByRole('header')).toHaveLength(3);
  expect(screen.getByRole('header', { name: 'Schedule' })).toHaveProp('aria-level', 1);
  expect(screen.getByRole('header', { name: 'Upcoming dates' })).toHaveProp('aria-level', 2);
  expect(screen.getByRole('header', { name: 'September' })).toHaveProp('aria-level', 3);
  expect(screen.getByRole('alert')).not.toHaveProp('aria-level');
});

test('buttons expose busy state and suppress duplicate/disabled submissions', () => {
  const onPress = jest.fn();
  const screen = render(<Button title="Save all selected dates" testID="save" onPress={onPress} />);
  fireEvent.press(screen.getByRole('button', { name: 'Save all selected dates' }));
  expect(onPress).toHaveBeenCalledTimes(1);

  screen.rerender(<Button title="Save all selected dates" testID="save" onPress={onPress} loading />);
  expect(screen.getByTestId('save')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, busy: true }));
  const busyButton = screen.UNSAFE_root.findAll((node: AccessibilityNode) => node.props.accessibilityRole === 'button' && node.props['aria-busy'] === true);
  expect(busyButton.length).toBeGreaterThan(0);
  expect(busyButton[0].props['aria-disabled']).toBe(true);
  fireEvent.press(screen.getByTestId('save'));
  expect(onPress).toHaveBeenCalledTimes(1);

  screen.rerender(<Button title="Save all selected dates" onPress={onPress} disabled />);
  fireEvent.press(screen.getByRole('button'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('text fields retain input behaviour, IDs and a standard ref for validation focus', () => {
  const ref = createRef<TextInput>();
  const onChange = jest.fn();
  const onFocus = jest.fn();
  const screen = render(
    <TextField
      ref={ref} label="Password" testID="password" secureTextEntry
      textContentType="password" autoComplete="current-password"
      value="" onChangeText={onChange} onFocus={onFocus}
      error="Use at least eight characters."
    />,
  );
  const input = screen.getByLabelText('Password');
  fireEvent.changeText(input, 'new-password');
  fireEvent(input, 'focus', { nativeEvent: {} });
  expect(onChange).toHaveBeenCalledWith('new-password');
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(input).toHaveProp('secureTextEntry', true);
  expect(input).toHaveProp('autoComplete', 'current-password');
  expect(screen.getByTestId('password')).toHaveProp('accessibilityHint', 'Use at least eight characters.');
  expect(screen.getByRole('alert')).toHaveTextContent('Use at least eight characters.');
  expect(typeof ref.current?.focus).toBe('function');
});

test('read-only and disabled text fields remain readable and uneditable', () => {
  const screen = render(<TextField label="Email" value="reader@example.com" editable={false} />);
  expect(screen.getByLabelText('Email')).toHaveProp('editable', false);
  expect(screen.getByLabelText('Email')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  screen.rerender(<TextField label="Email" value="reader@example.com" disabled />);
  expect(screen.getByLabelText('Email')).toHaveProp('editable', false);
});

test('a full preference row is one accessible switch and changes once per tap', () => {
  const change = jest.fn();
  const screen = render(
    <ListGroup><SwitchRow title="Team messages" subtitle="Messages from your teams" value onValueChange={change} /></ListGroup>,
  );
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  const toggle = screen.getByRole('switch');
  expect(toggle).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }));
  const switchInputs: AccessibilityNode[] = screen.UNSAFE_root.findAll((node: AccessibilityNode) => node.props.accessibilityRole === 'switch' && node.props['aria-checked'] !== undefined);
  expect(switchInputs.map((node) => node.props['aria-checked'])).toEqual([true]);
  fireEvent.press(toggle);
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith(false);

  screen.rerender(<ListGroup><SwitchRow title="Team messages" value onValueChange={change} busy /></ListGroup>);
  expect(screen.getByRole('switch')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, busy: true }));
  const busySwitch = screen.UNSAFE_root.findAll((node: AccessibilityNode) => node.props.accessibilityRole === 'switch' && node.props['aria-busy'] === true);
  expect(busySwitch).toHaveLength(1);
  expect(busySwitch[0].props['aria-disabled']).toBe(true);
  fireEvent.press(screen.getByRole('switch'));
  expect(change).toHaveBeenCalledTimes(1);
});

test('list rows expose only the ARIA selection state appropriate to their role', () => {
  const screen = render(<View>
    <ListRow title="More details" onPress={jest.fn()} accessibilityState={{ expanded: true, checked: true, selected: true }} />
    <ListRow title="Events" onPress={jest.fn()} accessibilityRole="tab" accessibilityState={{ selected: true }} />
  </View>);
  const button = screen.UNSAFE_root.findAll((node: AccessibilityNode) => node.props.accessibilityRole === 'button' && node.props['aria-expanded'] === true)[0];
  expect(button.props['aria-selected']).toBeUndefined();
  expect(button.props['aria-checked']).toBeUndefined();
  expect(button.props['aria-pressed']).toBe(true);
  const tab = screen.UNSAFE_root.findAll((node: AccessibilityNode) => node.props.accessibilityRole === 'tab' && node.props['aria-selected'] === true);
  expect(tab).toHaveLength(1);
});

test('a list row disabled through native state suppresses its action and matches web state', () => {
  const action = jest.fn();
  const screen = render(<ListRow title="Save choice" onPress={action} accessibilityState={{ disabled: true, busy: true }} />);
  const row = screen.getByRole('button', { name: 'Save choice' });
  expect(row).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, busy: true }));
  expect(screen.UNSAFE_root.findAll((node: AccessibilityNode) => node.props.accessibilityRole === 'button' && node.props['aria-disabled'] === true)).toHaveLength(1);
  fireEvent.press(row);
  expect(action).not.toHaveBeenCalled();
});

test('text-field disabled and busy semantics agree with the input behavior on native and web', () => {
  const screen = render(<TextField label="Name" value="Kept draft" accessibilityState={{ disabled: true, busy: true }} />);
  const input = screen.getByLabelText('Name');
  expect(input).toHaveProp('editable', false);
  expect(input).toHaveProp('aria-disabled', true);
  expect(input).toHaveProp('aria-busy', true);
  expect(input).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, busy: true }));
});

test('a busy button exposes its named state once and hides the decorative spinner', () => {
  const screen = render(<Button title="Saving changes" loading onPress={jest.fn()} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(isHiddenFromAccessibility(screen.UNSAFE_getByType(ActivityIndicator))).toBe(true);
});

test('segments announce selection and ignore disabled and current choices', () => {
  const change = jest.fn();
  const screen = render(
    <SegmentedControl label="Schedule view" value="events" onChange={change} options={[
      { value: 'events', label: 'Church events' },
      { value: 'serving', label: 'My serving' },
      { value: 'past', label: 'Past dates', disabled: true },
    ]} />,
  );
  expect(screen.getByRole('tab', { name: 'Church events' })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  // Native Pressable folds these aliases into accessibilityState. Check its
  // inputs too: RN Web needs the explicit ARIA values to expose selection.
  const segments: { props: Record<string, unknown> }[] = screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'tab'
    && node.props['aria-selected'] !== undefined);
  expect(segments.map((segment) => segment.props['aria-selected'])).toEqual([true, false, false]);
  expect(segments.map((segment) => segment.props['aria-disabled'])).toEqual([false, false, true]);
  fireEvent.press(screen.getByRole('tab', { name: 'Church events' }));
  fireEvent.press(screen.getByRole('tab', { name: 'Past dates' }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('tab', { name: 'My serving' }));
  expect(change).toHaveBeenCalledWith('serving');
});

test('validation summary offers an explicit callback to the field needing attention', () => {
  const recover = jest.fn();
  const screen = render(<FormErrorSummary errors={[
    { key: 'name', message: 'Enter a team name.', onPress: recover },
    { key: 'date', message: 'Choose an upcoming date.' },
  ]} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Please check these details');
  fireEvent.press(screen.getByRole('button', { name: 'Enter a team name.' }));
  expect(recover).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Choose an upcoming date.')).toBeOnTheScreen();
  screen.rerender(<FormErrorSummary errors={[]} />);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('loading and error panels expose truthful state and an actionable retry', () => {
  const retry = jest.fn();
  const screen = render(<StatePanel kind="loading" title="Loading your schedule" compact />);
  expect(screen.getByRole('progressbar', { name: 'Loading your schedule' })).toHaveProp('accessibilityState', expect.objectContaining({ busy: true }));
  expect(screen.getByRole('progressbar', { name: 'Loading your schedule' })).toHaveProp('aria-busy', true);
  screen.rerender(
    <StatePanel kind="error" title="Your changes were not saved" message="Try again when you are connected." action={{ label: 'Try again', onPress: retry }} />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Your changes were not saved');
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('a full-screen error keeps its explicit heading and announces the visible explanation separately', () => {
  const screen = render(<StatePanel headingLevel={1} kind="error" title="Couldn't load this team"
    message="Check your connection and try again." />);
  expect(screen.getByRole('header', { name: "Couldn't load this team" })).toHaveProp('aria-level', 1);
  expect(screen.getByRole('alert')).toHaveTextContent('Check your connection and try again.');
  expect(screen.getByRole('alert')).toHaveProp('accessibilityLiveRegion', 'polite');
  screen.rerender(<StatePanel headingLevel={1} kind="error" title="Couldn't check access" />);
  expect(screen.getByRole('header', { name: "Couldn't check access" })).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(screen.getAllByRole('header')).toHaveLength(1);
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each([true, false])('a loading panel exposes one named progressbar and hides its decorative spinner (compact: %s)', (compact) => {
  const screen = render(<StatePanel kind="loading" title="Loading your notification settings" compact={compact} />);
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  const progress = screen.getByRole('progressbar', { name: 'Loading your notification settings' });
  expect(isHiddenFromAccessibility(progress)).toBe(false);
  // ActivityIndicator supplies its own progressbar on web even with
  // accessible=false. Its subtree must be hidden on every platform.
  expect(isHiddenFromAccessibility(screen.UNSAFE_getByType(ActivityIndicator))).toBe(true);
});
