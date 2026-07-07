/**
 * Mock announcements — church-wide and team-specific.
 * TODO: wire to Supabase — `announcements` table.
 */
import { Announcement } from '../../types';
import { daysAgo, iso } from '../../utils/dates';
import { ORG_ID } from './people';

const announcement = (
  id: string,
  title: string,
  body: string,
  created_by: string,
  createdDaysAgo: number,
  opts: Partial<Announcement> = {},
): Announcement => ({
  id,
  organisation_id: ORG_ID,
  team_id: null,
  title,
  body,
  audience: opts.team_id ? 'team' : 'church',
  pinned: false,
  image_url: null,
  linked_event_id: null,
  created_by,
  created_at: iso(daysAgo(createdDaysAgo, 9 + createdDaysAgo)),
  updated_at: iso(daysAgo(createdDaysAgo, 9 + createdDaysAgo)),
  ...opts,
});

export const mockAnnouncements: Announcement[] = [
  announcement(
    'ann-welcome',
    'Welcome to Shift Shepherd',
    'Welcome to our new church app! This is where you will find announcements, upcoming events, your team rotas, and team chat — all in one calm place.\n\nHave a look around, and if anything is unclear please ask your team leader. We are so glad you are here.',
    'user-daniel',
    6,
    { pinned: true },
  ),
  announcement(
    'ann-sunday-reminder',
    'Sunday Service This Week',
    'A warm reminder that our Sunday morning service starts at 10:00 in the Main Hall. Doors open at 9:30 for tea and coffee.\n\nIf you are serving on a team this Sunday, please check your rota and confirm your availability in the app.',
    'user-miriam',
    1,
    { linked_event_id: 'event-sunday-service' },
  ),
  announcement(
    'ann-thanksgiving',
    'Special Thanksgiving Service & Shared Lunch',
    'In two weeks we will hold a Special Thanksgiving Service followed by a shared lunch together.\n\nPlease bring a dish to share if you can — sign-up sheets are at the welcome desk. Invite family and friends; everyone is welcome!',
    'user-miriam',
    3,
    { pinned: true, linked_event_id: 'event-thanksgiving', image_url: 'placeholder' },
  ),
  announcement(
    'ann-choir-rehearsal',
    'Rehearsal Moved to 5pm This Saturday',
    'Hello choir! This Saturday’s rehearsal will start at 5:00pm instead of 5:30pm so we have extra time on the new songs before Sunday.\n\nPlease check the selected songs on the rota beforehand and come ready to sing!',
    'user-sarah',
    2,
    { team_id: 'team-choir' },
  ),
  announcement(
    'ann-media-rota',
    'Please Confirm Your Media Rota Slots',
    'Team — the media rota for the next month is now in the app. Please open your assignments and confirm your availability, and add a note if you might be late.\n\nThank you for serving so faithfully every week.',
    'user-david',
    4,
    { team_id: 'team-media' },
  ),
];
