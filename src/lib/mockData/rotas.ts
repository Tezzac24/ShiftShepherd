/**
 * Mock rota entries, assignments, availability responses, and choir song
 * selections. Dates are relative to "today" so rotas are always upcoming.
 *
 * Test setup highlights:
 *  - rota-choir-2 is led by Michael Thompson and has NO selected songs, so
 *    the "assigned song leader selects songs" flow can be tested end-to-end.
 *  - Availability responses are mixed (available / unavailable / maybe /
 *    not responded) with optional notes on some.
 *
 * TODO: wire to Supabase — `rota_entries`, `rota_assignments`,
 * `availability_responses`, `choir_rota_song_selections` tables.
 */
import {
  AvailabilityResponse,
  AvailabilityStatus,
  ChoirSongSelection,
  RotaAssignment,
  RotaEntry,
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

// ---------------------------------------------------------------------------
// Choir rota
// ---------------------------------------------------------------------------

export const mockRotaEntries: RotaEntry[] = [
  entry('rota-choir-1', 'team-choir', 'Sunday Morning Service', sunday1, '09:15', 'Please arrive by 9:15 for warm-up.', 'user-sarah'),
  entry('rota-choir-2', 'team-choir', 'Sunday Morning Service', sunday2, '09:15', null, 'user-sarah'),
  entry('rota-choir-3', 'team-choir', 'Special Thanksgiving Service', sunday3, '09:00', 'Extra warm-up — two new songs this week.', 'user-sarah'),
  entry('rota-choir-4', 'team-choir', 'Sunday Morning Service', sunday4, '09:15', null, 'user-sarah'),

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
  // Choir — Sunday 1 (led by Sarah, songs already selected)
  assignment('ra-c1-1', 'rota-choir-1', 'user-sarah', 'Song Leader'),
  assignment('ra-c1-2', 'rota-choir-1', 'user-michael', 'Backup Vocal'),
  assignment('ra-c1-3', 'rota-choir-1', 'user-hannah', 'Choir Member'),

  // Choir — Sunday 2 (led by Michael, NO songs selected — test the flow here)
  assignment('ra-c2-1', 'rota-choir-2', 'user-michael', 'Song Leader'),
  assignment('ra-c2-2', 'rota-choir-2', 'user-hannah', 'Backup Vocal'),
  assignment('ra-c2-3', 'rota-choir-2', 'user-sarah', 'Choir Member'),

  // Choir — Thanksgiving (led by Sarah)
  assignment('ra-c3-1', 'rota-choir-3', 'user-sarah', 'Song Leader'),
  assignment('ra-c3-2', 'rota-choir-3', 'user-hannah', 'Backup Vocal'),
  assignment('ra-c3-3', 'rota-choir-3', 'user-michael', 'Choir Member'),

  // Choir — Sunday 4 (led by Hannah)
  assignment('ra-c4-1', 'rota-choir-4', 'user-hannah', 'Song Leader'),
  assignment('ra-c4-2', 'rota-choir-4', 'user-michael', 'Backup Vocal'),
  assignment('ra-c4-3', 'rota-choir-4', 'user-sarah', 'Choir Member'),

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
  response('av-6', 'ra-c4-3', 'user-sarah', 'unavailable', 'Away that weekend.'),
  response('av-7', 'ra-m1-1', 'user-david', 'available'),
  response('av-8', 'ra-m1-2', 'user-joseph', 'maybe', 'Can serve but need to leave early.'),
  // ra-m1-3 (Michael) — not responded
  response('av-9', 'ra-m2-2', 'user-michael', 'available'),
  response('av-10', 'ra-u1-1', 'user-daniel', 'available'),
];

// ---------------------------------------------------------------------------
// Choir song selections (rota-choir-2 deliberately has none)
// ---------------------------------------------------------------------------

const selection = (
  id: string,
  rota_entry_id: string,
  song_id: string,
  selected_by: string,
  order_index: number,
): ChoirSongSelection => ({ id, rota_entry_id, song_id, selected_by, order_index, notes: null });

export const mockSongSelections: ChoirSongSelection[] = [
  selection('sel-1', 'rota-choir-1', 'song-this-is-amazing-grace', 'user-sarah', 0),
  selection('sel-2', 'rota-choir-1', 'song-way-maker', 'user-sarah', 1),
  selection('sel-3', 'rota-choir-1', 'song-it-is-well', 'user-sarah', 2),
  selection('sel-4', 'rota-choir-3', 'song-give-thanks', 'user-sarah', 0),
  selection('sel-5', 'rota-choir-3', 'song-great-is-thy-faithfulness', 'user-sarah', 1),
  selection('sel-6', 'rota-choir-3', 'song-total-praise', 'user-sarah', 2),
];
