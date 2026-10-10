import { fireEvent, render } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import React from 'react';

import UnavailableRoute from '../../../../app/+not-found';

const mockReplace = jest.fn();
const mockPathname = jest.fn(() => '/old-page/private-link');
const mockSearchParams = jest.fn(() => ({ token: 'private-link-token' }));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname(),
  useLocalSearchParams: () => mockSearchParams(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

it('offers an explicit continuation through the existing auth and invitation routing hub', () => {
  const screen = render(<UnavailableRoute />);
  expect(mockReplace).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('has one scalable level-one heading and a short native context title', () => {
  const screen = render(<UnavailableRoute />);
  const heading = screen.getByRole('header', { name: 'This page is unavailable' });

  expect(screen.getAllByRole('header')).toHaveLength(1);
  expect(heading).toHaveProp('aria-level', 1);
  expect(heading).toHaveProp('allowFontScaling', true);
  expect(heading.props.numberOfLines).toBeUndefined();
  expect(screen.UNSAFE_getByType(Stack.Screen).props.options).toEqual({ title: 'Page unavailable' });
  expect(screen.getByText("We couldn't open this page. Continue to return to Shift Shepherd.")).toBeTruthy();
});

it('does not read or display the unknown path, link details or developer recovery controls', () => {
  const screen = render(<UnavailableRoute />);

  expect(mockPathname).not.toHaveBeenCalled();
  expect(mockSearchParams).not.toHaveBeenCalled();
  expect(JSON.stringify(screen.toJSON())).not.toMatch(/old-page|private-link|localhost|https?:\/\/|Unmatched Route|Sitemap/);
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
