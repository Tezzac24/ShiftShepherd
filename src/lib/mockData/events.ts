/**
 * Mock event categories and church-wide events.
 * Dates are generated relative to "today" so the calendar always has
 * upcoming events when the scaffold is demoed.
 * TODO: wire to Supabase — `event_categories` and `events` tables.
 */
import { Event, EventCategory, EventCategoryName } from '../../types';
import { at, daysAgo, iso, nextWeekday } from '../../utils/dates';
import { ORG_ID } from './people';

const categoryNames: EventCategoryName[] = [
  'Service',
  'Rehearsal',
  'Prayer Meeting',
  'Bible Study',
  'Team Meeting',
  'Youth Event',
  "Children's Ministry",
  'Outreach',
  'Special Event',
  'Conference',
  'Social Event',
  'Other',
];

export const mockCategories: EventCategory[] = categoryNames.map((name, i) => ({
  id: `cat-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  organisation_id: ORG_ID,
  name,
  colour: ['#2F5FC4', '#6D5BC7'][i % 2],
}));

export const categoryId = (name: EventCategoryName): string =>
  mockCategories.find((c) => c.name === name)!.id;

const event = (
  id: string,
  title: string,
  category: EventCategoryName,
  start: Date,
  end: Date,
  location: string,
  description: string,
  created_by: string,
  team_id: string | null = null,
): Event => ({
  id,
  organisation_id: ORG_ID,
  title,
  description,
  category_id: categoryId(category),
  start_time: iso(start),
  end_time: iso(end),
  location,
  team_id,
  created_by,
  created_at: iso(daysAgo(14)),
  updated_at: iso(daysAgo(14)),
});

const sunday = nextWeekday(0);
const wednesday = nextWeekday(3);
const friday = nextWeekday(5);
const saturday = nextWeekday(6);
const nextFriday = nextWeekday(5, 1);
const thanksgivingSunday = nextWeekday(0, 2);

export const mockEvents: Event[] = [
  event(
    'event-sunday-service',
    'Sunday Morning Service',
    'Service',
    at(sunday, 10, 0),
    at(sunday, 12, 0),
    'Main Hall',
    'Our weekly Sunday morning worship service. Everyone is welcome — doors open at 9:30 for tea and coffee.',
    'user-joseph',
  ),
  event(
    'event-bible-study',
    'Midweek Bible Study',
    'Bible Study',
    at(wednesday, 19, 0),
    at(wednesday, 20, 30),
    'Room 2',
    'We continue our study through the book of Philippians. Bring a Bible and a friend.',
    'user-joseph',
  ),
  event(
    'event-prayer-meeting',
    'Friday Prayer Meeting',
    'Prayer Meeting',
    at(friday, 19, 30),
    at(friday, 21, 0),
    'Main Hall',
    'An evening of prayer for our church, our community, and one another.',
    'user-daniel',
  ),
  event(
    'event-choir-rehearsal',
    'Choir Rehearsal',
    'Rehearsal',
    at(saturday, 17, 0),
    at(saturday, 19, 0),
    'Main Hall',
    'Weekly choir rehearsal ahead of Sunday. Please arrive on time so we can start together.',
    'user-sarah',
    'team-choir',
  ),
  event(
    'event-youth-fellowship',
    'Youth Fellowship',
    'Youth Event',
    at(nextFriday, 18, 30),
    at(nextFriday, 20, 30),
    'Youth Room',
    'Games, food, and a short talk for ages 11–18. Parents are welcome to stay for coffee.',
    'user-joseph',
    'team-youth',
  ),
  event(
    'event-thanksgiving',
    'Special Thanksgiving Service',
    'Special Event',
    at(thanksgivingSunday, 10, 0),
    at(thanksgivingSunday, 13, 0),
    'Main Hall',
    'A special service of thanksgiving followed by a shared lunch. Please bring a dish to share if you can.',
    'user-joseph',
  ),
];
