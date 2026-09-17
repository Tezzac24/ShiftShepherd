import { buildInvitationEmail } from './invitationEmail.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendInvitationEmail(input: {
  to: string;
  organisationName: string;
  invitationUrl: string;
  expiresAt: string;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('INVITATION_FROM_EMAIL');
  if (!apiKey || !from) throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');

  const { subject, html } = buildInvitationEmail({
    organisationName: input.organisationName,
    invitationUrl: input.invitationUrl,
    expiresAt: input.expiresAt,
  });

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject,
      html,
    }),
  });

  if (!response.ok) throw new Error(`EMAIL_PROVIDER_${response.status}`);
}
