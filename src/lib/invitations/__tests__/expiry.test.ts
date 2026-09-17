/**
 * Invitation expiry presentation: the app and the invitation email must show
 * the same wording for the same `expires_at` instant, and that wording must
 * not depend on the device time zone. The server's seven-day expiry value and
 * its acceptance check are untouched by these helpers.
 */
import {
  buildInvitationEmail,
  formatInvitationExpiry as formatInvitationExpiryForEmail,
} from '../../../../supabase/functions/manage-organisation-invitations/invitationEmail';
import {
  formatInvitationExpiry,
  INVITATION_EXPIRY_UNKNOWN_LABEL,
  invitationExpiryLabel,
} from '../expiry';

/** Representative device offsets, in minutes east of UTC. */
const DEVICE_OFFSETS = {
  'UTC-8': -8 * 60,
  'UTC+1': 1 * 60,
  'UTC+13': 13 * 60,
} as const;

/** Instants straddling UTC midnight, including sub-second edges. */
const BOUNDARY_INSTANTS = [
  '2026-07-18T23:59:59Z',
  '2026-07-18T23:59:59.999Z',
  '2026-07-19T00:00:00Z',
  '2026-07-19T00:00:00.001Z',
  '2026-07-19T00:30:00Z',
  '2026-07-18T11:30:00Z',
  '2026-07-19T07:59:59Z',
  '2026-07-19T08:00:00Z',
  '2026-12-31T23:59:59Z',
  '2027-01-01T00:00:00Z',
  '2026-02-28T23:00:00Z',
];

