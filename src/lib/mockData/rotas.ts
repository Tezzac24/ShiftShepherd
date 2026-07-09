/**
 * Mock rota entries, assignments, availability responses, and choir song
 * selections. Dates are relative to "today" so rotas are always upcoming.
 *
 * Test setup highlights:
 *  - Choir services have separate Praise and Worship leaders. rota-choir-2 is
 *    Michael (Praise) + Hannah (Worship) with NO songs selected, so the
 *    section-level "leader selects their own songs" flow can be tested
 *    end-to-end from both accounts.
 *  - rota-choir-1 has Sarah leading BOTH sections (one person, two roles).
 *  - rota-choir-r1 is a choir rehearsal with every choir member expected
 *    ('Choir Member' assignments) — the rehearsal availability tracker.
 *  - rota-choir-r2 is a CANCELLED rehearsal, testing the cancelled UX.
 *  - Availability responses are mixed (available / unavailable / maybe /
 *    not responded) with optional notes on some.
 *
 * Rota entries, assignments, and availability responses are live in Supabase
 * mode now — these seeds serve demo mode (and Reset Demo Data) only.
 * TODO: wire to Supabase — `choir_rota_song_selections` table.
 */
import {
  AvailabilityResponse,
  AvailabilityStatus,
  ChoirSongSelection,
  RotaAssignment,
  RotaEntry,
  SongSection,
} from '../../types';
import { daysAgo, iso, nextWeekday, toDateKey } from '../../utils/dates';
import { ORG_ID } from './people';

const entry = (
  id: string,
  team_id: string,
  title: string,
  date: Date,
  time: string | null,
  notes: string | null,
  created_by: string,
): RotaEntry => ({
  id,
  organisation_id: ORG_ID,
  team_id,
  title,
  date: toDateKey(date),
  time,
  notes,
  status: 'active',
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  created_by,
  created_at: iso(daysAgo(10)),
  updated_at: iso(daysAgo(10)),
});

const assignment = (
  id: string,
  rota_entry_id: string,
  user_id: string,
  role_name: string,
): RotaAssignment => ({
  id,
  rota_entry_id,
  user_id,
  role_name,
  created_at: iso(daysAgo(10)),
});

const response = (
  id: string,
  rota_assignment_id: string,
  user_id: string,
  status: AvailabilityStatus,
  note: string | null = null,
): AvailabilityResponse => ({
  id,
  rota_assignment_id,
  user_id,
  status,
  note,
  updated_at: iso(daysAgo(1)),
});

const sunday1 = nextWeekday(0);
const sunday2 = nextWeekday(0, 1);
const sunday3 = nextWeekday(0, 2); // Thanksgiving service
const sunday4 = nextWeekday(0, 3);
const saturday1 = nextWeekday(6); // choir rehearsal
const saturday2 = nextWeekday(6, 1); // cancelled choir rehearsal

// ---------------------------------------------------------------------------
// Choir rota
// ---------------------------------------------------------------------------

const cancelledRehearsal: RotaEntry = {
  ...entry(
    'rota-choir-r2',
    'team-choir',
    'Choir Rehearsal',
    saturday2,
    '17:00',
    null,
    'user-sarah',
  ),
  status: 'cancelled',
  cancelled_at: iso(daysAgo(1)),
  cancelled_by: 'user-sarah',
  cancellation_reason: 'The main hall is being used for the community fair that evening.',
};

