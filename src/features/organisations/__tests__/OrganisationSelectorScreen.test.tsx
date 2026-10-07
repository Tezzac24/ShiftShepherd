import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import { resolvedActiveOrganisation } from '../../../components/OrganisationHeader';
import OrganisationSelectorScreen from '../OrganisationSelectorScreen';
import { alpha, beta, gamma, authState, linked, renderEntry } from './churchEntryFixtures';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({ useGlobalSearchParams: () => ({}), usePathname: () => '/organisations/select',
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

beforeEach(() => { jest.clearAllMocks(); mockCanGoBack.mockReturnValue(true); });
const choose = (view: ReturnType<typeof renderEntry>) => fireEvent.press(view.getByRole('button', { name: `${beta.organisation.name}. Alex Member` }));

it('shows full church names, current church and account identity with a safe Cancel', () => {
  const state = linked(authState()); const view = renderEntry(<OrganisationSelectorScreen />, state);
  expect(view.getByText(beta.organisation.name)).toBeTruthy();
  expect(view.getByText('Current church · Alex Member')).toBeTruthy();
  expect(view.getByText('alex@example.com')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(state.switchOrganisation).not.toHaveBeenCalled();
});

it('returns to a current church without switching it again', () => {
  const state = linked(authState()); const view = renderEntry(<OrganisationSelectorScreen />, state);
  fireEvent.press(view.getByRole('button', { name: 'Grace Community Church. Current church. Alex Member' }));
  expect(mockBack).toHaveBeenCalled(); expect(state.switchOrganisation).not.toHaveBeenCalled();
});

it('retains progress through the real no-profile subtree remount, ignores duplicate taps and finishes through the hub', async () => {
  let finish!: () => void;
  const state = linked(authState({ switchOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) }));
  const view = renderEntry(<OrganisationSelectorScreen />, state);
  choose(view);
  expect(state.switchOrganisation).toHaveBeenCalledTimes(1);
  expect(state.switchOrganisation).toHaveBeenCalledWith(beta.profile.id);
  view.update({ ...state, user: null });
  expect(view.getByText('Switching church…')).toBeTruthy();
  expect(view.queryByText('Current church · Alex Member')).toBeNull();
  expect(view.queryByText('No church access')).toBeNull();
  view.update(linked(state, [alpha, beta], beta));
  expect(view.getByText('Switching church…')).toBeTruthy();
  await act(async () => finish());
  expect(mockReplace).toHaveBeenCalledWith('/');
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

it('retains switch failure after remount and checks account without issuing another switch', async () => {
  let fail!: (error: Error) => void;
  const state = linked(authState({ switchOrganisation: jest.fn(() => new Promise<void>((_resolve, reject) => { fail = reject; })) }));
  const view = renderEntry(<OrganisationSelectorScreen />, state); choose(view);
  view.update({ ...state, user: null });
  await act(async () => fail(new Error('offline')));
  expect(view.getByText('Couldn’t confirm the switch')).toBeTruthy();
  expect(view.queryByText('Current church · Alex Member')).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Check my churches' }));
  await waitFor(() => expect(state.refreshAccountContext).toHaveBeenCalledTimes(1));
  view.update(linked(state, [alpha, beta], beta));
  expect(mockReplace).toHaveBeenCalledWith('/');
  expect(state.switchOrganisation).toHaveBeenCalledTimes(1);
});

it('reports a failed recovery, then allows choosing again when a checked account still has the original church', async () => {
  const state = linked(authState({ switchOrganisation: jest.fn().mockRejectedValue(new Error('offline')),
    refreshAccountContext: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined) }));
  const view = renderEntry(<OrganisationSelectorScreen />, state); choose(view);
  await waitFor(() => expect(view.getByText('Couldn’t confirm the switch')).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Check my churches' }));
  await waitFor(() => expect(view.getByText(/We couldn’t check your churches/)).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Check my churches' }));
  await waitFor(() => expect(view.getByText('Current church · Alex Member')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
  choose(view); await waitFor(() => expect(state.switchOrganisation).toHaveBeenCalledTimes(2));
});

it.each(['account', 'mode', 'unrelated profile', 'sign-out'])('fences a late switch result after %s changes', async (change) => {
  let finish!: () => void;
  const state = linked(authState({ switchOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) }));
  const view = renderEntry(<OrganisationSelectorScreen />, state); choose(view);
  if (change === 'account') view.update({ ...state, authIdentity: { ...state.authIdentity!, id: 'account-b' }, accountContext: null, user: null });
  if (change === 'mode') view.update({ ...state, authMode: 'demo' });
  if (change === 'sign-out') view.update({ ...state, authMode: null, authIdentity: null, isAuthenticated: false, user: null });
  if (change === 'unrelated profile') view.update(linked(state, [alpha, beta, gamma], gamma));
  await act(async () => finish());
  expect(mockReplace).not.toHaveBeenCalled();
  expect(view.queryByText('Switching church…')).toBeNull();
});

it('rejects a return to the old profile after reaching the requested target while completion is pending', async () => {
  let finish!: () => void;
  const state = linked(authState({ switchOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) }));
  const view = renderEntry(<OrganisationSelectorScreen />, state); choose(view);
  view.update(linked(state, [alpha, beta], beta));
  view.update(state);
  await act(async () => finish());
  expect(mockReplace).not.toHaveBeenCalled();
});

it('does not navigate after the mounted screen is left while a switch is pending', async () => {
  let finish!: () => void;
  const state = linked(authState({ switchOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) }));
  const view = renderEntry(<OrganisationSelectorScreen />, state); choose(view); view.unmount();
  await act(async () => finish()); expect(mockReplace).not.toHaveBeenCalled();
});

it('preserves pending-invitation precedence and fences the later switch completion', async () => {
  let finish!: () => void;
  const state = linked(authState({ switchOrganisation: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) }));
  const view = renderEntry(<OrganisationSelectorScreen />, state); choose(view);
  view.update({ ...state, pendingInvitationToken: 'invitation' });
  expect(mockReplace).toHaveBeenCalledWith('/');
  await act(async () => finish()); expect(mockReplace).toHaveBeenCalledTimes(1);
});

it('distinguishes failed and unresolved account reads from a genuine no-church account', async () => {
  const state = authState({ accountStatus: 'error', accountContext: null });
  const view = renderEntry(<OrganisationSelectorScreen />, state);
  expect(view.getByText('We couldn’t load your account')).toBeTruthy();
  expect(view.queryByText('No church access')).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(state.refreshAccountContext).toHaveBeenCalled());
  view.update({ ...state, accountStatus: 'loading' });
  expect(view.getByText('Loading your churches…')).toBeTruthy();
  view.update(authState()); expect(view.getByText('No church access')).toBeTruthy();
});

it('omits a Back action that would return to the same mandatory picker while retaining sign-out', () => {
  const state = linked(authState());
  state.user = null; state.accountContext!.account.active_profile_id = null;
  const view = renderEntry(<OrganisationSelectorScreen />, state);
  expect(view.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(view.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  expect(view.getByText(beta.organisation.name)).toBeTruthy();
});

it('uses a safe hub exit for a direct link without history', () => {
  mockCanGoBack.mockReturnValue(false);
  const view = renderEntry(<OrganisationSelectorScreen />, linked(authState()));
  fireEvent.press(view.getByRole('button', { name: 'Back' })); expect(mockReplace).toHaveBeenCalledWith('/');
});

it('uses the existing header resolver for confirmed live scope only', () => {
  const state = linked(authState());
  expect(resolvedActiveOrganisation(state)).toEqual(alpha);
  expect(resolvedActiveOrganisation({ ...state, user: null })).toBeUndefined();
  expect(resolvedActiveOrganisation({ ...state, accountContext: null })).toBeUndefined();
  expect(resolvedActiveOrganisation({ ...state, authMode: 'demo' })).toBeUndefined();
  expect(resolvedActiveOrganisation({ ...state, user: { ...state.user!, profile: { ...state.user!.profile, id: beta.profile.id } } })).toBeUndefined();
  expect(resolvedActiveOrganisation({ ...state, user: { ...state.user!, profile: { ...state.user!.profile, organisation_id: 'wrong-org' } } })).toBeUndefined();
});
