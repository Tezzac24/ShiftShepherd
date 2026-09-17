import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getSupabase } from '../../client';
import {
  acceptOrganisationInvitation,
  listOrganisationInvitations,
  previewOrganisationInvitation,
  resendOrganisationInvitation,
  revokeOrganisationInvitation,
  sendOrganisationInvitation,
  wasInvitationSaved,
} from '../invitations';

jest.mock('../../client', () => ({ getSupabase: jest.fn() }));
const mockGetSupabase = getSupabase as jest.Mock;

const ORG = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const INVITE = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'A'.repeat(43);

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

function client() {
  const rpc = jest.fn();
  const invoke = jest.fn();
  mockGetSupabase.mockReturnValue({ rpc, functions: { invoke } });
  return { rpc, invoke };
}

describe('organisation invitation service', () => {
  it('lists bounded admin fields and maps no token material', async () => {
    const { rpc } = client();
    rpc.mockResolvedValue({
      data: [{
        invitation_id: INVITE,
        invited_email: 'person@example.com',
        target_profile_id: null,
        target_display_name: null,
        status: 'pending',
        created_at: '2026-07-12T00:00:00Z',
        last_sent_at: null,
        expires_at: '2026-07-19T00:00:00Z',
        accepted_at: null,
        revoked_at: null,
        send_count: 1,
        invited_by_display_name: 'Daniel Okafor',
        token_hash: 'must-not-map',
      }],
      error: null,
    });
    const [invitation] = await listOrganisationInvitations();
    expect(invitation).not.toHaveProperty('token_hash');
    expect(invitation.invited_email).toBe('person@example.com');
  });

  it('sends only minimal new-person and existing-person requests', async () => {
    const { invoke } = client();
    invoke.mockResolvedValue({ data: { invitationId: INVITE }, error: null });
    await sendOrganisationInvitation({ organisationId: ORG, email: ' Person@Example.com ' });
    await sendOrganisationInvitation({ organisationId: ORG, targetProfileId: PROFILE });
    expect(invoke).toHaveBeenNthCalledWith(1, 'manage-organisation-invitations', {
      body: { action: 'send', organisationId: ORG, targetProfileId: null, email: 'person@example.com' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'manage-organisation-invitations', {
      body: { action: 'send', organisationId: ORG, targetProfileId: PROFILE, email: null },
    });
    for (const call of invoke.mock.calls) {
      expect(call[1].body).not.toHaveProperty('invitedByProfileId');
      expect(call[1].body).not.toHaveProperty('role');
      expect(call[1].body).not.toHaveProperty('tokenHash');
    }
  });

  it('uses bounded resend/revoke actions and preserves audit rows', async () => {
    const { invoke } = client();
    invoke
      .mockResolvedValueOnce({ data: { invitationId: 'new-id' }, error: null })
      .mockResolvedValueOnce({ data: { invitationId: INVITE, status: 'revoked' }, error: null });
    await resendOrganisationInvitation(INVITE);
    await revokeOrganisationInvitation(INVITE);
    expect(invoke.mock.calls.map((call) => call[1].body.action)).toEqual(['resend', 'revoke']);
    expect(invoke.mock.calls.map((call) => call[1].body.invitationId)).toEqual([INVITE, INVITE]);
  });

  it('previews and accepts with the raw token only in the Edge Function request', async () => {
    const { invoke } = client();
    invoke
      .mockResolvedValueOnce({
        data: {
          organisationName: 'Grace Church',
          maskedEmail: 'p***@example.com',
          status: 'pending',
          authenticationRequired: true,
          accountMatches: true,
          verifiedEmailPresent: true,
          suggestedDisplayName: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          invitationId: INVITE,
          profileId: PROFILE,
          organisationId: ORG,
          organisationName: 'Grace Church',
          globalDisplayName: 'Person Name',
          alreadyAccepted: false,
        },
        error: null,
      });
    await expect(previewOrganisationInvitation(TOKEN)).resolves.toMatchObject({ accountMatches: true });
    await acceptOrganisationInvitation(TOKEN, 'Person Name');
    expect(invoke).toHaveBeenNthCalledWith(1, 'manage-organisation-invitations', {
      body: { action: 'preview', token: TOKEN },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'manage-organisation-invitations', {
      body: { action: 'accept', token: TOKEN, globalDisplayName: 'Person Name' },
    });
  });

  it('maps structured non-2xx Edge Function errors to calm action guidance', async () => {
    const { invoke } = client();
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          json: jest.fn().mockResolvedValue({ error: 'INVITATION_ALREADY_PENDING' }),
        },
      },
    });
    await expect(
      sendOrganisationInvitation({ organisationId: ORG, email: 'person@example.com' }),
    ).rejects.toThrow('An invitation is already pending for that email address.');
  });

  it('keeps token generation, hashing, provider secrets, and raw-token returns server-side', () => {
    const source = functionSource('index.ts');
    expect(source).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(source).toContain("crypto.subtle.digest('SHA-256'");
    // The three invitation secrets are read only through the validated config.
    expect(source).toContain('readInvitationEmailConfig((name) => Deno.env.get(name))');
    expect(source).not.toMatch(/Deno\.env\.get\('(RESEND_API_KEY|INVITATION_FROM_EMAIL|INVITATION_APP_BASE_URL)'\)/);
    expect(source).not.toMatch(/console\.(log|warn|error)\([^\n]*(token|invitationUrl)/i);
    expect(source).not.toMatch(/response\([^\n]*raw/i);

    const config = functionSource('invitationConfig.ts');
    for (const name of ['RESEND_API_KEY', 'INVITATION_FROM_EMAIL', 'INVITATION_APP_BASE_URL']) {
      expect(config).toContain(`'${name}'`);
    }
    // The pure modules stay importable by Jest: no Deno globals, no imports.
    for (const file of ['invitationConfig.ts', 'emailProvider.ts', 'invitationEmail.ts']) {
      const code = functionSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code).not.toMatch(/\bDeno\./);
      expect(code).not.toMatch(/^import\s/m);
    }
  });
});

