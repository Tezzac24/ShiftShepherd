import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, darkColors } from '../../../../constants/theme';
import { AppText } from '../../../components/AppText';
import { Button } from '../../../components/Button';
import { CountBadge } from '../../../components/Badge';
import { TextField } from '../../../components/TextField';
import DisplaySettingsScreen from '../../../features/profile/DisplaySettingsScreen';
import { AppearanceProvider, DISPLAY_STORAGE_KEY, parseDisplayPreference, resolveDisplayScheme, useAppearance } from '../AppearanceContext';
import { createPaperTheme } from '../paperTheme';

let mockDeviceScheme: 'light' | 'dark' | null = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockDeviceScheme }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

function Probe() {
  const { preference, scheme, hydrated, colors } = useAppearance();
  return <View testID="theme-probe" style={{ backgroundColor: colors.background }}>
    <AppText testID="preference">{preference}</AppText><AppText testID="scheme">{scheme}</AppText>
    <AppText testID="hydrated">{String(hydrated)}</AppText>
    <Button title="Sample action" onPress={() => {}} />
    <TextField label="Sample field" /><CountBadge count={3} />
  </View>;
}
function Harness({ scope = 'one' }: { scope?: string }) {
  return <AppearanceProvider><View key={scope}><DisplaySettingsScreen /><Probe /></View></AppearanceProvider>;
}
async function mount() {
  const screen = render(<Harness />);
  await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
  return screen;
}
beforeEach(async () => {
  mockDeviceScheme = 'light';
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('unknown or corrupt saved preferences safely retain the existing light default', () => {
  for (const value of [null, '', 'unknown', '{broken', 'LIGHT']) expect(parseDisplayPreference(value)).toBe('light');
  expect(parseDisplayPreference('dark')).toBe('dark');
  expect(parseDisplayPreference('system')).toBe('system');
  expect(resolveDisplayScheme('system', null)).toBe('light');
});

test('opening Display never writes a preference', async () => {
  const screen = await mount();
  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('selecting Dark saves locally and changes existing text, fields, buttons and unread counts', async () => {
  const screen = await mount();
  fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(DISPLAY_STORAGE_KEY, 'dark'));
  expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  expect(screen.getByTestId('theme-probe')).toHaveStyle({ backgroundColor: darkColors.background });
  expect(screen.getByTestId('scheme')).toHaveStyle({ color: darkColors.text });
  expect(screen.getByLabelText('Sample field')).toHaveStyle({ backgroundColor: darkColors.surface, color: darkColors.text });
  expect(screen.getByText('Sample action')).toHaveStyle({ color: darkColors.onPrimary });
  expect(screen.getByRole('button', { name: 'Sample action' })).toHaveStyle({ backgroundColor: darkColors.primary });
  expect(screen.getByText('3')).toHaveStyle({ color: darkColors.onPrimary });
  expect(screen.getByRole('radio', { name: 'Dark' })).toHaveProp('accessibilityState', { checked: true, disabled: false });
});

test('saved dark appearance hydrates on restart and survives an account/church content remount', async () => {
  await AsyncStorage.setItem(DISPLAY_STORAGE_KEY, 'dark');
  const screen = await mount();
  screen.rerender(<Harness scope="another-church" />);
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  screen.unmount();
  const restarted = await mount();
  expect(restarted.getByTestId('scheme')).toHaveTextContent('dark');
});

test('device settings follow appearance changes; turning them off retains the currently resolved mode', async () => {
  const screen = await mount();
  fireEvent.press(screen.getByRole('switch', { name: 'Use device settings' }));
  await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('system'));
  mockDeviceScheme = 'dark';
  screen.rerender(<Harness />);
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  fireEvent.press(screen.getByRole('switch', { name: 'Use device settings' }));
  await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('dark'));
  mockDeviceScheme = 'light';
  screen.rerender(<Harness />);
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
});

test('choosing a manual appearance turns device matching off and ignores later device changes', async () => {
  await AsyncStorage.setItem(DISPLAY_STORAGE_KEY, 'system');
  mockDeviceScheme = 'dark';
  const screen = await mount();
  fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
  await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('light'));
  expect(screen.getByRole('switch', { name: 'Use device settings' })).not.toBeChecked();
  expect(screen.getByTestId('theme-probe')).toHaveStyle({ backgroundColor: colors.background });
});

test('a failed save restores the previous appearance and lets the same choice be retried', async () => {
  const screen = await mount();
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
  fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/previous appearance has been restored/));
  expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeDisabled());
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a failed read is recoverable by choosing an appearance', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
  const screen = await mount();
  expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t load/);
  fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(DISPLAY_STORAGE_KEY, 'light');
});

test('controls remain disabled during hydration and a pending save cannot be overwritten by a second tap', async () => {
  let restore!: (value: string | null) => void;
  jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise((resolve) => { restore = resolve; }));
  const screen = render(<Harness />);
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeDisabled();
  fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await act(async () => { restore(null); });
  let save!: () => void;
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => { save = resolve; }));
  fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('switch', { name: 'Use device settings' })).toHaveProp('accessibilityState', expect.objectContaining({ busy: true }));
  await act(async () => { save(); });
  expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
});

test('Paper uses matching dark surfaces and accessible foregrounds', () => {
  const paper = createPaperTheme('dark');
  expect(paper.dark).toBe(true);
  expect(paper.colors.background).toBe(darkColors.background);
  expect(paper.colors.onPrimary).toBe(darkColors.onPrimary);
  expect(StyleSheet.flatten(paper.fonts.bodyLarge)).toMatchObject({ fontSize: 17 });
});
