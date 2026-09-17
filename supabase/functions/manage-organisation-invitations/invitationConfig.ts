/**
 * Invitation email configuration and invitation link building.
 *
 * Pure: no Deno globals, no network, and no imports, so the app's Jest suite
 * imports this file directly. The Edge Function validates its three runtime
 * secrets with `readInvitationEmailConfig` before any invitation row is issued
 * or superseded, so a missing or malformed secret fails fast with one bounded
 * error and never leaves a pending invitation that was not emailed.
 *
 * Results carry only fixed problem and notice codes. A secret value is never
 * copied into a result, so every result is safe to log.
 *
 * Supported `INVITATION_APP_BASE_URL` shapes:
 * - `https://host` or `https://host/base-path` (production; any path prefix is
 *   kept and `/invite/accept` is appended once);
 * - the app scheme root `shiftshepherd://` (development builds only);
 * - `http://localhost`, `http://127.0.0.1`, or `http://[::1]` with an optional
 *   port and path (local web development only).
 * Anything else, including a query, fragment, or credentials, is rejected.
 */

export const INVITATION_ENV_NAMES = {
  resendApiKey: 'RESEND_API_KEY',
  fromEmail: 'INVITATION_FROM_EMAIL',
  appBaseUrl: 'INVITATION_APP_BASE_URL',
} as const;

/** The app's registered deep-link scheme (`expo.scheme` in app.json). */
export const APP_LINK_SCHEME = 'shiftshepherd';

/** The app route that opens an invitation, appended to the configured base. */
export const INVITATION_ACCEPT_PATH = '/invite/accept';

/** Resend's shared testing domain; it delivers only to the Resend account owner. */
export const RESEND_TEST_SENDER_DOMAIN = 'resend.dev';

export type InvitationConfigProblem =
  | 'RESEND_API_KEY_MISSING'
  | 'RESEND_API_KEY_MALFORMED'
  | 'INVITATION_FROM_EMAIL_MISSING'
  | 'INVITATION_FROM_EMAIL_MALFORMED'
  | 'INVITATION_APP_BASE_URL_MISSING'
  | 'INVITATION_APP_BASE_URL_MALFORMED'
  | 'INVITATION_APP_BASE_URL_UNSUPPORTED';

/** Configuration that works but is not production-ready; logged as a warning. */
export type InvitationConfigNotice =
  | 'INVITATION_FROM_EMAIL_IS_RESEND_TEST_SENDER'
  | 'INVITATION_APP_BASE_URL_NOT_HTTPS';

export type InvitationLinkKind = 'https' | 'app_scheme' | 'loopback_http';

export interface InvitationLinkBase {
  kind: InvitationLinkKind;
  /** Origin plus base path with no trailing slash, or `shiftshepherd://`. */
  prefix: string;
}

export interface InvitationEmailConfig {
  resendApiKey: string;
  /** Trimmed sender: `address@domain` or `Display Name <address@domain>`. */
  from: string;
  linkBase: InvitationLinkBase;
  notices: InvitationConfigNotice[];
}

export type InvitationConfigResult =
  | { ok: true; config: InvitationEmailConfig }
  | { ok: false; problems: InvitationConfigProblem[] };

export type InvitationLinkBaseResult =
  | { ok: true; base: InvitationLinkBase }
  | {
      ok: false;
      problem: 'INVITATION_APP_BASE_URL_MALFORMED' | 'INVITATION_APP_BASE_URL_UNSUPPORTED';
    };

/** Printable ASCII without spaces: safe inside an HTTP Authorization header. */
const HEADER_SAFE_VALUE = /^[\x21-\x7E]+$/;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const WHITESPACE = /\s/;
const MAILBOX = /^[^\s@<>]+@([^\s@<>]+\.[^\s@<>]+)$/;
const NAMED_MAILBOX = /^([^<>]*)<([^<>]*)>$/;
const APP_SCHEME_ROOT = new RegExp(`^${APP_LINK_SCHEME}:\\/\\/\\/?$`, 'i');
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Mirrors the function's raw-token format: 32 random bytes, base64url. */
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{40,200}$/;

