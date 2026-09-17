/**
 * Pure invitation email rendering: no Deno globals, no network, so the
 * template and the expiry wording can be unit-tested offline and compared
 * with the app's presentation of the same `expires_at` value.
 *
 * Expiry presentation contract: an invitation expires at the instant stored
 * in `organisation_invitations.expires_at` (server-side `now() + 7 days`).
 * Both this email and the app render that instant as an explicit date and
 * time in UTC ("19 July 2026, 09:15 UTC"), never as a device-local calendar
 * day, so a recipient reading the email and an admin reading the app see the
 * same wording regardless of their time zones. The acceptance check itself
 * stays server-side and compares the raw timestamp; nothing here changes it.
 *
 * `src/lib/invitations/expiry.ts` mirrors `formatInvitationExpiry`; a Jest
 * test asserts both stay byte-for-byte equal across boundary inputs.
 *
 * The link is also printed as copyable text under the button: some email
 * clients remove or disable a button's link (custom-scheme links especially),
 * and the recipient must still be able to open the invitation.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Renders an ISO-8601 timestamp as "D Month YYYY, HH:MM UTC". Returns null
 * for values that do not parse as a date so callers can choose their own
 * fallback instead of showing "Invalid Date".
 */
export function formatInvitationExpiry(expiresAt: string): string | null {
  const date = new Date(expiresAt);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  const day = date.getUTCDate();
  const month = MONTH_NAMES[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}, ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export interface InvitationEmailInput {
  organisationName: string;
  invitationUrl: string;
  expiresAt: string;
}

export interface InvitationEmailContent {
  subject: string;
  html: string;
}

/** Builds the subject and HTML body; throws when `expiresAt` is unreadable. */
export function buildInvitationEmail(input: InvitationEmailInput): InvitationEmailContent {
  const expiry = formatInvitationExpiry(input.expiresAt);
  if (!expiry) throw new Error('INVITATION_EXPIRY_INVALID');

  const organisationName = escapeHtml(input.organisationName);
  const invitationUrl = escapeHtml(input.invitationUrl);

  return {
    subject: `You’re invited to ${input.organisationName} on Shift Shepherd`,
    html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033;max-width:560px">
          <h1 style="font-size:24px">Join ${organisationName} on Shift Shepherd</h1>
          <p>A church administrator invited you to their Shift Shepherd organisation.</p>
          <p><a href="${invitationUrl}" style="background:#2F5FC4;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open invitation</a></p>
          <p style="font-size:14px;color:#4A5568">If the button does not open, copy this link into your browser:<br><a href="${invitationUrl}" style="color:#2F5FC4;word-break:break-all">${invitationUrl}</a></p>
          <p>This private invitation expires on ${escapeHtml(expiry)}. If you were not expecting it, you can ignore this email.</p>
        </div>
      `,
  };
}