function functionSource(file: string): string {
  return readFileSync(
    join(process.cwd(), 'supabase/functions/manage-organisation-invitations', file),
    'utf8',
  );
}

/** Returns each `console.*(...)` call with its full, balanced argument list. */
function consoleCalls(source: string): string[] {
  const calls: string[] = [];
  const pattern = /console\.(log|info|warn|error|debug)\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    for (; index < source.length && depth > 0; index += 1) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') depth -= 1;
    }
    calls.push(source.slice(match.index, index));
  }
  return calls;
}

function errorResponse(code: string) {
  return {
    data: null,
    error: { context: { json: jest.fn().mockResolvedValue({ error: code }) } },
  };
}

describe('invitation email outcomes', () => {
  it('explains a configuration problem without claiming anything was saved', async () => {
    const { invoke } = client();
    invoke.mockResolvedValue(errorResponse('INVITATION_EMAIL_NOT_CONFIGURED'));
    const failure = await sendOrganisationInvitation({
      organisationId: ORG,
      email: 'person@example.com',
    }).catch((error: unknown) => error);
    expect(failure).toEqual(
      new Error('Invitation emails aren’t set up yet, so nothing was sent. Please try again later.'),
    );
    expect(wasInvitationSaved(failure)).toBe(false);
  });

  it.each([
    [
      'EMAIL_DELIVERY_UNAVAILABLE',
      'The invitation was saved, but the email service is busy right now. Please use Resend in a few minutes.',
    ],
    [
      'EMAIL_DELIVERY_REJECTED',
      'The invitation was saved, but its email couldn’t be delivered. Check the email address, then use Resend. If it keeps failing, invitation emails may not be fully set up yet.',
    ],
    [
      'EMAIL_DELIVERY_FAILED',
      'The invitation was saved, but its email couldn’t be sent. Please use Resend to try again.',
    ],
  ])('marks %s as saved but not sent, for send and resend', async (code, message) => {
    const { invoke } = client();
    invoke.mockResolvedValue(errorResponse(code));

    const sendFailure = await sendOrganisationInvitation({
      organisationId: ORG,
      targetProfileId: PROFILE,
    }).catch((error: unknown) => error);
    expect(sendFailure).toEqual(new Error(message));
    expect(wasInvitationSaved(sendFailure)).toBe(true);

    const resendFailure = await resendOrganisationInvitation(INVITE).catch((error: unknown) => error);
    expect(resendFailure).toEqual(new Error(message));
    expect(wasInvitationSaved(resendFailure)).toBe(true);
  });

  it('does not treat unrelated failures as saved invitations', async () => {
    const { invoke } = client();
    invoke.mockResolvedValue(errorResponse('INVITATION_ALREADY_PENDING'));
    const failure = await sendOrganisationInvitation({
      organisationId: ORG,
      email: 'person@example.com',
    }).catch((error: unknown) => error);
    expect(wasInvitationSaved(failure)).toBe(false);
    expect(wasInvitationSaved(null)).toBe(false);
    expect(wasInvitationSaved({ invitationSaved: 'yes' })).toBe(false);
  });
});

