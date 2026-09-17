/**
 * Invitation expiry presentation (app side).
 *
 * An invitation expires at the instant stored in `expires_at` (server-side
 * `now() + 7 days`). The app and the invitation email present that instant
 * identically: an explicit date and time in UTC ("19 July 2026, 09:15 UTC").
 * Rendering a device-local calendar day would let the email (UTC) and the
 * app disagree by a day around midnight, so this formatter deliberately reads
 * only the UTC fields and ignores the device time zone. Acceptance is still
 * decided by the server against the raw timestamp.
 *
 * This mirrors `formatInvitationExpiry` in
 * `supabase/functions/manage-organisation-invitations/invitationEmail.ts`;
 * a Jest test keeps the two outputs identical.
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

/** Shown when a stored timestamp cannot be parsed; never "Invalid Date". */
export const INVITATION_EXPIRY_UNKNOWN_LABEL = 'Unknown';

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Renders an ISO-8601 timestamp as "D Month YYYY, HH:MM UTC", or null when
 * the value does not parse as a date.
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

/** Screen-ready label: the formatted expiry or the neutral unknown fallback. */
export function invitationExpiryLabel(expiresAt: string): string {
  return formatInvitationExpiry(expiresAt) ?? INVITATION_EXPIRY_UNKNOWN_LABEL;
}
