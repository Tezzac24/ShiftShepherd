import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useAuth } from '../../../lib/auth/AuthContext';
import LoginScreen from '../LoginScreen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
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

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue({ error: null, needsEmailConfirmation: false });
  mockUseAuth.mockReturnValue({
    signInWithEmail: jest.fn(),
    signUpWithEmail: mockSignUp,
    signInAsTestUser: jest.fn(),
    supabaseEnabled: true,
    pendingInvitationToken: null,
  });
});

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
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('returns to a preserved invitation after account creation', async () => {
  mockUseAuth.mockReturnValue({
    signInWithEmail: jest.fn(),
    signUpWithEmail: mockSignUp,
    signInAsTestUser: jest.fn(),
    supabaseEnabled: true,
    pendingInvitationToken: 'A'.repeat(43),
  });
  render(<LoginScreen />);
  fireEvent.press(screen.getByLabelText('Create a new account'));
  fireEvent.changeText(screen.getByLabelText('Full name'), 'New Person');
  fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
  fireEvent.press(screen.getByText('Create account'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/invite/accept'));
});

it('does not offer live signup in an unconfigured demo build', () => {
  mockUseAuth.mockReturnValue({
    signInWithEmail: jest.fn(),
    signUpWithEmail: mockSignUp,
    signInAsTestUser: jest.fn(),
    supabaseEnabled: false,
    pendingInvitationToken: null,
  });
  render(<LoginScreen />);
  expect(screen.queryByLabelText('Create a new account')).toBeNull();
});
