import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';

import TabsLayout from '../../../app/(tabs)/_layout';
import RootLayout from '../../../app/_layout';
import { useAppData } from '../../lib/appData/AppDataContext';
import { makeTeam, makeUser } from '../../lib/appData/__tests__/presentationFixtures';
import { useAuth } from '../../lib/auth/AuthContext';
import { PageHeading } from '../PageHeading';

const mockReplace = jest.fn();
let mockRootOptions: (props: { navigation: { canGoBack: () => boolean } }) => NativeStackNavigationOptions;
let mockTabOptions: BottomTabNavigationOptions;
let mockTabScreens: Record<string, BottomTabNavigationOptions> = {};
let mockRootScreens: string[] = [];

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ replace: mockReplace }),
    usePathname: () => '/events/example',
    useGlobalSearchParams: () => ({}),
    Stack: Object.assign(({ screenOptions, children }: { screenOptions: typeof mockRootOptions; children: React.ReactNode }) => {
      mockRootOptions = screenOptions;
      return React.createElement(React.Fragment, null, children);
    }, {
      Screen: ({ name }: { name: string }) => { mockRootScreens.push(name); return null; },
      Protected: ({ guard, children }: { guard: boolean; children: React.ReactNode }) => guard ? React.createElement(React.Fragment, null, children) : null,
    }),
    Tabs: Object.assign(({ screenOptions, children }: { screenOptions: BottomTabNavigationOptions; children: React.ReactNode }) => {
      mockTabOptions = screenOptions;
      return React.createElement(React.Fragment, null, children);
    }, { Screen: ({ name, options }: { name: string; options: BottomTabNavigationOptions }) => {
      mockTabScreens[name] = options; return null;
    } }),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }) }));
jest.mock('react-native-paper', () => ({ PaperProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../../lib/theme/paperTheme', () => ({ paperTheme: {} }));
jest.mock('../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn(), AppDataProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), AuthProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../ConfirmDialog', () => ({ ConfirmProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../Toast', () => ({ ToastProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../../features/notifications/useDevicePushRegistration', () => ({ PushRegistrationProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../StartupScreen', () => ({ StartupScreen: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockTabScreens = {};
  mockRootScreens = [];
  (useAuth as jest.Mock).mockReturnValue({ user: makeUser(), authMode: 'demo', isLoading: false, isAuthenticated: true });
  (useAppData as jest.Mock).mockReturnValue({ isHydrated: true, teams: [makeTeam()], unreadByTeam: {} });
});

test('five labelled destinations retain their existing routes and Schedule replaces only the Calendar label', () => {
  render(<TabsLayout />);
  expect(Object.keys(mockTabScreens)).toEqual(['home', 'calendar', 'teams', 'messages', 'profile']);
  expect(Object.values(mockTabScreens).map((options) => options.title)).toEqual(['Home', 'Schedule', 'Teams', 'Messages', 'Profile']);
  expect(Object.values(mockTabScreens).map((options) => options.tabBarAccessibilityLabel)).toEqual(['Home', 'Schedule', 'Teams', 'Messages', 'Profile']);
});

test('primary tabs have explicit names and decorative icons are hidden on every platform', () => {
  render(<TabsLayout />);
  for (const options of Object.values(mockTabScreens)) {
    const icon = options.tabBarIcon?.({ focused: true, color: '#155C52', size: 24 });
    if (!React.isValidElement<{ accessible: boolean; 'aria-hidden': boolean; accessibilityElementsHidden: boolean; importantForAccessibility: string }>(icon)) throw new Error('Expected a tab icon.');
    expect(icon.props).toMatchObject({ accessible: false, 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
  }
});

test('the stack context title stays readable while content supplies the sole level-one heading', () => {
  render(<RootLayout />);
  const options = mockRootOptions({ navigation: { canGoBack: () => true } });
  if (typeof options.headerTitle !== 'function') throw new Error('Expected the semantic context renderer.');
  const screen = render(<>{options.headerTitle({ children: 'Member', tintColor: '#155C52' })}<PageHeading title="Church role" /></>);
  const context = screen.getByText('Member');
  expect(context).toHaveProp('allowFontScaling', true);
  expect(StyleSheet.flatten(context.props.style)).toMatchObject({ fontSize: 18, fontWeight: '700', color: '#182F2A' });
  expect(screen.getAllByRole('header')).toHaveLength(1);
  expect(screen.getByRole('header', { name: 'Church role' })).toHaveProp('aria-level', 1);
});

test('Messages retains the existing accessible-team sum, visible badge cap and uncapped reader label', () => {
  (useAppData as jest.Mock).mockReturnValue({ teams: [makeTeam(), makeTeam({ id: 'hidden-team' })], unreadByTeam: { 'team-a': 108, 'hidden-team': 50 } });
  const screen = render(<TabsLayout />);
  expect(mockTabScreens.messages.tabBarBadge).toBe('99+');
  expect(mockTabScreens.messages.tabBarAccessibilityLabel).toBe('Messages, 108 unread');
  (useAppData as jest.Mock).mockReturnValue({ teams: [makeTeam()], unreadByTeam: {} });
  screen.rerender(<TabsLayout />);
  expect(mockTabScreens.messages.tabBarBadge).toBeUndefined();
  expect(mockTabScreens.messages.tabBarAccessibilityLabel).toBe('Messages');
});

test('the tab bar includes the safe area, readable labels and space for wrapped scaled text', () => {
  render(<TabsLayout />);
  const before = StyleSheet.flatten(mockTabOptions.tabBarStyle) as ViewStyle;
  expect(before.paddingBottom).toBe(34);
  expect(before.height).toBeGreaterThanOrEqual(34 + 52);
  expect(mockTabOptions.tabBarAllowFontScaling).toBe(true);
  const label = mockTabOptions.tabBarLabel;
  if (typeof label !== 'function') throw new Error('Expected the wrapping text label.');
  const text = render(<>{label({ focused: false, color: '#155C52', position: 'below-icon', children: 'Messages' })}</>);
  const messages = text.getByText('Messages', { includeHiddenElements: true });
  expect(StyleSheet.flatten(messages.props.style).fontSize).toBe(13);
  expect(messages).toHaveProp('allowFontScaling', true);
  fireEvent(messages, 'layout', { nativeEvent: { layout: { height: 54 } } });
  expect((StyleSheet.flatten(mockTabOptions.tabBarStyle) as ViewStyle).height).toBeGreaterThan(Number(before.height));
});

test('a direct stack link has a labelled Back fallback through the auth and invitation routing hub', () => {
  render(<RootLayout />);
  const options = mockRootOptions({ navigation: { canGoBack: () => false } });
  const back = render(<>{options.headerLeft?.({ canGoBack: false })}</>);
  fireEvent.press(back.getByRole('button', { name: 'Back' }));
  expect(mockReplace).toHaveBeenCalledWith('/');
});

test('normal stack history keeps the native Back button and navigation behavior', () => {
  render(<RootLayout />);
  const options = mockRootOptions({ navigation: { canGoBack: () => true } });
  expect(options.headerLeft).toBeUndefined();
  expect(options.headerBackTitle).toBe('Back');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('header changes retain the authenticated no-organisation and invitation route guards', () => {
  (useAuth as jest.Mock).mockReturnValue({ user: null, authMode: 'supabase', isLoading: false, isAuthenticated: true });
  render(<RootLayout />);
  expect(mockRootScreens).toEqual(['index', 'invite/accept', 'no-organisations', 'organisations/create', 'organisations/select']);
});
