/**
 * Invitation email configuration and link building for the
 * manage-organisation-invitations Edge Function.
 *
 * `invitationConfig.ts` has no Deno globals, network, or imports, so it is
 * imported straight from supabase/functions and exercised offline. These tests
 * pin secret validation (missing, malformed, test sender), the supported link
 * base shapes, link construction for the app scheme and https bases, that the
 * app's router accepts the links the function builds, and that the email
 * shows the link as a copyable fallback.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractExpoPathFromURL } from 'expo-router/build/fork/extractPathFromURL';

import {
  APP_LINK_SCHEME,
  buildInvitationUrl,
  INVITATION_ACCEPT_PATH,
  INVITATION_ENV_NAMES,
  parseInvitationLinkBase,
  parseSenderDomain,
  readInvitationEmailConfig,
  type InvitationLinkBase,
} from '../../../../../supabase/functions/manage-organisation-invitations/invitationConfig';
import { buildInvitationEmail } from '../../../../../supabase/functions/manage-organisation-invitations/invitationEmail';
import { isInvitationToken } from '../../../invitations/pendingInvitation';

/** A realistic raw token: 32 random bytes as unpadded base64url (43 chars). */
const TOKEN = 'q3_Zr-8vK1mN0pQ2sT4uW6xY8zA0bC2dE4fG6hJ8kL0';
const API_KEY = 're_test_value_not_a_real_key';
const VERIFIED_SENDER = 'Shift Shepherd <invites@mail.shiftshepherd.example>';
const HTTPS_BASE = 'https://app.shiftshepherd.example';

function env(values: Partial<Record<string, string>>) {
  return (name: string) => values[name];
}

function productionEnv(overrides: Partial<Record<string, string>> = {}) {
  return env({
    RESEND_API_KEY: API_KEY,
    INVITATION_FROM_EMAIL: VERIFIED_SENDER,
    INVITATION_APP_BASE_URL: HTTPS_BASE,
    ...overrides,
  });
}

/** The builder deployed before this change, kept to prove root links are unchanged. */
function previousBuilder(base: string, token: string): string {
  const url = new URL('/invite/accept', base);
  url.searchParams.set('token', token);
  return url.toString();
}

function baseFor(value: string): InvitationLinkBase {
  const parsed = parseInvitationLinkBase(value);
  if (!parsed.ok) throw new Error(`expected a supported base: ${value}`);
  return parsed.base;
}

