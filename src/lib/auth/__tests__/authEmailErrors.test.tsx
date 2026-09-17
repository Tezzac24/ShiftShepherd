/**
 * Email-specific Supabase Auth failures on the sign-in and sign-up paths.
 *
 * An unconfirmed email, a refused or rate-limited confirmation email, and an
 * address Auth rejects must not be reported as "check your details". The
 * mapping is pure; the AuthProvider tests prove the live email paths use it.
 * Supabase is mocked: nothing here signs anyone up or sends an email.
 */
import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '../AuthContext';
import {
  CONFIRMATION_EMAIL_UNAVAILABLE_ERROR,
  EMAIL_ADDRESS_REJECTED_ERROR,
  EMAIL_NOT_CONFIRMED_ERROR,
  GENERIC_LOGIN_ERROR,
  OFFLINE_ERROR,
  SIGN_UP_FAILED_ERROR,
  signInErrorMessage,
  signUpErrorMessage,
} from '../authEmailErrors';

const signInWithPasswordMock = jest.fn();
const signUpMock = jest.fn();
const mockSupabase = {
  auth: {
    signOut: jest.fn(async () => ({ error: null })),
    getSession: jest.fn(async () => ({ data: { session: null } })),
    getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
    signInWithPassword: signInWithPasswordMock,
    signUp: signUpMock,
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  },
};

jest.mock('../../supabase/client', () => ({
  getSupabase: () => mockSupabase,
  isSupabaseConfigured: true,
}));

const mockSetGlobalDisplayName = jest.fn();
jest.mock('../../supabase/services/accounts', () => ({
  fetchAccountContext: jest.fn(),
  switchActiveProfile: jest.fn(),
  setGlobalDisplayName: (...args: unknown[]) => mockSetGlobalDisplayName(...args),
  setOrganisationDisplayNameOverride: jest.fn(),
  setProfileDisplayNames: jest.fn(),
  createOrganisation: jest.fn(),
}));

jest.mock('../../supabase/services/organisationMemberships', () => ({
  leaveOrganisation: jest.fn(),
}));

function authError(code: string, message: string, status = 400) {
  return { name: 'AuthApiError', status, code, message };
}

describe('signInErrorMessage', () => {
  it('asks for email confirmation instead of blaming the password', () => {
    expect(signInErrorMessage(authError('email_not_confirmed', 'Email not confirmed'))).toBe(
      EMAIL_NOT_CONFIRMED_ERROR,
    );
    // Older Auth responses carry only the message.
    expect(signInErrorMessage({ message: 'Email not confirmed' })).toBe(EMAIL_NOT_CONFIRMED_ERROR);
  });

  it('keeps the generic and offline messages for everything else', () => {
    expect(
      signInErrorMessage(authError('invalid_credentials', 'Invalid login credentials')),
    ).toBe(GENERIC_LOGIN_ERROR);
    expect(signInErrorMessage({ message: 'TypeError: Failed to fetch' })).toBe(OFFLINE_ERROR);
    expect(signInErrorMessage(null)).toBe(GENERIC_LOGIN_ERROR);
  });
});

describe('signUpErrorMessage', () => {
  it.each([
    ['over_email_send_rate_limit', 'email rate limit exceeded', 429],
    ['email_address_not_authorized', 'Email address "a@b.example" cannot be used as it is not authorized', 400],
  ])('explains that the confirmation email could not be sent (%s)', (code, message, status) => {
    expect(signUpErrorMessage(authError(code, message, status))).toBe(
      CONFIRMATION_EMAIL_UNAVAILABLE_ERROR,
    );
  });

  it('explains an address Auth rejects as unable to receive email', () => {
    expect(
      signUpErrorMessage(authError('email_address_invalid', 'Email address "a@b.test" is invalid')),
    ).toBe(EMAIL_ADDRESS_REJECTED_ERROR);
  });

  it('keeps the existing messages for other and network failures', () => {
    expect(signUpErrorMessage(authError('weak_password', 'Password is too weak', 422))).toBe(
      SIGN_UP_FAILED_ERROR,
    );
    expect(signUpErrorMessage({ message: 'Failed to fetch' })).toBe(OFFLINE_ERROR);
    expect(signUpErrorMessage(undefined)).toBe(SIGN_UP_FAILED_ERROR);
  });

  it('never repeats the address or provider text back to the user', () => {
    const shown = signUpErrorMessage(
      authError('email_address_not_authorized', 'Email address "private@grace.example" cannot be used'),
    );
    expect(shown).not.toContain('private@grace.example');
  });
});

describe('AuthProvider email paths', () => {
  let auth: ReturnType<typeof useAuth>;
  function Probe() {
    auth = useAuth();
    return <Text>{auth.accountStatus}</Text>;
  }

  async function renderAuth() {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(auth.isLoading).toBe(false));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  });

  it('returns the confirmation guidance when signing in before confirming', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null, session: null },
      error: authError('email_not_confirmed', 'Email not confirmed'),
    });
    await renderAuth();

    let result: string | null = null;
    await act(async () => {
      result = await auth.signInWithEmail(' New.Member@Grace.example ', 'secret123');
    });
    expect(result).toBe(EMAIL_NOT_CONFIRMED_ERROR);
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'new.member@grace.example',
      password: 'secret123',
    });
    expect(auth.isAuthenticated).toBe(false);
  });

  it('returns the email-service message when the confirmation email is rate-limited', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: authError('over_email_send_rate_limit', 'email rate limit exceeded', 429),
    });
    await renderAuth();

    let result: Awaited<ReturnType<typeof auth.signUpWithEmail>> | null = null;
    await act(async () => {
      result = await auth.signUpWithEmail('New Member', 'new.member@grace.example', 'secret123');
    });
    expect(result).toEqual({
      error: CONFIRMATION_EMAIL_UNAVAILABLE_ERROR,
      needsEmailConfirmation: false,
    });
    expect(mockSetGlobalDisplayName).not.toHaveBeenCalled();
  });

  it('still reports a pending confirmation when signup succeeds without a session', async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: 'auth-new', email: 'new.member@grace.example' }, session: null },
      error: null,
    });
    await renderAuth();

    let result: Awaited<ReturnType<typeof auth.signUpWithEmail>> | null = null;
    await act(async () => {
      result = await auth.signUpWithEmail('New Member', 'new.member@grace.example', 'secret123');
    });
    expect(result).toEqual({ error: null, needsEmailConfirmation: true });
    expect(signUpMock).toHaveBeenCalledWith({
      email: 'new.member@grace.example',
      password: 'secret123',
      options: { data: { full_name: 'New Member' } },
    });
  });
});
