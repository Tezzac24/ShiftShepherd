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
    const source = readFileSync(
      join(process.cwd(), 'supabase/functions/manage-organisation-invitations/index.ts'),
      'utf8',
    );
    expect(source).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(source).toContain("crypto.subtle.digest('SHA-256'");
    expect(source).toContain("Deno.env.get('INVITATION_APP_BASE_URL')");
    expect(source).not.toMatch(/console\.(log|warn|error)\([^\n]*(token|invitationUrl)/i);
    expect(source).not.toMatch(/response\([^\n]*raw/i);

    const provider = readFileSync(
      join(process.cwd(), 'supabase/functions/manage-organisation-invitations/emailProvider.ts'),
      'utf8',
    );
    expect(provider).toContain("Deno.env.get('RESEND_API_KEY')");
    expect(provider).toContain("Deno.env.get('INVITATION_FROM_EMAIL')");
  });
});