function presentValue(
  getEnv: (name: string) => string | undefined,
  name: string,
): string | null {
  const value = getEnv(name);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Returns the lower-cased sender domain, or null when the value is not a
 * single `address@domain` or `Display Name <address@domain>` mailbox.
 */
export function parseSenderDomain(from: string): string | null {
  if (CONTROL_CHARACTER.test(from)) return null;
  const named = NAMED_MAILBOX.exec(from);
  const mailbox = named ? named[2].trim() : from;
  const match = MAILBOX.exec(mailbox);
  return match ? match[1].toLowerCase() : null;
}

/** Validates and normalises `INVITATION_APP_BASE_URL` (already trimmed). */
export function parseInvitationLinkBase(value: string): InvitationLinkBaseResult {
  if (CONTROL_CHARACTER.test(value) || WHITESPACE.test(value)) {
    return { ok: false, problem: 'INVITATION_APP_BASE_URL_MALFORMED' };
  }
  if (APP_SCHEME_ROOT.test(value)) {
    return { ok: true, base: { kind: 'app_scheme', prefix: `${APP_LINK_SCHEME}://` } };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, problem: 'INVITATION_APP_BASE_URL_MALFORMED' };
  }

  let kind: InvitationLinkKind;
  if (url.protocol === 'https:') {
    kind = 'https';
  } else if (url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)) {
    kind = 'loopback_http';
  } else {
    // Includes the app scheme with a host or path: the app routes only
    // `/invite/accept` from the scheme root.
    return { ok: false, problem: 'INVITATION_APP_BASE_URL_UNSUPPORTED' };
  }

  if (url.username || url.password || url.search || url.hash) {
    return { ok: false, problem: 'INVITATION_APP_BASE_URL_MALFORMED' };
  }
  const basePath = url.pathname.replace(/\/+$/, '');
  if (basePath.includes('//')) {
    return { ok: false, problem: 'INVITATION_APP_BASE_URL_MALFORMED' };
  }
  // Built from protocol and host rather than `origin` and lower-cased
  // explicitly, so every WHATWG URL implementation yields the same prefix.
  const host = url.host.toLowerCase();
  return { ok: true, base: { kind, prefix: `${url.protocol}//${host}${basePath}` } };
}

/**
 * Reads and validates the invitation email secrets through `getEnv`
 * (`Deno.env.get` in the Edge Function). Every problem is reported at once.
 */
export function readInvitationEmailConfig(
  getEnv: (name: string) => string | undefined,
): InvitationConfigResult {
  const problems: InvitationConfigProblem[] = [];
  const notices: InvitationConfigNotice[] = [];

  const resendApiKey = presentValue(getEnv, INVITATION_ENV_NAMES.resendApiKey);
  if (!resendApiKey) problems.push('RESEND_API_KEY_MISSING');
  else if (!HEADER_SAFE_VALUE.test(resendApiKey)) problems.push('RESEND_API_KEY_MALFORMED');

  const from = presentValue(getEnv, INVITATION_ENV_NAMES.fromEmail);
  if (!from) {
    problems.push('INVITATION_FROM_EMAIL_MISSING');
  } else {
    const senderDomain = parseSenderDomain(from);
    if (!senderDomain) problems.push('INVITATION_FROM_EMAIL_MALFORMED');
    else if (senderDomain === RESEND_TEST_SENDER_DOMAIN) {
      notices.push('INVITATION_FROM_EMAIL_IS_RESEND_TEST_SENDER');
    }
  }

  const baseValue = presentValue(getEnv, INVITATION_ENV_NAMES.appBaseUrl);
  let linkBase: InvitationLinkBase | null = null;
  if (!baseValue) {
    problems.push('INVITATION_APP_BASE_URL_MISSING');
  } else {
    const parsed = parseInvitationLinkBase(baseValue);
    if (parsed.ok) {
      linkBase = parsed.base;
      if (parsed.base.kind !== 'https') notices.push('INVITATION_APP_BASE_URL_NOT_HTTPS');
    } else {
      problems.push(parsed.problem);
    }
  }

  if (problems.length > 0 || !resendApiKey || !from || !linkBase) {
    return { ok: false, problems };
  }
  return { ok: true, config: { resendApiKey, from, linkBase, notices } };
}

/**
 * Builds `<base>/invite/accept?token=<raw token>`. The token is base64url, so
 * it needs no encoding; anything else is refused rather than emailed.
 */
export function buildInvitationUrl(base: InvitationLinkBase, rawToken: string): string {
  if (!INVITATION_TOKEN.test(rawToken)) throw new Error('INVITATION_LINK_UNAVAILABLE');
  return `${base.prefix}${INVITATION_ACCEPT_PATH}?token=${rawToken}`;
}
