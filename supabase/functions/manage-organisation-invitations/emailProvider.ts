const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
export async function sendInvitationEmail(input: {
  to: string;
  organisationName: string;
  invitationUrl: string;
  expiresAt: string;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('INVITATION_FROM_EMAIL');
  if (!apiKey || !from) throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');

  const organisationName = escapeHtml(input.organisationName);
  const invitationUrl = escapeHtml(input.invitationUrl);
  const expiry = escapeHtml(new Date(input.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }));

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `You’re invited to ${input.organisationName} on Shift Shepherd`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033;max-width:560px">
          <h1 style="font-size:24px">Join ${organisationName} on Shift Shepherd</h1>
          <p>A church administrator invited you to their Shift Shepherd organisation.</p>
          <p><a href="${invitationUrl}" style="background:#2F5FC4;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open invitation</a></p>
          <p>This private invitation expires on ${expiry}. If you were not expecting it, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) throw new Error(`EMAIL_PROVIDER_${response.status}`);
}
