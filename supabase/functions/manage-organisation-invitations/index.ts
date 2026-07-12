/**
 * Trusted organisation invitation gateway.
 *
 * Raw invitation tokens are generated with 32 random bytes and exist only in
 * this request's memory and the outgoing link. The database receives SHA-256
 * hashes only. This function never logs request bodies, emails, links, or
 * tokens. Admin/accept actions validate the supplied JWT with Auth; preview is
 * intentionally token-authenticated and returns only a masked email and org
 * name. Database functions repeat church-admin, tenant, verified-email,
 * locking, replay, and status checks transactionally.
 */
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { sendInvitationEmail } from './emailProvider.ts';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,200}$/;
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

type Action = 'send' | 'resend' | 'revoke' | 'preview' | 'accept';

interface InvitationIssueRow {
  invitation_id: string;
  invited_email: string;
  organisation_name: string;
  expires_at: string;
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function getServiceRoleKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const dictionary = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!dictionary) return null;
  try {
    return (JSON.parse(dictionary) as Record<string, string>).default ?? null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function oneRow<T>(value: unknown): T | null {
  return (Array.isArray(value) ? value[0] : value) as T | null;
}

function knownError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
  const codes = [
    'NOT_AUTHORISED',
    'INVITATION_ALREADY_PENDING',
    'INVITATION_NOT_FOUND',
    'INVITATION_NOT_PENDING',
    'INVITATION_EXPIRED',
    'INVITATION_REVOKED',
    'INVITATION_SUPERSEDED',
    'INVITATION_ALREADY_ACCEPTED',
    'INVITATION_EMAIL_MISMATCH',
    'INVITATION_INVALID',
    'VERIFIED_EMAIL_REQUIRED',
    'DISPLAY_NAME_REQUIRED',
    'DISPLAY_NAME_TOO_LONG',
    'PROFILE_NOT_ELIGIBLE',
    'PROFILE_ALREADY_LINKED',
    'ORGANISATION_ALREADY_JOINED',
    'VALID_EMAIL_REQUIRED',
  ];
  return codes.find((code) => message.includes(code)) ?? 'INVITATION_REQUEST_FAILED';
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function newToken(): Promise<{ raw: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = toBase64Url(bytes);
  return { raw, hash: await sha256Hex(raw) };
}

function invitationUrl(rawToken: string): string {
  const base = Deno.env.get('INVITATION_APP_BASE_URL');
  if (!base) throw new Error('INVITATION_URL_NOT_CONFIGURED');
  const url = new URL('/invite/accept', base);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

async function authenticatedUserId(
  admin: SupabaseClient,
  request: Request,
): Promise<string | null> {
  const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  return error ? null : (data.user?.id ?? null);
}

async function issueAndEmail(input: {
  admin: SupabaseClient;
  userId: string;
  action: 'send' | 'resend';
  organisationId?: string;
  targetProfileId?: string | null;
  email?: string | null;
  invitationId?: string;
}): Promise<Response> {
  const token = await newToken();
  const rpc = input.action === 'send'
    ? input.admin.rpc('issue_organisation_invitation_internal', {
        p_caller_auth_user_id: input.userId,
        p_organisation_id: input.organisationId,
        p_target_profile_id: input.targetProfileId ?? null,
        p_invited_email: input.email ?? null,
        p_token_hash_hex: token.hash,
      })
    : input.admin.rpc('resend_organisation_invitation_internal', {
        p_caller_auth_user_id: input.userId,
        p_invitation_id: input.invitationId,
        p_token_hash_hex: token.hash,
      });
  const { data, error } = await rpc;
  if (error) return response(400, { error: knownError(error) });
  const row = oneRow<InvitationIssueRow>(data);
  if (!row) return response(500, { error: 'INVITATION_REQUEST_FAILED' });

  try {
    await sendInvitationEmail({
      to: row.invited_email,
      organisationName: row.organisation_name,
      invitationUrl: invitationUrl(token.raw),
      expiresAt: row.expires_at,
    });
  } catch (error) {
    console.error('[manage-organisation-invitations] email delivery failed', {
      code: error instanceof Error ? error.message : 'EMAIL_DELIVERY_FAILED',
    });
    return response(502, { error: 'EMAIL_DELIVERY_FAILED' });
  }

  const { error: sentError } = await input.admin.rpc(
    'mark_organisation_invitation_sent_internal',
    { p_invitation_id: row.invitation_id },
  );
  if (sentError) {
    console.error('[manage-organisation-invitations] sent marker failed', {
      code: sentError.code,
    });
  }
  return response(200, { invitationId: row.invitation_id });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[manage-organisation-invitations] missing runtime configuration');
    return response(500, { error: 'SERVER_CONFIGURATION_ERROR' });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown> | null = null;
  try {
    body = asRecord(await request.json());
  } catch {
    // Bounded response; never echo the body (it may contain a raw token).
  }
  const action = body?.action;
  if (!body || !['send', 'resend', 'revoke', 'preview', 'accept'].includes(String(action))) {
    return response(400, { error: 'INVALID_REQUEST' });
  }

  if (action === 'preview') {
    const token = body.token;
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
      return response(200, { status: 'invalid', authenticationRequired: true });
    }
    const previewUserId = await authenticatedUserId(admin, request);
    const { data, error } = await admin.rpc('preview_organisation_invitation_internal', {
      p_token_hash_hex: await sha256Hex(token),
      p_caller_auth_user_id: previewUserId,
    });
    if (error) return response(500, { error: 'INVITATION_REQUEST_FAILED' });
    const row = oneRow<{
      organisation_name: string;
      masked_email: string;
      status: string;
      authentication_required: boolean;
      account_matches: boolean | null;
      verified_email_present: boolean | null;
      suggested_display_name: string | null;
    }>(data);
    if (!row) return response(200, { status: 'invalid', authenticationRequired: true });
    return response(200, {
      organisationName: row.organisation_name,
      maskedEmail: row.masked_email,
      status: row.status,
      authenticationRequired: row.authentication_required,
      accountMatches: row.account_matches,
      verifiedEmailPresent: row.verified_email_present,
      suggestedDisplayName: row.suggested_display_name,
    });
  }

  const userId = await authenticatedUserId(admin, request);
  if (!userId) return response(401, { error: 'NOT_AUTHENTICATED' });

  if (action === 'send') {
    const organisationId = body.organisationId;
    const targetProfileId = body.targetProfileId;
    const email = body.email;
    if (typeof organisationId !== 'string' || !UUID_RE.test(organisationId)) {
      return response(400, { error: 'INVALID_REQUEST' });
    }
    const existingPath = typeof targetProfileId === 'string' && UUID_RE.test(targetProfileId);
    const newPath = targetProfileId == null && typeof email === 'string' && email.length <= 320;
    if (!existingPath && !newPath) return response(400, { error: 'INVALID_REQUEST' });
    return issueAndEmail({
      admin,
      userId,
      action: 'send',
      organisationId,
      targetProfileId: existingPath ? targetProfileId : null,
      email: newPath ? email : null,
    });
  }

  if (action === 'resend') {
    if (typeof body.invitationId !== 'string' || !UUID_RE.test(body.invitationId)) {
      return response(400, { error: 'INVALID_REQUEST' });
    }
    return issueAndEmail({
      admin,
      userId,
      action: 'resend',
      invitationId: body.invitationId,
    });
  }

  if (action === 'revoke') {
    if (typeof body.invitationId !== 'string' || !UUID_RE.test(body.invitationId)) {
      return response(400, { error: 'INVALID_REQUEST' });
    }
    const { data, error } = await admin.rpc('revoke_organisation_invitation_internal', {
      p_caller_auth_user_id: userId,
      p_invitation_id: body.invitationId,
    });
    if (error) return response(400, { error: knownError(error) });
    const row = oneRow<{ invitation_id: string; status: 'revoked' }>(data);
    return row
      ? response(200, { invitationId: row.invitation_id, status: row.status })
      : response(500, { error: 'INVITATION_REQUEST_FAILED' });
  }

  const token = body.token;
  const globalDisplayName = body.globalDisplayName;
  if (
    typeof token !== 'string' ||
    !TOKEN_RE.test(token) ||
    (globalDisplayName != null && typeof globalDisplayName !== 'string')
  ) {
    return response(400, { error: 'INVALID_REQUEST' });
  }
  const { data, error } = await admin.rpc('accept_organisation_invitation_internal', {
    p_caller_auth_user_id: userId,
    p_token_hash_hex: await sha256Hex(token),
    p_global_display_name: typeof globalDisplayName === 'string' ? globalDisplayName : null,
  });
  if (error) return response(400, { error: knownError(error) });
  const row = oneRow<{
    invitation_id: string;
    profile_id: string;
    organisation_id: string;
    organisation_name: string;
    global_display_name: string;
    already_accepted: boolean;
  }>(data);
  if (!row) return response(500, { error: 'INVITATION_REQUEST_FAILED' });
  return response(200, {
    invitationId: row.invitation_id,
    profileId: row.profile_id,
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    globalDisplayName: row.global_display_name,
    alreadyAccepted: row.already_accepted,
  });
});
