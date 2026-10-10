import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useAuth } from '../../../lib/auth/AuthContext';
import NoOrganisationsScreen from '../NoOrganisationsScreen';
import { authState, linked } from './churchEntryFixtures';

const mockPush = jest.fn();
const mockScrollTo = jest.fn();
const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../components/Screen', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { Screen: ({ children, scrollRef }: { children: React.ReactNode; scrollRef: React.Ref<unknown> }) => {
    React.useImperativeHandle(scrollRef, () => ({ scrollTo: mockScrollTo }));
    return <View>{children}</View>;
  } };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
const mockAuth = useAuth as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); mockRedirects.length = 0; });

it('leads with invitation-based joining and keeps new-church setup secondary', () => {
  const state = authState(); mockAuth.mockReturnValue(state);
  const view = render(<NoOrganisationsScreen />);
  expect(view.getByText('Connect with your church')).toBeTruthy();
  expect(view.getByText('Join with an invitation')).toBeTruthy();
  expect(view.getByText('alex@example.com')).toBeTruthy();
  expect(view.getByText('Your account does not currently have access to a church.')).toBeTruthy();
  expect(view.queryByText(/haven’t joined|linked.*yet/)).toBeNull();
  expect(view.queryByText(/Request to join|Coming soon/)).toBeNull();
  fireEvent.press(view.getByRole('button', { name: /Set up a new church/ }));
  expect(mockPush).toHaveBeenCalledWith('/organisations/create');
  expect(state.setGlobalDisplayName).not.toHaveBeenCalled();
});

it('requires a confirmed global name before offering church creation', async () => {
  const state = authState(); state.accountContext!.account.name_confirmed_at = null;
  mockAuth.mockReturnValue(state); const view = render(<NoOrganisationsScreen />);
  expect(view.queryByText('Set up a new church')).toBeNull();
  expect(view.getByDisplayValue('Alex Member')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Save my name' }));
  await waitFor(() => expect(state.setGlobalDisplayName).toHaveBeenCalledWith('Alex Member'));
});

it('validates name inline without a write and keeps drafts through readiness changes', () => {
  const state = authState(); state.accountContext!.account.name_confirmed_at = null;
  mockAuth.mockReturnValue(state); const view = render(<NoOrganisationsScreen />);
  fireEvent.changeText(view.getByLabelText('Full name'), 'A');
  fireEvent.press(view.getByRole('button', { name: 'Save my name' }));
  expect(state.setGlobalDisplayName).not.toHaveBeenCalled();
  expect(view.getAllByText('Enter your full name (at least 2 characters).').length).toBeGreaterThan(0);
  fireEvent.changeText(view.getByLabelText('Full name'), 'Typed name');
  mockAuth.mockReturnValue({ ...state, accountStatus: 'loading' }); view.rerender(<NoOrganisationsScreen />);
  expect(view.getByText('Loading your churches…')).toBeTruthy();
  expect(view.queryByText('Connect with your church')).toBeNull();
  mockAuth.mockReturnValue(state); view.rerender(<NoOrganisationsScreen />);
  expect(view.getByDisplayValue('Typed name')).toBeTruthy();
});

it('offers name-specific recovery after an uncertain name save', async () => {
  const state = authState({ setGlobalDisplayName: jest.fn().mockRejectedValue(new Error('offline')) });
  state.accountContext!.account.name_confirmed_at = null;
  mockAuth.mockReturnValue(state); const view = render(<NoOrganisationsScreen />);
  fireEvent(view.getByTestId('account-name-form'), 'layout', { nativeEvent: { layout: { y: 600 } } });
  fireEvent.changeText(view.getByLabelText('Full name'), 'Retained name');
  fireEvent.press(view.getByRole('button', { name: 'Save my name' }));
  await waitFor(() => expect(view.getByText('Couldn’t confirm your name')).toBeTruthy());
  expect(view.getByDisplayValue('Retained name')).toBeTruthy();
  await waitFor(() => expect(mockScrollTo).toHaveBeenCalledWith({ y: 588, animated: false }));
  fireEvent.press(view.getByRole('button', { name: 'Check my account' }));
  await waitFor(() => expect(state.refreshAccountContext).toHaveBeenCalledTimes(1));
  expect(state.setGlobalDisplayName).toHaveBeenCalledTimes(1);
});

it('clears drafts and ignores the previous account’s late name failure', async () => {
  let fail!: (error: Error) => void;
  const state = authState({ setGlobalDisplayName: jest.fn(() => new Promise<void>((_resolve, reject) => { fail = reject; })) });
  state.accountContext!.account.name_confirmed_at = null;
  mockAuth.mockReturnValue(state); const view = render(<NoOrganisationsScreen />);
  fireEvent.changeText(view.getByLabelText('Full name'), 'Private name'); fireEvent.press(view.getByRole('button', { name: 'Save my name' }));
  const other = authState({ authIdentity: { ...state.authIdentity!, id: 'account-b', email: 'other@example.com' },
    accountContext: { ...state.accountContext!, account: { ...state.accountContext!.account, auth_user_id: 'account-b', global_display_name: 'Other person' } } });
  mockAuth.mockReturnValue(other); view.rerender(<NoOrganisationsScreen />);
  await act(async () => fail(new Error('old failure')));
  expect(view.queryByDisplayValue('Private name')).toBeNull();
  expect(view.queryByText('Couldn’t confirm your name')).toBeNull();
});

it('does not turn an account-read failure into a no-church state', async () => {
  const state = authState({ accountStatus: 'error', accountContext: null }); mockAuth.mockReturnValue(state);
  const view = render(<NoOrganisationsScreen />);
  expect(view.getByText('We couldn’t load your account')).toBeTruthy();
  expect(view.queryByText('Join with an invitation')).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(state.refreshAccountContext).toHaveBeenCalledTimes(1));
});

it('allows a church check and reports the still-empty result without creating anything', async () => {
  const state = authState(); mockAuth.mockReturnValue(state); const view = render(<NoOrganisationsScreen />);
  fireEvent.press(view.getByRole('button', { name: 'Check my churches' }));
  await waitFor(() => expect(view.getByText(/This account has no current church access/)).toBeTruthy());
  expect(state.createOrganisation).not.toHaveBeenCalled(); expect(state.setGlobalDisplayName).not.toHaveBeenCalled();
});

it.each(['active profile', 'invitation', 'linked churches'])('returns stale no-church routes to the routing hub for %s', (reason) => {
  let state = authState();
  if (reason === 'active profile') state = linked(state);
  if (reason === 'invitation') state.pendingInvitationToken = 'pending';
  if (reason === 'linked churches') state = { ...linked(state), user: null };
  mockAuth.mockReturnValue(state); const view = render(<NoOrganisationsScreen />);
  expect(mockRedirects).toEqual(['/']); expect(view.queryByText('Set up a new church')).toBeNull();
});

it('uses the existing sign-out abstraction and reports failure beside its retry action', async () => {
  const state = authState({ signOut: jest.fn().mockRejectedValue(new Error('offline')) }); mockAuth.mockReturnValue(state);
  const view = render(<NoOrganisationsScreen />); fireEvent.press(view.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(view.getByText('Couldn’t complete sign-out')).toBeTruthy());
  expect(state.signOut).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(state.signOut).toHaveBeenCalledTimes(2));
});
