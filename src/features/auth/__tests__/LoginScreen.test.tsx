import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useAuth } from '../../../lib/auth/AuthContext';
import LoginScreen from '../LoginScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));

const mockUseAuth = useAuth as jest.Mock;
const signUp = jest.fn();
const signIn = jest.fn();
const demo = jest.fn();
const defaults = () => ({ signInWithEmail: signIn, signUpWithEmail: signUp, signInAsTestUser: demo, supabaseEnabled: true });
const credentials = () => {
  fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
};
const signupMode = () => fireEvent.press(screen.getByRole('tab', { name: 'Create account' }));
const submit = (name = 'Sign in') => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => {
  jest.clearAllMocks();
  signUp.mockResolvedValue({ error: null, needsEmailConfirmation: false });
  signIn.mockResolvedValue(null);
  mockUseAuth.mockReturnValue(defaults());
});

it('sends only name/email/password to the existing signup action', async () => {
  render(<LoginScreen />); signupMode(); credentials();
  fireEvent.changeText(screen.getByLabelText('Full name'), 'New Person');
  submit('Create account');
  await waitFor(() => expect(signUp).toHaveBeenCalledWith('New Person', 'person@example.com', 'secret1'));
  expect(mockReplace).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled();
});

it.each([null, 'pending-invitation'])('lets Auth routing decide the destination after sign-in (invitation %s)', async (token) => {
  mockUseAuth.mockReturnValue({ ...defaults(), pendingInvitationToken: token });
  render(<LoginScreen />); credentials(); submit();
  await waitFor(() => expect(signIn).toHaveBeenCalledWith('person@example.com', 'secret1'));
  expect(mockReplace).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled();
});

it('retains supported demo access in a configured build without an auth-mode toggle', () => {
  render(<LoginScreen />);
  expect(screen.queryAllByLabelText(/^Sign in as /)).toHaveLength(0);
  fireEvent.press(screen.getByRole('button', { name: /Try a demo account/ }));
  fireEvent.press(screen.getAllByLabelText(/^Sign in as /)[0]);
  expect(demo).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

it('prioritises an ordinary-member demo choice with all existing accounts and no live signup', () => {
  mockUseAuth.mockReturnValue({ ...defaults(), supabaseEnabled: false });
  render(<LoginScreen />);
  expect(screen.queryByRole('tab', { name: 'Create account' })).toBeNull();
  expect(screen.queryByLabelText('Email')).toBeNull();
  const choices = screen.getAllByLabelText(/^Sign in as /);
  expect(choices).toHaveLength(8);
  expect(choices[0].props.accessibilityLabel).toContain('Hannah');
  fireEvent.press(choices[0]);
  expect(demo).toHaveBeenCalledWith('user-hannah');
  expect(screen.queryByText(/This build|Sees and manages everything|Team Leader/)).toBeNull();
  expect(screen.getByRole('button', { name: /Sarah.*Choir team admin/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /David.*Media team admin/ })).toBeTruthy();
});

it('keeps manual demo sign-in available in a labelled disclosure and retains its input', async () => {
  mockUseAuth.mockReturnValue({ ...defaults(), supabaseEnabled: false });
  render(<LoginScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Use a demo email instead' }));
  credentials();
  fireEvent.press(screen.getByRole('button', { name: /Use a demo email instead/ }));
  expect(screen.queryByLabelText('Email')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Use a demo email instead' }));
  expect(screen.getByDisplayValue('person@example.com')).toBeTruthy();
  expect(screen.getByDisplayValue('secret1')).toBeTruthy();
  submit(); await waitFor(() => expect(signIn).toHaveBeenCalledWith('person@example.com', 'secret1'));
});

it('validates missing fields before calling Auth and preserves typed values across mode changes', () => {
  render(<LoginScreen />); submit();
  expect(screen.getByText('Please check these details')).toBeTruthy();
  expect(signIn).not.toHaveBeenCalled();
  credentials(); signupMode();
  expect(screen.getByDisplayValue('person@example.com')).toBeTruthy();
  expect(screen.getByDisplayValue('secret1')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Full name'), 'A');
  fireEvent.changeText(screen.getByLabelText('Password'), 'short');
  submit('Create account');
  expect(signUp).not.toHaveBeenCalled();
  expect(screen.getAllByText('Use at least 6 characters for your password.').length).toBeGreaterThan(0);
});

it('shows email confirmation as information and returns to retained sign-in details', async () => {
  signUp.mockResolvedValue({ error: null, needsEmailConfirmation: true });
  render(<LoginScreen />); signupMode(); credentials();
  fireEvent.changeText(screen.getByLabelText('Full name'), 'New Person'); submit('Create account');
  await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(screen.getByText(/Check person@example.com/)).toBeTruthy();
  submit('Back to sign in');
  expect(screen.getByDisplayValue('person@example.com')).toBeTruthy();
  expect(screen.getByDisplayValue('secret1')).toBeTruthy();
  expect(signUp).toHaveBeenCalledTimes(1);
});

it('keeps service failures separate from password validation and allows retry', async () => {
  signIn.mockResolvedValueOnce('Check your email confirmation.').mockResolvedValueOnce(null);
  render(<LoginScreen />); credentials(); submit();
  await waitFor(() => expect(screen.getByText('Check your email confirmation.')).toBeTruthy());
  expect(screen.getByLabelText('Password').props.accessibilityHint).toBeUndefined();
  expect(screen.getByDisplayValue('person@example.com')).toBeTruthy();
  submit(); await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
});

it('catches an unexpected failure without losing the draft', async () => {
  signIn.mockRejectedValue(new Error('internal network detail'));
  render(<LoginScreen />); credentials(); submit();
  await waitFor(() => expect(screen.getByText(/We couldn’t complete that request/)).toBeTruthy());
  expect(screen.queryByText('internal network detail')).toBeNull();
  expect(screen.getByDisplayValue('secret1')).toBeTruthy();
});

it('prevents duplicate submit, mode changes and demo sign-in during a pending request', async () => {
  let finish!: (value: null) => void;
  signIn.mockReturnValue(new Promise<null>((resolve) => { finish = resolve; }));
  render(<LoginScreen />); credentials(); submit(); submit(); signupMode();
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Full name')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Create account' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Try a demo account/ })).toBeDisabled();
  await act(async () => finish(null));
});

it('uses keyboard/autofill hints and a labelled password visibility action', () => {
  render(<LoginScreen />);
  expect(screen.getByLabelText('Email').props.keyboardType).toBe('email-address');
  expect(screen.getByLabelText('Email').props.autoComplete).toBe('email');
  expect(screen.getByLabelText('Password').props.autoComplete).toBe('current-password');
  submit('Show password'); expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  signupMode(); expect(screen.getByLabelText('Password').props.autoComplete).toBe('new-password');
});

it('explains unavailable methods in a quiet disclosure without presenting fake provider actions', () => {
  render(<LoginScreen />);
  expect(screen.queryByText(/Google, Facebook/)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Other sign-in methods' }));
  expect(screen.getByText(/Google, Facebook and phone sign-in are not available/)).toBeTruthy();
  expect(signIn).not.toHaveBeenCalled(); expect(signUp).not.toHaveBeenCalled();
});
