import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useAuth } from '../../../lib/auth/AuthContext';
import LoginScreen from '../LoginScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, navigate: mockNavigate }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../../../components/TextField', () => {
  const React = jest.requireActual('react');
  const { TextInput } = jest.requireActual('react-native');
  return {
    TextField: ({ label, value, onChangeText, secureTextEntry }: {
      label: string;
      value: string;
      onChangeText: (value: string) => void;
      secureTextEntry?: boolean;
    }) => (
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
      />
    ),
  };
});
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));

const mockUseAuth = useAuth as jest.Mock;
const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
const mockSignInAsTestUser = jest.fn();

function expectNoNavigation() {
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue({ error: null, needsEmailConfirmation: false });
  mockSignIn.mockResolvedValue(null);
  mockUseAuth.mockReturnValue({
    signInWithEmail: mockSignIn,
    signUpWithEmail: mockSignUp,
    signInAsTestUser: mockSignInAsTestUser,
    supabaseEnabled: true,
    pendingInvitationToken: null,
  });
});

function fillCredentials() {
  fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
}

it('offers open signup and sends only name/email/password to the auth abstraction', async () => {
  render(<LoginScreen />);
  fireEvent.press(screen.getByLabelText('Create a new account'));
  fireEvent.changeText(screen.getByLabelText('Full name'), 'New Person');
  fireEvent.changeText(screen.getByLabelText('Email'), 'New@Example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
  fireEvent.press(screen.getByText('Create account'));

  await waitFor(() =>
    expect(mockSignUp).toHaveBeenCalledWith('New Person', 'New@Example.com', 'secret1'),
  );
});

/**
 * Routing after authentication belongs to the root layout's guards plus
 * app/index.tsx. A `router.replace` here used to race that transition and be
 * dispatched at a navigator that was mid-remount, which React Navigation
 * reported as "REPLACE ... was not handled by any navigator".
 */
describe('post-authentication routing', () => {
  it('dispatches no navigation after a successful sign-in', async () => {
    render(<LoginScreen />);
    fillCredentials();
    fireEvent.press(screen.getByText('Log in'));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('person@example.com', 'secret1'));
    expectNoNavigation();
  });

  it('dispatches no navigation after account creation', async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByLabelText('Create a new account'));
    fireEvent.changeText(screen.getByLabelText('Full name'), 'New Person');
    fillCredentials();
    fireEvent.press(screen.getByText('Create account'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    expectNoNavigation();
  });

  it('dispatches no navigation when an invitation is pending — index owns that redirect', async () => {
    mockUseAuth.mockReturnValue({
      signInWithEmail: mockSignIn,
      signUpWithEmail: mockSignUp,
      signInAsTestUser: mockSignInAsTestUser,
      supabaseEnabled: true,
      pendingInvitationToken: 'A'.repeat(43),
    });
    render(<LoginScreen />);
    fillCredentials();
    fireEvent.press(screen.getByText('Log in'));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expectNoNavigation();
  });

  it('dispatches no navigation after a demo account sign-in', async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getAllByLabelText(/^Log in as /)[0]);

    await waitFor(() => expect(mockSignInAsTestUser).toHaveBeenCalled());
    expectNoNavigation();
  });

  it('keeps the user on login when sign-in fails', async () => {
    mockSignIn.mockResolvedValue('We couldn’t log you in.');
    render(<LoginScreen />);
    fillCredentials();
    fireEvent.press(screen.getByText('Log in'));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expectNoNavigation();
  });
});

it('does not offer live signup in an unconfigured demo build', () => {
  mockUseAuth.mockReturnValue({
    signInWithEmail: mockSignIn,
    signUpWithEmail: mockSignUp,
    signInAsTestUser: mockSignInAsTestUser,
    supabaseEnabled: false,
    pendingInvitationToken: null,
  });
  render(<LoginScreen />);
  expect(screen.queryByLabelText('Create a new account')).toBeNull();
});