export const mockRotaEntries: RotaEntry[] = [
  entry('rota-choir-1', 'team-choir', 'Sunday Morning Service', sunday1, '09:15', 'Please arrive by 9:15 for warm-up.', 'user-sarah'),
  entry('rota-choir-2', 'team-choir', 'Sunday Morning Service', sunday2, '09:15', null, 'user-sarah'),
  entry('rota-choir-3', 'team-choir', 'Special Thanksgiving Service', sunday3, '09:00', 'Extra warm-up — two new songs this week.', 'user-sarah'),
  entry('rota-choir-4', 'team-choir', 'Sunday Morning Service', sunday4, '09:15', null, 'user-sarah'),

  // Choir rehearsals — every choir member is expected, so everyone confirms
  // their availability for the practice session.
  entry('rota-choir-r1', 'team-choir', 'Choir Rehearsal', saturday1, '17:00', 'Working on the new songs for Thanksgiving.', 'user-sarah'),
  cancelledRehearsal,

  // Media rota
  entry('rota-media-1', 'team-media', 'Sunday Morning Service', sunday1, '09:00', 'Sound check at 9:00 sharp.', 'user-david'),
  entry('rota-media-2', 'team-media', 'Sunday Morning Service', sunday2, '09:00', null, 'user-david'),
  entry('rota-media-3', 'team-media', 'Special Thanksgiving Service', sunday3, '08:45', 'Extra camera for the shared lunch photos.', 'user-david'),
  entry('rota-media-4', 'team-media', 'Sunday Morning Service', sunday4, '09:00', null, 'user-david'),

  // Ushers rota
  entry('rota-ushers-1', 'team-ushers', 'Sunday Morning Service', sunday1, '09:15', 'Doors open at 9:30.', 'user-miriam'),
  entry('rota-ushers-2', 'team-ushers', 'Special Thanksgiving Service', sunday3, '09:00', 'Expecting extra visitors — warm welcome please!', 'user-miriam'),
];

export const mockRotaAssignments: RotaAssignment[] = [
  // Choir — Sunday 1 (Sarah leads BOTH praise and worship; songs selected)
  assignment('ra-c1-1', 'rota-choir-1', 'user-sarah', 'Praise Leader'),
  assignment('ra-c1-1b', 'rota-choir-1', 'user-sarah', 'Worship Leader'),
  assignment('ra-c1-2', 'rota-choir-1', 'user-michael', 'Backup Vocal'),
  assignment('ra-c1-3', 'rota-choir-1', 'user-hannah', 'Choir Member'),

  // Choir — Sunday 2 (Michael: Praise, Hannah: Worship, NO songs selected —
  // test the section-level selection flow here)
  assignment('ra-c2-1', 'rota-choir-2', 'user-michael', 'Praise Leader'),
  assignment('ra-c2-2', 'rota-choir-2', 'user-hannah', 'Worship Leader'),
  assignment('ra-c2-3', 'rota-choir-2', 'user-sarah', 'Choir Member'),

  // Choir — Thanksgiving (Sarah: Praise, Michael: Worship)
  assignment('ra-c3-1', 'rota-choir-3', 'user-sarah', 'Praise Leader'),
  assignment('ra-c3-2', 'rota-choir-3', 'user-michael', 'Worship Leader'),
  assignment('ra-c3-3', 'rota-choir-3', 'user-hannah', 'Backup Vocal'),

  // Choir — Sunday 4 (Hannah: Praise, Sarah: Worship)
  assignment('ra-c4-1', 'rota-choir-4', 'user-hannah', 'Praise Leader'),
  assignment('ra-c4-2', 'rota-choir-4', 'user-sarah', 'Worship Leader'),
  assignment('ra-c4-3', 'rota-choir-4', 'user-michael', 'Choir Member'),

  // Choir rehearsal — everyone expected
  assignment('ra-cr1-1', 'rota-choir-r1', 'user-sarah', 'Choir Member'),
  assignment('ra-cr1-2', 'rota-choir-r1', 'user-hannah', 'Choir Member'),
  assignment('ra-cr1-3', 'rota-choir-r1', 'user-michael', 'Choir Member'),

  // Cancelled rehearsal — assignments kept for history
  assignment('ra-cr2-1', 'rota-choir-r2', 'user-sarah', 'Choir Member'),
  assignment('ra-cr2-2', 'rota-choir-r2', 'user-hannah', 'Choir Member'),
  assignment('ra-cr2-3', 'rota-choir-r2', 'user-michael', 'Choir Member'),

  // Media
  assignment('ra-m1-1', 'rota-media-1', 'user-david', 'Sound'),
  assignment('ra-m1-2', 'rota-media-1', 'user-joseph', 'Camera'),
  assignment('ra-m1-3', 'rota-media-1', 'user-michael', 'Slides'),
  assignment('ra-m2-1', 'rota-media-2', 'user-joseph', 'Sound'),
  assignment('ra-m2-2', 'rota-media-2', 'user-michael', 'Camera'),
  assignment('ra-m2-3', 'rota-media-2', 'user-david', 'Livestream'),
  assignment('ra-m3-1', 'rota-media-3', 'user-david', 'Sound'),
  assignment('ra-m3-2', 'rota-media-3', 'user-joseph', 'Camera'),
  assignment('ra-m3-3', 'rota-media-3', 'user-michael', 'Livestream'),
  assignment('ra-m4-1', 'rota-media-4', 'user-michael', 'Sound'),
  assignment('ra-m4-2', 'rota-media-4', 'user-david', 'Slides'),
  assignment('ra-m4-3', 'rota-media-4', 'user-joseph', 'Livestream'),

  // Ushers
  assignment('ra-u1-1', 'rota-ushers-1', 'user-daniel', 'Front Door'),
  assignment('ra-u1-2', 'rota-ushers-1', 'user-joseph', 'Offering'),
  assignment('ra-u2-1', 'rota-ushers-2', 'user-miriam', 'Front Door'),
  assignment('ra-u2-2', 'rota-ushers-2', 'user-daniel', 'Offering'),
];

