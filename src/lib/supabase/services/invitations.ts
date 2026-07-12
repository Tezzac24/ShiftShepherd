import { SupabaseClient } from '@supabase/supabase-js';

import {
  OrganisationInvitation,
  OrganisationInvitationStatus,
} from '../../../types';
import { getSupabase } from '../client';

export const INVITATION_FUNCTION_NAME = 'manage-organisation-invitations';
const OFFLINE_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';
const SETUP_ERROR = 'Invitations are not switched on yet. Please try again later.';
const ACTION_ERROR = 'We couldn’t update that invitation right now. Please try again.';

interface InvitationRow {
  invitation_id: string;
  invited_email: string;
  target_profile_id: string | null;
  target_display_name: string | null;
  status: OrganisationInvitationStatus;
  created_at: string;
  last_sent_at: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  send_count: number;
  invited_by_display_name: string;
}

export interface InvitationPreview {
  organisationName: string;
  maskedEmail: string;
  status: OrganisationInvitationStatus | 'invalid';
  authenticationRequired: boolean;
  accountMatches: boolean | null;
  verifiedEmailPresent: boolean | null;
  suggestedDisplayName: string | null;
}

export interface InvitationAcceptance {
  invitationId: string;
  profileId: string;
  organisationId: string;
  organisationName: string;
  globalDisplayName: string;
  alreadyAccepted: boolean;
}

function requireClient(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error(OFFLINE_ERROR);
  return client;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function friendly(error: unknown, fallback = ACTION_ERROR): Error {
  const message = messageOf(error);
  if (/fetch|network|timeout/i.test(message)) return new Error(OFFLINE_ERROR);
  if (/404|not found|Failed to send a request to the Edge Function/i.test(message)) {
    return new Error(SETUP_ERROR);
  }
  if (/NOT_AUTHORISED|permission|403/i.test(message)) {
    return new Error('Only a church admin can manage invitations.');
  }
  if (/INVITATION_ALREADY_PENDING/i.test(message)) {
    return new Error('An invitation is already pending for that email address.');
  }
  if (/PROFILE_ALREADY_LINKED/i.test(message)) {
    return new Error('That person already has an account for this organisation.');
  }
  if (/PROFILE_NOT_ELIGIBLE/i.test(message)) {
    return new Error('That person can’t be invited from this directory entry.');
  }
  if (/VALID_EMAIL_REQUIRED/i.test(message)) {
    return new Error('Please enter a valid email address.');
  }
  if (/INVITATION_EMAIL_MISMATCH/i.test(message)) {
    return new Error('Please sign in with the email address this invitation was sent to.');
  }
  if (/VERIFIED_EMAIL_REQUIRED/i.test(message)) {
    return new Error('This invitation needs a verified email address.');
  }
  if (/DISPLAY_NAME_REQUIRED/i.test(message)) return new Error('Please confirm your full name.');
  if (/DISPLAY_NAME_TOO_LONG/i.test(message)) {
    return new Error('Please keep your name to 100 characters or fewer.');
  }
  if (/INVITATION_EXPIRED/i.test(message)) return new Error('This invitation has expired.');
  if (/INVITATION_REVOKED/i.test(message)) return new Error('This invitation was revoked.');
  if (/INVITATION_SUPERSEDED/i.test(message)) {
    return new Error('A newer invitation was sent. Please use the latest email.');
  }
  if (/INVITATION_ALREADY_ACCEPTED/i.test(message)) {
    return new Error('This invitation has already been accepted.');
  }
  return new Error(fallback);
}

function mapInvitation(row: InvitationRow): OrganisationInvitation {
  return {
    id: row.invitation_id,
    invited_email: row.invited_email,
    target_profile_id: row.target_profile_id,
    target_display_name: row.target_display_name,
    status: row.status,
    created_at: row.created_at,
    last_sent_at: row.last_sent_at,
    expires_at: row.expires_at,
    accepted_at: row.accepted_at,
    revoked_at: row.revoked_at,
    send_count: row.send_count,
    invited_by_display_name: row.invited_by_display_name,
  };
}

export async function listOrganisationInvitations(): Promise<OrganisationInvitation[]> {
  try {
    const { data, error } = await requireClient().rpc('list_organisation_invitations');
    if (error) throw error;
    return ((data ?? []) as InvitationRow[]).map(mapInvitation);
  } catch (error) {
    console.warn('[invitations] list failed', { code: (error as { code?: string })?.code });
    throw friendly(error, 'We couldn’t load invitations right now. Please try again.');
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  try {
    const { data, error } = await requireClient().functions.invoke(INVITATION_FUNCTION_NAME, {
      body,
    });
    if (error) {
      const context = (error as { context?: { clone?: () => Response; json?: () => Promise<unknown> } })
        .context;
      try {
        const response = context?.clone?.() ?? context;
        const payload = await response?.json?.();
        if (
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          typeof payload.error === 'string'
        ) {
          throw new Error(payload.error);
        }
      } catch (contextError) {
        if (contextError instanceof Error && /^[A-Z][A-Z_]+$/.test(contextError.message)) {
          throw contextError;
        }
      }
      throw error;
    }
    if (!data || typeof data !== 'object') throw new Error(ACTION_ERROR);
    if ('error' in data && typeof data.error === 'string') throw new Error(data.error);
    return data as T;
  } catch (error) {
    console.warn('[invitations] function action failed', {
      action: typeof body.action === 'string' ? body.action : 'unknown',
      code: (error as { code?: string })?.code,
    });
    throw friendly(error);
  }
}

export async function sendOrganisationInvitation(input: {
  organisationId: string;
  targetProfileId?: string;
  email?: string;
}): Promise<{ invitationId: string }> {
  return invoke({
    action: 'send',
    organisationId: input.organisationId,
    targetProfileId: input.targetProfileId ?? null,
    email: input.email?.trim().toLowerCase() ?? null,
  });
}

export async function resendOrganisationInvitation(
  invitationId: string,
): Promise<{ invitationId: string }> {
  return invoke({ action: 'resend', invitationId });
}

export async function revokeOrganisationInvitation(
  invitationId: string,
): Promise<{ invitationId: string; status: 'revoked' }> {
  return invoke({ action: 'revoke', invitationId });
}

export async function previewOrganisationInvitation(token: string): Promise<InvitationPreview> {
  const result = await invoke<{
    organisationName?: string;
    maskedEmail?: string;
    status?: OrganisationInvitationStatus;
    authenticationRequired?: boolean;
    accountMatches?: boolean | null;
    verifiedEmailPresent?: boolean | null;
    suggestedDisplayName?: string | null;
  }>({ action: 'preview', token });
  return {
    organisationName: result.organisationName ?? 'your organisation',
    maskedEmail: result.maskedEmail ?? 'the invited email address',
    status: result.status ?? 'invalid',
    authenticationRequired: result.authenticationRequired !== false,
    accountMatches: result.accountMatches ?? null,
    verifiedEmailPresent: result.verifiedEmailPresent ?? null,
    suggestedDisplayName: result.suggestedDisplayName ?? null,
  };
}

export async function acceptOrganisationInvitation(
  token: string,
  globalDisplayName?: string,
): Promise<InvitationAcceptance> {
  return invoke({
    action: 'accept',
    token,
    globalDisplayName: globalDisplayName?.trim() || null,
  });
}