describe('readInvitationEmailConfig', () => {
  it('reads exactly the three documented secret names', () => {
    expect(INVITATION_ENV_NAMES).toEqual({
      resendApiKey: 'RESEND_API_KEY',
      fromEmail: 'INVITATION_FROM_EMAIL',
      appBaseUrl: 'INVITATION_APP_BASE_URL',
    });
    const requested: string[] = [];
    readInvitationEmailConfig((name) => {
      requested.push(name);
      return undefined;
    });
    expect(requested.sort()).toEqual(
      ['INVITATION_APP_BASE_URL', 'INVITATION_FROM_EMAIL', 'RESEND_API_KEY'],
    );
  });

  it('accepts a verified-domain sender and an https base with no notices', () => {
    const result = readInvitationEmailConfig(productionEnv());
    expect(result).toEqual({
      ok: true,
      config: {
        resendApiKey: API_KEY,
        from: VERIFIED_SENDER,
        linkBase: { kind: 'https', prefix: HTTPS_BASE },
        notices: [],
      },
    });
  });

  it('accepts the current development shape but flags it as not production-ready', () => {
    const result = readInvitationEmailConfig(
      env({
        RESEND_API_KEY: API_KEY,
        INVITATION_FROM_EMAIL: 'onboarding@resend.dev',
        INVITATION_APP_BASE_URL: 'shiftshepherd://',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.linkBase).toEqual({ kind: 'app_scheme', prefix: 'shiftshepherd://' });
    expect(result.config.notices).toEqual([
      'INVITATION_FROM_EMAIL_IS_RESEND_TEST_SENDER',
      'INVITATION_APP_BASE_URL_NOT_HTTPS',
    ]);
  });

  it('trims surrounding whitespace, including a trailing newline from a pasted secret', () => {
    const result = readInvitationEmailConfig(
      productionEnv({
        RESEND_API_KEY: `  ${API_KEY}\n`,
        INVITATION_FROM_EMAIL: ` ${VERIFIED_SENDER} `,
        INVITATION_APP_BASE_URL: `${HTTPS_BASE}/\n`,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      config: { resendApiKey: API_KEY, from: VERIFIED_SENDER, linkBase: { prefix: HTTPS_BASE } },
    });
  });

  it('reports every missing or blank secret at once', () => {
    expect(readInvitationEmailConfig(env({}))).toEqual({
      ok: false,
      problems: [
        'RESEND_API_KEY_MISSING',
        'INVITATION_FROM_EMAIL_MISSING',
        'INVITATION_APP_BASE_URL_MISSING',
      ],
    });
    expect(
      readInvitationEmailConfig(
        env({ RESEND_API_KEY: '   ', INVITATION_FROM_EMAIL: '\n', INVITATION_APP_BASE_URL: '' }),
      ),
    ).toEqual({
      ok: false,
      problems: [
        'RESEND_API_KEY_MISSING',
        'INVITATION_FROM_EMAIL_MISSING',
        'INVITATION_APP_BASE_URL_MISSING',
      ],
    });
  });

  it.each([
    ['an inner space', 're_abc def'],
    ['an inner newline', 're_abc\ndef'],
    ['a tab', 're_abc\tdef'],
    ['non-ASCII text', 're_abcé'],
  ])('rejects an API key containing %s', (_label, key) => {
    expect(readInvitationEmailConfig(productionEnv({ RESEND_API_KEY: key }))).toEqual({
      ok: false,
      problems: ['RESEND_API_KEY_MALFORMED'],
    });
  });

  it.each([
    'invites',
    'invites@',
    '@shiftshepherd.example',
    'invites@localhost',
    'Shift Shepherd invites@mail.shiftshepherd.example',
    'Shift Shepherd <invites@mail.shiftshepherd.example',
    'Shift Shepherd <invites@mail.shiftshepherd.example> extra',
    '<>',
    'invites@mail.shiftshepherd.example\r\nBcc: someone@else.example',
    'first@one.example, second@two.example',
  ])('rejects the malformed sender %j', (from) => {
    expect(readInvitationEmailConfig(productionEnv({ INVITATION_FROM_EMAIL: from }))).toEqual({
      ok: false,
      problems: ['INVITATION_FROM_EMAIL_MALFORMED'],
    });
  });

  it('accepts plain, named, quoted, and bracket-only sender forms', () => {
    expect(parseSenderDomain('invites@mail.shiftshepherd.example')).toBe('mail.shiftshepherd.example');
    expect(parseSenderDomain('Shift Shepherd <invites@Mail.ShiftShepherd.Example>')).toBe(
      'mail.shiftshepherd.example',
    );
    expect(parseSenderDomain('"Grace Church via Shift Shepherd" <invites@mail.shiftshepherd.example>')).toBe(
      'mail.shiftshepherd.example',
    );
    expect(parseSenderDomain('<invites@mail.shiftshepherd.example>')).toBe('mail.shiftshepherd.example');
  });

  it('flags only the Resend testing domain as the test sender', () => {
    const noticesFor = (from: string) => {
      const result = readInvitationEmailConfig(productionEnv({ INVITATION_FROM_EMAIL: from }));
      return result.ok ? result.config.notices : result.problems;
    };
    expect(noticesFor('ONBOARDING@RESEND.DEV')).toEqual(['INVITATION_FROM_EMAIL_IS_RESEND_TEST_SENDER']);
    expect(noticesFor('Acme <onboarding@resend.dev>')).toEqual([
      'INVITATION_FROM_EMAIL_IS_RESEND_TEST_SENDER',
    ]);
    expect(noticesFor('invites@notresend.dev')).toEqual([]);
    expect(noticesFor('invites@resend.dev.shiftshepherd.example')).toEqual([]);
  });

  it('reports problems in every secret together without echoing any value', () => {
    const secretKey = 're_secret value';
    const secretBase = 'ftp://files.shiftshepherd.example/private';
    const result = readInvitationEmailConfig(
      env({ RESEND_API_KEY: secretKey, INVITATION_APP_BASE_URL: secretBase }),
    );
    expect(result).toEqual({
      ok: false,
      problems: [
        'RESEND_API_KEY_MALFORMED',
        'INVITATION_FROM_EMAIL_MISSING',
        'INVITATION_APP_BASE_URL_UNSUPPORTED',
      ],
    });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('secret');
    expect(serialised).not.toContain('files.shiftshepherd.example');
  });
});

describe('parseInvitationLinkBase', () => {
  it.each([
    ['shiftshepherd://', 'app_scheme', 'shiftshepherd://'],
    ['shiftshepherd:///', 'app_scheme', 'shiftshepherd://'],
    ['ShiftShepherd://', 'app_scheme', 'shiftshepherd://'],
    ['https://app.shiftshepherd.example', 'https', 'https://app.shiftshepherd.example'],
    ['https://app.shiftshepherd.example/', 'https', 'https://app.shiftshepherd.example'],
    ['https://app.shiftshepherd.example//', 'https', 'https://app.shiftshepherd.example'],
    ['https://App.ShiftShepherd.Example:443/', 'https', 'https://app.shiftshepherd.example'],
    ['https://app.shiftshepherd.example:8443', 'https', 'https://app.shiftshepherd.example:8443'],
    ['https://www.grace.example/shift-shepherd', 'https', 'https://www.grace.example/shift-shepherd'],
    ['https://www.grace.example/shift-shepherd/', 'https', 'https://www.grace.example/shift-shepherd'],
    ['http://localhost:8081', 'loopback_http', 'http://localhost:8081'],
    ['http://127.0.0.1:3000/', 'loopback_http', 'http://127.0.0.1:3000'],
    ['http://[::1]:3000/web', 'loopback_http', 'http://[::1]:3000/web'],
  ])('accepts %s as %s', (value, kind, prefix) => {
    expect(parseInvitationLinkBase(value)).toEqual({ ok: true, base: { kind, prefix } });
  });

  it.each([
    'shiftshepherd://invite',
    'shiftshepherd://invite/accept',
    'shiftshepherd:///app',
    'http://192.168.1.20:8081',
    'http://app.shiftshepherd.example',
    'exp://192.168.1.20:8081/--',
    'ftp://app.shiftshepherd.example',
    'javascript:alert(1)',
    'mailto:invites@shiftshepherd.example',
  ])('refuses the unsupported base %s', (value) => {
    expect(parseInvitationLinkBase(value)).toEqual({
      ok: false,
      problem: 'INVITATION_APP_BASE_URL_UNSUPPORTED',
    });
  });

  it.each([
    'app.shiftshepherd.example',
    'https://',
    'not a url',
    'https://app.shiftshepherd.example/a b',
    'https://app.shiftshepherd.example/?ref=email',
    'https://app.shiftshepherd.example/#invite',
    'https://user:pass@app.shiftshepherd.example',
    'https://app.shiftshepherd.example/base//path',
  ])('refuses the malformed base %s', (value) => {
    expect(parseInvitationLinkBase(value)).toEqual({
      ok: false,
      problem: 'INVITATION_APP_BASE_URL_MALFORMED',
    });
  });
});

describe('buildInvitationUrl', () => {
  it('builds the app scheme link the deployed function already sends', () => {
    expect(buildInvitationUrl(baseFor('shiftshepherd://'), TOKEN)).toBe(
      `shiftshepherd:///invite/accept?token=${TOKEN}`,
    );
  });

  it('builds https links at the root and under a base path', () => {
    expect(buildInvitationUrl(baseFor(HTTPS_BASE), TOKEN)).toBe(
      `https://app.shiftshepherd.example/invite/accept?token=${TOKEN}`,
    );
    expect(buildInvitationUrl(baseFor('https://www.grace.example/shift-shepherd/'), TOKEN)).toBe(
      `https://www.grace.example/shift-shepherd/invite/accept?token=${TOKEN}`,
    );
    expect(buildInvitationUrl(baseFor('http://localhost:8081'), TOKEN)).toBe(
      `http://localhost:8081/invite/accept?token=${TOKEN}`,
    );
  });

  it('keeps root links byte-identical to the previous builder', () => {
    for (const base of [
      'shiftshepherd://',
      'shiftshepherd:///',
      HTTPS_BASE,
      `${HTTPS_BASE}/`,
      'http://localhost:8081',
    ]) {
      expect(buildInvitationUrl(baseFor(base), TOKEN)).toBe(previousBuilder(base, TOKEN));
    }
  });

  it('no longer drops a configured base path, which the previous builder did', () => {
    const base = 'https://www.grace.example/shift-shepherd';
    expect(previousBuilder(base, TOKEN)).toBe(`https://www.grace.example/invite/accept?token=${TOKEN}`);
    expect(buildInvitationUrl(baseFor(base), TOKEN)).toBe(
      `https://www.grace.example/shift-shepherd/invite/accept?token=${TOKEN}`,
    );
  });

  it('places the token once, as the only query parameter, with no doubled slashes', () => {
    for (const base of ['shiftshepherd://', `${HTTPS_BASE}//`, 'https://www.grace.example/a/b/']) {
      const link = buildInvitationUrl(baseFor(base), TOKEN);
      const [beforeQuery, query] = link.split('?');
      expect(link.split('?')).toHaveLength(2);
      expect(query).toBe(`token=${TOKEN}`);
      const path = beforeQuery.replace(/^[a-z]+:\/\/\/?[^/]*/, '');
      expect(path).not.toContain('//');
      expect(beforeQuery.endsWith(INVITATION_ACCEPT_PATH)).toBe(true);
    }
  });

  it.each([
    'short',
    `${TOKEN}=`,
    `${TOKEN}/`,
    `${TOKEN} `,
    `${TOKEN}&next=elsewhere`,
    'A'.repeat(201),
  ])('refuses to build a link for the invalid token %j', (token) => {
    expect(() => buildInvitationUrl(baseFor(HTTPS_BASE), token)).toThrow(
      'INVITATION_LINK_UNAVAILABLE',
    );
  });
});

describe('the app accepts the links the function builds', () => {
  it('routes both link shapes to invite/accept with the token intact', () => {
    for (const base of ['shiftshepherd://', HTTPS_BASE]) {
      const link = buildInvitationUrl(baseFor(base), TOKEN);
      expect(extractExpoPathFromURL([], link)).toBe(`invite/accept?token=${TOKEN}`);
      const token = new URL(link).searchParams.get('token');
      expect(isInvitationToken(token)).toBe(true);
      expect(token).toBe(TOKEN);
    }
  });

  it('matches the registered scheme and an existing route file', () => {
    const appConfig = JSON.parse(readFileSync(join(process.cwd(), 'app.json'), 'utf8')) as {
      expo: { scheme: string };
    };
    expect(APP_LINK_SCHEME).toBe(appConfig.expo.scheme);
    expect(existsSync(join(process.cwd(), `app${INVITATION_ACCEPT_PATH}.tsx`))).toBe(true);
  });
});

describe('invitation email link presentation', () => {
  it('shows the built link in the button and as a copyable fallback', () => {
    const link = buildInvitationUrl(baseFor('shiftshepherd://'), TOKEN);
    const { html } = buildInvitationEmail({
      organisationName: 'Grace Church',
      invitationUrl: link,
      expiresAt: '2026-09-24T10:00:00Z',
    });
    expect(html.split(`href="${link}"`)).toHaveLength(3);
    expect(html).toContain('If the button does not open, copy this link into your browser:');
    expect(html).toContain(`>${link}</a>`);
  });

  it('escapes the link everywhere it is printed', () => {
    const { html } = buildInvitationEmail({
      organisationName: 'Grace Church',
      invitationUrl: 'https://app.shiftshepherd.example/invite/accept?token=abc&x="<y>"',
      expiresAt: '2026-09-24T10:00:00Z',
    });
    const escaped = 'https://app.shiftshepherd.example/invite/accept?token=abc&amp;x=&quot;&lt;y&gt;&quot;';
    expect(html.split(escaped)).toHaveLength(4);
    expect(html).not.toContain('"<y>"');
  });
});