/**
 * Missing response = "not responded". Mixed states with optional notes.
 */
export const mockAvailabilityResponses: AvailabilityResponse[] = [
  response('av-1', 'ra-c1-1', 'user-sarah', 'available'),
  response('av-2', 'ra-c1-2', 'user-michael', 'available', 'I may be 10 minutes late.'),
  response('av-3', 'ra-c1-3', 'user-hannah', 'maybe', 'Waiting to confirm childcare.'),
  response('av-4', 'ra-c2-1', 'user-michael', 'available'),
  // ra-c2-2 (Hannah) and ra-c2-3 (Sarah) — not responded yet
  response('av-5', 'ra-c3-1', 'user-sarah', 'available'),
  response('av-6', 'ra-c4-2', 'user-sarah', 'unavailable', 'Away that weekend.'),
  // Rehearsal tracker: mixed responses, Michael not responded yet
  response('av-r1', 'ra-cr1-1', 'user-sarah', 'available'),
  response('av-r2', 'ra-cr1-2', 'user-hannah', 'maybe', 'Depends on my shift ending on time.'),
  response('av-7', 'ra-m1-1', 'user-david', 'available'),
  response('av-8', 'ra-m1-2', 'user-joseph', 'maybe', 'Can serve but need to leave early.'),
  // ra-m1-3 (Michael) — not responded
  response('av-9', 'ra-m2-2', 'user-michael', 'available'),
  response('av-10', 'ra-u1-1', 'user-daniel', 'available'),
];

// ---------------------------------------------------------------------------
// Choir song selections, split into praise and worship sections
// (rota-choir-2 deliberately has none)
// ---------------------------------------------------------------------------

const selection = (
  id: string,
  rota_entry_id: string,
  song_id: string,
  section: SongSection,
  selected_by: string,
  order_index: number,
): ChoirSongSelection => ({
  id,
  rota_entry_id,
  song_id,
  section,
  selected_by,
  order_index,
  notes: null,
});

export const mockSongSelections: ChoirSongSelection[] = [
  // Sunday 1 — praise opens upbeat, worship slows down
  selection('sel-1', 'rota-choir-1', 'song-this-is-amazing-grace', 'praise', 'user-sarah', 0),
  selection('sel-2', 'rota-choir-1', 'song-way-maker', 'worship', 'user-sarah', 0),
  selection('sel-3', 'rota-choir-1', 'song-it-is-well', 'worship', 'user-sarah', 1),
  // Thanksgiving — Sarah picked praise, Michael picked worship
  selection('sel-4', 'rota-choir-3', 'song-give-thanks', 'praise', 'user-sarah', 0),
  selection('sel-5', 'rota-choir-3', 'song-total-praise', 'praise', 'user-sarah', 1),
  selection('sel-6', 'rota-choir-3', 'song-great-is-thy-faithfulness', 'worship', 'user-michael', 0),
];