/** What a naive `toLocaleDateString()` would show on a device at `offset`. */
function deviceLocalCalendarDay(iso: string, offsetMinutes: number): string {
  const shifted = new Date(new Date(iso).getTime() + offsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function utcCalendarDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

describe('formatInvitationExpiry', () => {
  it('renders the UTC instant as an explicit date, time and zone', () => {
    expect(formatInvitationExpiry('2026-07-19T09:15:00Z')).toBe('19 July 2026, 09:15 UTC');
    expect(formatInvitationExpiry('2026-01-05T00:05:00.000Z')).toBe('5 January 2026, 00:05 UTC');
    expect(formatInvitationExpiry('2026-11-30T23:59:59.999Z')).toBe('30 November 2026, 23:59 UTC');
  });

  it('keeps UTC-midnight boundaries on the UTC calendar day', () => {
    expect(formatInvitationExpiry('2026-07-18T23:59:59Z')).toBe('18 July 2026, 23:59 UTC');
    expect(formatInvitationExpiry('2026-07-18T23:59:59.999Z')).toBe('18 July 2026, 23:59 UTC');
    expect(formatInvitationExpiry('2026-07-19T00:00:00Z')).toBe('19 July 2026, 00:00 UTC');
    expect(formatInvitationExpiry('2026-07-19T00:00:00.001Z')).toBe('19 July 2026, 00:00 UTC');
    expect(formatInvitationExpiry('2026-12-31T23:59:59Z')).toBe('31 December 2026, 23:59 UTC');
    expect(formatInvitationExpiry('2027-01-01T00:00:00Z')).toBe('1 January 2027, 00:00 UTC');
  });

  it('converts explicit-offset timestamps to UTC before rendering', () => {
    expect(formatInvitationExpiry('2026-07-19T01:00:00+02:00')).toBe('18 July 2026, 23:00 UTC');
    expect(formatInvitationExpiry('2026-07-18T18:30:00-08:00')).toBe('19 July 2026, 02:30 UTC');
    expect(formatInvitationExpiry('2026-07-19T12:00:00+13:00')).toBe('18 July 2026, 23:00 UTC');
    expect(formatInvitationExpiry('2026-07-19 00:00:00+00')).toBe(
      formatInvitationExpiry('2026-07-19T00:00:00Z'),
    );
  });

  it('returns null for unreadable values and the screen label falls back neutrally', () => {
    expect(formatInvitationExpiry('')).toBeNull();
    expect(formatInvitationExpiry('not a date')).toBeNull();
    expect(invitationExpiryLabel('not a date')).toBe(INVITATION_EXPIRY_UNKNOWN_LABEL);
    expect(invitationExpiryLabel('not a date')).not.toMatch(/invalid/i);
    expect(invitationExpiryLabel('2026-07-19T00:00:00Z')).toBe('19 July 2026, 00:00 UTC');
  });

  it('is independent of the device offset where a local calendar day would differ', () => {
    // Prove the defect class is real for the naive rendering: at least one
    // boundary instant lands on a different local day for each offset.
    let divergences = 0;
    for (const [name, offset] of Object.entries(DEVICE_OFFSETS)) {
      const differing = BOUNDARY_INSTANTS.filter(
        (iso) => deviceLocalCalendarDay(iso, offset) !== utcCalendarDay(iso),
      );
      expect({ offset: name, differing }).toEqual({
        offset: name,
        differing: expect.arrayContaining([expect.any(String)]),
      });
      divergences += differing.length;
    }
    expect(divergences).toBeGreaterThan(0);

    // The canonical rendering never moves: it reads only the UTC fields.
    for (const iso of BOUNDARY_INSTANTS) {
      const canonical = formatInvitationExpiry(iso);
      expect(canonical).toContain(' UTC');
      const utcDay = utcCalendarDay(iso);
      const [year, month, day] = utcDay.split('-').map(Number);
      expect(canonical?.startsWith(`${day} `)).toBe(true);
      expect(canonical).toContain(` ${year}, `);
      expect(new Date(`${utcDay}T00:00:00Z`).getUTCMonth() + 1).toBe(month);
    }
  });

  it('specific offsets: the device-local day differs but the shown expiry does not', () => {
    // UTC-8 (e.g. Pacific): 00:30 UTC on the 19th is still the 18th locally.
    expect(deviceLocalCalendarDay('2026-07-19T00:30:00Z', DEVICE_OFFSETS['UTC-8'])).toBe(
      '2026-07-18',
    );
    expect(formatInvitationExpiry('2026-07-19T00:30:00Z')).toBe('19 July 2026, 00:30 UTC');

    // UTC+1 (e.g. Central Europe): 23:30 UTC on the 18th is already the 19th locally.
    expect(deviceLocalCalendarDay('2026-07-18T23:30:00Z', DEVICE_OFFSETS['UTC+1'])).toBe(
      '2026-07-19',
    );
    expect(formatInvitationExpiry('2026-07-18T23:30:00Z')).toBe('18 July 2026, 23:30 UTC');

    // UTC+13 (e.g. Tonga): 11:30 UTC on the 18th is the 19th locally.
    expect(deviceLocalCalendarDay('2026-07-18T11:30:00Z', DEVICE_OFFSETS['UTC+13'])).toBe(
      '2026-07-19',
    );
    expect(formatInvitationExpiry('2026-07-18T11:30:00Z')).toBe('18 July 2026, 11:30 UTC');
  });
});

describe('email and app expiry presentation agree', () => {
  const inputs = [
    ...BOUNDARY_INSTANTS,
    '2026-07-19T01:00:00+02:00',
    '2026-07-18T18:30:00-08:00',
    '2026-07-19T12:00:00+13:00',
    '2026-03-08T09:15:27.123456Z',
  ];

  it('formats every instant identically in the Edge Function and the app', () => {
    for (const iso of inputs) {
      expect(formatInvitationExpiryForEmail(iso)).toBe(formatInvitationExpiry(iso));
      expect(formatInvitationExpiryForEmail(iso)).not.toBeNull();
    }
    expect(formatInvitationExpiryForEmail('not a date')).toBeNull();
  });

  it('renders the invitation email with the same expiry wording the app shows', () => {
    for (const iso of inputs) {
      const email = buildInvitationEmail({
        organisationName: 'Grace & <Hope>',
        invitationUrl: 'https://example.test/invite?token=abc',
        expiresAt: iso,
      });
      expect(email.html).toContain(
        `This private invitation expires on ${invitationExpiryLabel(iso)}.`,
      );
      expect(email.html).toContain('Join Grace &amp; &lt;Hope&gt; on Shift Shepherd');
      expect(email.html).not.toContain('<Hope>');
      expect(email.subject).toBe('You’re invited to Grace & <Hope> on Shift Shepherd');
    }
  });

  it('refuses to render an email with an unreadable expiry instead of printing Invalid Date', () => {
    expect(() =>
      buildInvitationEmail({
        organisationName: 'Grace',
        invitationUrl: 'https://example.test/invite',
        expiresAt: 'not a date',
      }),
    ).toThrow('INVITATION_EXPIRY_INVALID');
  });
});
