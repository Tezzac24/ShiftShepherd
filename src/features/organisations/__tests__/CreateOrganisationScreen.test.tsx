import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import CreateOrganisationScreen from '../CreateOrganisationScreen';
import { alpha, authState, linked, renderEntry } from './churchEntryFixtures';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

beforeEach(() => { jest.clearAllMocks(); mockCanGoBack.mockReturnValue(false); });

it('validates the existing church-name rule and does not call Auth for a short name', () => {
  const state = authState(); const view = renderEntry(<CreateOrganisationScreen />, state);
  fireEvent.changeText(view.getByLabelText('Church name'), 'A');
  fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  expect(view.getAllByText('Enter a church name (at least 2 characters).').length).toBeGreaterThan(0);
  expect(state.createOrganisation).not.toHaveBeenCalled();
});

it('submits once and completes through the routing hub after the actual subtree remount', async () => {
  let finish!: () => void;
  const state = authState({ createOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) });
  const view = renderEntry(<CreateOrganisationScreen />, state);
  fireEvent.changeText(view.getByLabelText('Church name'), 'Grace Church');
  fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  expect(state.createOrganisation).toHaveBeenCalledTimes(1);
  expect(state.createOrganisation).toHaveBeenCalledWith('Grace Church');
  view.update(linked(state, [alpha]));
  expect(view.getByText('Creating your church…')).toBeTruthy();
  expect(view.getByDisplayValue('Grace Church')).toBeTruthy();
  await act(async () => finish());
  expect(mockReplace).toHaveBeenCalledWith('/');
  expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)/home');
});

it('retains a known successful result through a same-account readiness refresh', async () => {
  const state = authState(); const view = renderEntry(<CreateOrganisationScreen />, state);
  fireEvent.changeText(view.getByLabelText('Church name'), 'Grace Church');
  fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  await waitFor(() => expect(view.getByText('Church created')).toBeTruthy());
  view.update({ ...state, accountStatus: 'loading' });
  expect(view.getByText('Church created')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
  view.update({ ...state, accountStatus: 'error' });
  expect(view.getByRole('button', { name: 'Check my churches' })).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Close' }));
  expect(mockReplace).toHaveBeenCalledWith('/');
  view.update(linked(state, [alpha]));
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

it('keeps uncertain creation and the name across remount, and checks account without a duplicate write', async () => {
  let fail!: (error: Error) => void;
  const state = authState({ createOrganisation: jest.fn(() => new Promise<void>((_resolve, reject) => { fail = reject; })) });
  const view = renderEntry(<CreateOrganisationScreen />, state);
  fireEvent.changeText(view.getByLabelText('Church name'), 'My church draft');
  fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  const savedState = linked(state, [alpha]); view.update(savedState);
  await act(async () => fail(new Error('read failure after write')));
  expect(view.getByText('Couldn’t confirm church creation')).toBeTruthy();
  expect(view.getByDisplayValue('My church draft')).toBeTruthy();
  expect(view.queryByText(/nothing was saved|no partial/i)).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Check my churches' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(state.createOrganisation).toHaveBeenCalledTimes(1);
  expect(state.refreshAccountContext).toHaveBeenCalledTimes(1);
});

it('retains a draft through same-account loading/error and offers an explicit retry after checking', async () => {
  const state = authState({ createOrganisation: jest.fn().mockRejectedValue(new Error('offline')) });
  const view = renderEntry(<CreateOrganisationScreen />, state);
  fireEvent.changeText(view.getByLabelText('Church name'), 'Retained draft');
  view.update({ ...state, accountStatus: 'loading' });
  expect(view.queryByLabelText('Church name')).toBeNull();
  view.update(state); expect(view.getByDisplayValue('Retained draft')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  await waitFor(() => expect(view.getByText('Couldn’t confirm church creation')).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Check my churches' }));
  await waitFor(() => expect(view.getByText(/No church was found/)).toBeTruthy());
  expect(state.createOrganisation).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByRole('button', { name: 'Try creating again' }));
  await waitFor(() => expect(state.createOrganisation).toHaveBeenCalledTimes(2));
});

it('fences a late creation completion and draft after an account change', async () => {
  let finish!: () => void;
  const state = authState({ createOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) });
  const view = renderEntry(<CreateOrganisationScreen />, state);
  fireEvent.changeText(view.getByLabelText('Church name'), 'Private draft'); fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  view.update(authState({ authIdentity: { ...state.authIdentity!, id: 'account-b' },
    accountContext: { ...state.accountContext!, account: { ...state.accountContext!.account, auth_user_id: 'account-b' } } }));
  await act(async () => finish());
  expect(view.queryByDisplayValue('Private draft')).toBeNull();
  expect(view.queryByText('Church created')).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('sends pending invitations through the hub and ignores later completion', async () => {
  let finish!: () => void;
  const state = authState({ createOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) });
  const view = renderEntry(<CreateOrganisationScreen />, state);
  fireEvent.changeText(view.getByLabelText('Church name'), 'Grace Church'); fireEvent.press(view.getByRole('button', { name: 'Create church' }));
  view.update({ ...state, pendingInvitationToken: 'pending-token' });
  expect(mockReplace).toHaveBeenCalledWith('/');
  await act(async () => finish());
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

it.each(['existing church', 'missing name', 'unverified email', 'demo', 'loading', 'error'])('blocks direct creation for %s without a write', (reason) => {
  let state = authState();
  if (reason === 'existing church') state = linked(state);
  if (reason === 'missing name') state.accountContext!.account.name_confirmed_at = null;
  if (reason === 'unverified email') state.authIdentity!.emailVerified = false;
  if (reason === 'demo') state.authMode = 'demo';
  if (reason === 'loading' || reason === 'error') state.accountStatus = reason;
  const view = renderEntry(<CreateOrganisationScreen />, state);
  expect(view.queryByLabelText('Church name')).toBeNull();
  expect(state.createOrganisation).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: /Back to my/ })).toBeTruthy();
});

it('offers a safe Cancel for a direct link', () => {
  const view = renderEntry(<CreateOrganisationScreen />, authState());
  fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
  expect(mockReplace).toHaveBeenCalledWith('/');
});
