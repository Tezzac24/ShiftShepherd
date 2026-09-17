/**
 * Plain-language messages for Supabase Auth failures on the email sign-in and
 * sign-up paths. Pure, so the mapping is unit-tested offline.
 *
 * Email-specific outcomes get their own wording instead of "check your
 * details", because the details are usually fine:
 * - `email_not_confirmed`: the account exists but its confirmation link has
 *   not been opened yet;
 * - `over_email_send_rate_limit` / `email_address_not_authorized`: the Auth
 *   email service refused to send the confirmation email (the built-in service
 *   has a low hourly limit and only sends to project team addresses until
 *   custom SMTP is configured; see docs/production-email-readiness.md);
 * - `email_address_invalid`: Auth rejected the address as unable to receive
 *   email (for example a domain with no mail server).
 */

export const OFFLINE_ERROR =
  'We couldn’t reach the server. Please check your connection and try again.';
export const GENERIC_LOGIN_ERROR =
  'We couldn’t log you in. Please check your email and password and try again.';
export const SIGN_UP_FAILED_ERROR =
  'We couldn’t create your account. Please check the details and try again.';
export const EMAIL_NOT_CONFIRMED_ERROR =
  'Please confirm your email address first. Open the link in the confirmation email we sent you, then log in.';
export const CONFIRMATION_EMAIL_UNAVAILABLE_ERROR =
  'We couldn’t send a confirmation email just now. Please try again later.';
export const EMAIL_ADDRESS_REJECTED_ERROR =
  'That email address can’t be used. Please check it and try again.';

interface AuthErrorLike {
  message?: unknown;
  code?: unknown;
}

function codeOf(error: AuthErrorLike | null | undefined): string {
  return typeof error?.code === 'string' ? error.code : '';
}

function messageOf(error: AuthErrorLike | null | undefined): string {
  return typeof error?.message === 'string' ? error.message : '';
}

function isNetworkFailure(error: AuthErrorLike | null | undefined): boolean {
  return /fetch/i.test(messageOf(error));
}

export function signInErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (isNetworkFailure(error)) return OFFLINE_ERROR;
  if (codeOf(error) === 'email_not_confirmed' || /email not confirmed/i.test(messageOf(error))) {
    return EMAIL_NOT_CONFIRMED_ERROR;
  }
  return GENERIC_LOGIN_ERROR;
}

export function signUpErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (isNetworkFailure(error)) return OFFLINE_ERROR;
  switch (codeOf(error)) {
    case 'over_email_send_rate_limit':
    case 'email_address_not_authorized':
      return CONFIRMATION_EMAIL_UNAVAILABLE_ERROR;
    case 'email_address_invalid':
      return EMAIL_ADDRESS_REJECTED_ERROR;
    default:
      return SIGN_UP_FAILED_ERROR;
  }
}