describe('manage-organisation-invitations function contract', () => {
  it('validates the email configuration before issuing or superseding an invitation', () => {
    const source = functionSource('index.ts');
    const sendBlock = source.slice(
      source.indexOf("if (action === 'send') {"),
      source.indexOf("if (action === 'resend') {"),
    );
    const resendBlock = source.slice(
      source.indexOf("if (action === 'resend') {"),
      source.indexOf("if (action === 'revoke') {"),
    );
    for (const block of [sendBlock, resendBlock]) {
      const configIndex = block.indexOf('loadInvitationEmailConfig()');
      expect(configIndex).toBeGreaterThan(-1);
      expect(block.indexOf('if (config instanceof Response) return config;')).toBeGreaterThan(
        configIndex,
      );
      expect(block.indexOf('return issueAndEmail({')).toBeGreaterThan(configIndex);
    }
    // The issuing RPCs run only inside issueAndEmail, which requires the config.
    expect(source).toMatch(
      /async function issueAndEmail\(input: \{\n\s+admin: SupabaseClient;\n\s+config: InvitationEmailConfig;/,
    );
    expect(source.split("'issue_organisation_invitation_internal'")).toHaveLength(2);
    expect(source.split("'resend_organisation_invitation_internal'")).toHaveLength(2);
    expect(source).toContain("response(503, { error: 'INVITATION_EMAIL_NOT_CONFIGURED' })");
    expect(source).toContain('response(502, { error: deliveryErrorCode(delivery.failure) })');
  });

  it('logs only bounded codes: no token, link, address, key, or message content', () => {
    const calls = consoleCalls(functionSource('index.ts'));
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const call of calls) {
      // Inspect only the arguments, without string literals. The error object
      // may reach the log only through preparationErrorCode, which returns a
      // fixed code.
      const argumentsOnly = call
        .slice(call.indexOf('(') + 1)
        .replace(/'[^']*'/g, "''")
        .replace('preparationErrorCode(error)', 'preparationErrorCode()');
      expect(argumentsOnly).not.toMatch(
        /\b(token|raw|hash|invitationUrl|invited_email|email|resendApiKey|apiKey|from|html|subject|content|body|message|error)\b/,
      );
    }
    const logged = calls.join('\n');
    expect(logged).toContain('problems: result.problems');
    expect(logged).toContain('notices: result.config.notices');
    expect(logged).toContain('providerStatus: delivery.providerStatus');
    expect(logged).toContain('providerError: delivery.providerError');
  });
});
