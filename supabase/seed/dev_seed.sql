-- ============================================================================
-- Shift Shepherd — development seed
--
-- A faithful port of src/lib/mockData/ into SQL: Grace Community Church,
-- 8 users, 4 teams, 12 categories, 6 base events (3 recurring), 5 announcements, 10 songs,
-- 12 rota entries (incl. two choir rehearsals, one of them cancelled) with
-- Praise/Worship leader assignments + mixed availability, sectioned song
-- selections (rota-choir-2 deliberately has none), chat messages, and default
-- notification preferences.
--
-- Dates are computed relative to seed time (like the mock data generator),
-- so events and rotas are always "upcoming" when you demo.
--
-- AUTH: profiles are seeded with auth_user_id = NULL because auth.users rows
-- cannot be safely created from plain SQL. After creating real Supabase Auth
-- users, link them — see supabase/seed/README.md for the exact process.
--
-- Idempotency: re-running duplicates nothing fatal (fixed UUIDs cause PK
-- conflicts instead). To reset, uncomment the delete below — cascades wipe
-- every dependent row.
-- ============================================================================

begin;

-- delete from public.organisations where id = 'a0000000-0000-4000-a000-000000000001';

-- Next occurrence of a weekday (0=Sun..6=Sat), strictly in the future —
-- mirrors nextWeekday() in src/utils/dates.ts. Temp function: vanishes with
-- the session.
create function pg_temp.next_weekday(target_dow int, weeks_ahead int default 0)
returns date
language sql stable
as $$
  select current_date
       + (case when mod(target_dow - extract(dow from current_date)::int + 7, 7) = 0
               then 7
               else mod(target_dow - extract(dow from current_date)::int + 7, 7)
          end)
       + (weeks_ahead * 7);
$$;

-- ----------------------------------------------------------------------------
-- Fixed UUID scheme (readable, stable across re-seeds):
--   a0…01  organisation          10…01-08  profiles       30…01-04  teams
--   50…01-12  event categories   60…01-06  events         70…01-05  announcements
--   80…01-10  songs              90…01-12  rota entries   91…01-35  assignments
-- Everything else uses gen_random_uuid().
-- ----------------------------------------------------------------------------

-- Organisation ---------------------------------------------------------------

insert into public.organisations (id, name, logo_url, primary_colour) values
  ('a0000000-0000-4000-a000-000000000001', 'Grace Community Church', null, '#2F5FC4');

-- Profiles (auth_user_id linked later — see seed README) ----------------------

insert into public.profiles (id, auth_user_id, organisation_id, full_name, email, phone) values
  ('10000000-0000-4000-a000-000000000001', null, 'a0000000-0000-4000-a000-000000000001', 'Daniel Okafor',    'daniel@gracecommunity.church',  '+44 7700 900101'),
  ('10000000-0000-4000-a000-000000000002', null, 'a0000000-0000-4000-a000-000000000001', 'Miriam Blake',     'miriam@gracecommunity.church',  '+44 7700 900102'),
  ('10000000-0000-4000-a000-000000000003', null, 'a0000000-0000-4000-a000-000000000001', 'Joseph Carter',    'joseph@gracecommunity.church',  '+44 7700 900103'),
  ('10000000-0000-4000-a000-000000000004', null, 'a0000000-0000-4000-a000-000000000001', 'Sarah Williams',   'sarah@gracecommunity.church',   '+44 7700 900104'),
  ('10000000-0000-4000-a000-000000000005', null, 'a0000000-0000-4000-a000-000000000001', 'Hannah Adeyemi',   'hannah@gracecommunity.church',  '+44 7700 900105'),
  ('10000000-0000-4000-a000-000000000006', null, 'a0000000-0000-4000-a000-000000000001', 'Michael Thompson', 'michael@gracecommunity.church', '+44 7700 900106'),
  ('10000000-0000-4000-a000-000000000007', null, 'a0000000-0000-4000-a000-000000000001', 'David Chen',       'david@gracecommunity.church',   '+44 7700 900107'),
  ('10000000-0000-4000-a000-000000000008', null, 'a0000000-0000-4000-a000-000000000001', 'Ruth Johnson',     'ruth@gracecommunity.church',    '+44 7700 900108');

-- Organisation roles ----------------------------------------------------------

insert into public.organisation_roles (organisation_id, user_id, role) values
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'church_admin'),
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', 'announcement_manager'),
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000003', 'event_manager'),
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004', 'general_member'),
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000005', 'general_member'),
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000006', 'general_member'),
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000007', 'general_member'),
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000008', 'general_member');

-- Teams ------------------------------------------------------------------------

insert into public.teams (id, organisation_id, name, description, type) values
  ('30000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001', 'Choir',      'Leading the congregation in worship every Sunday.',        'choir'),
  ('30000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', 'Media',      'Sound, cameras, slides and livestream for services.',      'media'),
  ('30000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000001', 'Ushers',     'Welcoming people and helping services run smoothly.',      'generic'),
  ('30000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000001', 'Youth Team', 'Serving our young people on Friday evenings and Sundays.', 'generic');

-- Team memberships (Ruth deliberately has none — she tests empty states) -------

insert into public.team_memberships (team_id, user_id, role) values
  -- Choir: Sarah leads; Hannah and Michael sing
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004', 'team_leader'),
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000005', 'member'),
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000006', 'member'),
  -- Media: David leads; Joseph and Michael help
  ('30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000007', 'team_leader'),
  ('30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003', 'member'),
  ('30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000006', 'member'),
  -- Ushers: Miriam leads; Daniel and Joseph serve
  ('30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000002', 'team_leader'),
  ('30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', 'member'),
  ('30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000003', 'member'),
  -- Youth Team: Joseph leads; Hannah and David help
  ('30000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000003', 'team_leader'),
  ('30000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000005', 'member'),
  ('30000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000007', 'member');

-- Event categories ---------------------------------------------------------------

insert into public.event_categories (id, organisation_id, name, colour) values
  ('50000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001', 'Service',              '#2F5FC4'),
  ('50000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', 'Rehearsal',            '#6D5BC7'),
  ('50000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000001', 'Prayer Meeting',       '#2F5FC4'),
  ('50000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000001', 'Bible Study',          '#6D5BC7'),
  ('50000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-000000000001', 'Team Meeting',         '#2F5FC4'),
  ('50000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-000000000001', 'Youth Event',          '#6D5BC7'),
  ('50000000-0000-4000-a000-000000000007', 'a0000000-0000-4000-a000-000000000001', 'Children''s Ministry', '#2F5FC4'),
  ('50000000-0000-4000-a000-000000000008', 'a0000000-0000-4000-a000-000000000001', 'Outreach',             '#6D5BC7'),
  ('50000000-0000-4000-a000-000000000009', 'a0000000-0000-4000-a000-000000000001', 'Special Event',        '#2F5FC4'),
  ('50000000-0000-4000-a000-000000000010', 'a0000000-0000-4000-a000-000000000001', 'Conference',           '#6D5BC7'),
  ('50000000-0000-4000-a000-000000000011', 'a0000000-0000-4000-a000-000000000001', 'Social Event',         '#2F5FC4'),
  ('50000000-0000-4000-a000-000000000012', 'a0000000-0000-4000-a000-000000000001', 'Other',                '#6D5BC7');

-- Events (relative dates, like the mock data) --------------------------------------

insert into public.events
  (
    id,
    organisation_id,
    title,
    description,
    category_id,
    start_time,
    end_time,
    location,
    team_id,
    created_by,
    is_recurring,
    recurrence_rule,
    recurrence_label,
    recurrence_end_date
  )
values
  ('60000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001',
   'Sunday Morning Service',
   'Our weekly Sunday morning worship service. Everyone is welcome — doors open at 9:30 for tea and coffee.',
   '50000000-0000-4000-a000-000000000001',
   (pg_temp.next_weekday(0) + time '10:00')::timestamptz,
   (pg_temp.next_weekday(0) + time '12:00')::timestamptz,
   'Main Hall', null, '10000000-0000-4000-a000-000000000003',
   true, 'FREQ=WEEKLY;INTERVAL=1', 'Every Sunday', null),

  ('60000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001',
   'Midweek Bible Study',
   'We continue our study through the book of Philippians. Bring a Bible and a friend.',
   '50000000-0000-4000-a000-000000000004',
   (pg_temp.next_weekday(3) + time '19:00')::timestamptz,
   (pg_temp.next_weekday(3) + time '20:30')::timestamptz,
   'Room 2', null, '10000000-0000-4000-a000-000000000003',
   true, 'FREQ=WEEKLY;INTERVAL=1', 'Every Wednesday', null),

  ('60000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000001',
   'Friday Prayer Meeting',
   'An evening of prayer for our church, our community, and one another.',
   '50000000-0000-4000-a000-000000000003',
   (pg_temp.next_weekday(5) + time '19:30')::timestamptz,
   (pg_temp.next_weekday(5) + time '21:00')::timestamptz,
   'Main Hall', null, '10000000-0000-4000-a000-000000000001',
   true, 'FREQ=WEEKLY;INTERVAL=1', 'Every Friday', null),

  ('60000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000001',
   'Choir Rehearsal',
   'Choir rehearsal ahead of Sunday. Please arrive on time so we can start together.',
   '50000000-0000-4000-a000-000000000002',
   (pg_temp.next_weekday(6) + time '17:00')::timestamptz,
   (pg_temp.next_weekday(6) + time '19:00')::timestamptz,
   'Main Hall', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004',
   false, null, null, null),

  ('60000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-000000000001',
   'Youth Fellowship',
   'Games, food, and a short talk for ages 11–18. Parents are welcome to stay for coffee.',
   '50000000-0000-4000-a000-000000000006',
   (pg_temp.next_weekday(5, 1) + time '18:30')::timestamptz,
   (pg_temp.next_weekday(5, 1) + time '20:30')::timestamptz,
   'Youth Room', '30000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000003',
   false, null, null, null),

  ('60000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-000000000001',
   'Special Thanksgiving Service',
   'A special service of thanksgiving followed by a shared lunch. Please bring a dish to share if you can.',
   '50000000-0000-4000-a000-000000000009',
   (pg_temp.next_weekday(0, 2) + time '10:00')::timestamptz,
   (pg_temp.next_weekday(0, 2) + time '13:00')::timestamptz,
   'Main Hall', null, '10000000-0000-4000-a000-000000000003',
   false, null, null, null);

-- Announcements ---------------------------------------------------------------------

insert into public.announcements
  (id, organisation_id, team_id, title, body, audience, pinned, image_url, linked_event_id, created_by, created_at)
values
  ('70000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001', null,
   'Welcome to Shift Shepherd',
   'Welcome to our new church app! This is where you will find announcements, upcoming events, your team rotas, and team chat — all in one calm place.

Have a look around, and if anything is unclear please ask your team leader. We are so glad you are here.',
   'church', true, null, null,
   '10000000-0000-4000-a000-000000000001', now() - interval '6 days'),

  ('70000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', null,
   'Sunday Service This Week',
   'A warm reminder that our Sunday morning service starts at 10:00 in the Main Hall. Doors open at 9:30 for tea and coffee.

If you are serving on a team this Sunday, please check your rota and confirm your availability in the app.',
   'church', false, null, '60000000-0000-4000-a000-000000000001',
   '10000000-0000-4000-a000-000000000002', now() - interval '1 day'),

  ('70000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000001', null,
   'Special Thanksgiving Service & Shared Lunch',
   'In two weeks we will hold a Special Thanksgiving Service followed by a shared lunch together.

Please bring a dish to share if you can — sign-up sheets are at the welcome desk. Invite family and friends; everyone is welcome!',
   'church', true, 'placeholder', '60000000-0000-4000-a000-000000000006',
   '10000000-0000-4000-a000-000000000002', now() - interval '3 days'),

  ('70000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000001',
   '30000000-0000-4000-a000-000000000001',
   'Rehearsal Moved to 5pm This Saturday',
   'Hello choir! This Saturday’s rehearsal will start at 5:00pm instead of 5:30pm so we have extra time on the new songs before Sunday.

Please check the selected songs on the rota beforehand and come ready to sing!',
   'team', false, null, null,
   '10000000-0000-4000-a000-000000000004', now() - interval '2 days'),

  ('70000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-000000000001',
   '30000000-0000-4000-a000-000000000002',
   'Please Confirm Your Media Rota Slots',
   'Team — the media rota for the next month is now in the app. Please open your assignments and confirm your availability, and add a note if you might be late.

Thank you for serving so faithfully every week.',
   'team', false, null, null,
   '10000000-0000-4000-a000-000000000007', now() - interval '4 days');

-- Songs -------------------------------------------------------------------------------

insert into public.songs
  (id, organisation_id, team_id, title, artist, lyrics, notes, tags, added_by, created_at)
values
  ('80000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Amazing Grace', 'John Newton',
   'Amazing grace! How sweet the sound
That saved a wretch like me!
I once was lost, but now am found;
Was blind, but now I see.

’Twas grace that taught my heart to fear,
And grace my fears relieved;
How precious did that grace appear
The hour I first believed.',
   'Usually sung in G. Verse 1 acapella, band joins from verse 2.',
   array['Worship','Slow','Classic'],
   '10000000-0000-4000-a000-000000000004', now() - interval '40 days'),

  ('80000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Great Is Thy Faithfulness', 'Thomas Chisholm',
   'Great is Thy faithfulness, O God my Father,
There is no shadow of turning with Thee;
Thou changest not, Thy compassions, they fail not;
As Thou hast been Thou forever wilt be.

Great is Thy faithfulness! Great is Thy faithfulness!
Morning by morning new mercies I see.',
   null,
   array['Worship','Slow','Thanksgiving'],
   '10000000-0000-4000-a000-000000000005', now() - interval '35 days'),

  ('80000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Blessed Assurance', 'Fanny Crosby',
   'Blessed assurance, Jesus is mine!
Oh, what a foretaste of glory divine!
Heir of salvation, purchase of God,
Born of His Spirit, washed in His blood.

This is my story, this is my song,
Praising my Saviour all the day long.',
   null,
   array['Praise','Classic'],
   '10000000-0000-4000-a000-000000000006', now() - interval '32 days'),

  ('80000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'It Is Well With My Soul', 'Horatio Spafford',
   'When peace like a river attendeth my way,
When sorrows like sea billows roll;
Whatever my lot, Thou hast taught me to say,
It is well, it is well with my soul.',
   null,
   array['Worship','Slow','Communion'],
   '10000000-0000-4000-a000-000000000004', now() - interval '30 days'),

  ('80000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Way Maker', 'Sinach',
   'Full lyrics to be added by the choir.

(Use the Edit button to paste the lyrics here so everyone can practise from the app.)',
   'Congregation favourite. Key of E.',
   array['Worship','Slow'],
   '10000000-0000-4000-a000-000000000005', now() - interval '25 days'),

  ('80000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Goodness of God', 'Bethel Music',
   'Full lyrics to be added by the choir.

(Use the Edit button to paste the lyrics here so everyone can practise from the app.)',
   null,
   array['Worship','Thanksgiving','Slow'],
   '10000000-0000-4000-a000-000000000006', now() - interval '22 days'),

  ('80000000-0000-4000-a000-000000000007', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'What a Beautiful Name', 'Hillsong Worship',
   'Full lyrics to be added by the choir.

(Use the Edit button to paste the lyrics here so everyone can practise from the app.)',
   null,
   array['Worship','Slow'],
   '10000000-0000-4000-a000-000000000004', now() - interval '20 days'),

  ('80000000-0000-4000-a000-000000000008', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'This Is Amazing Grace', 'Phil Wickham',
   'Full lyrics to be added by the choir.

(Use the Edit button to paste the lyrics here so everyone can practise from the app.)',
   'Great opener — upbeat.',
   array['Praise','Fast'],
   '10000000-0000-4000-a000-000000000005', now() - interval '18 days'),

  ('80000000-0000-4000-a000-000000000009', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Total Praise', 'Richard Smallwood',
   'Full lyrics to be added by the choir.

(Use the Edit button to paste the lyrics here so everyone can practise from the app.)',
   'Four-part harmony — needs rehearsal before Sunday.',
   array['Praise','Choir Piece'],
   '10000000-0000-4000-a000-000000000006', now() - interval '15 days'),

  ('80000000-0000-4000-a000-000000000010', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Give Thanks', 'Don Moen',
   'Full lyrics to be added by the choir.

(Use the Edit button to paste the lyrics here so everyone can practise from the app.)',
   null,
   array['Thanksgiving','Slow','Communion'],
   '10000000-0000-4000-a000-000000000004', now() - interval '12 days');

-- Song links -----------------------------------------------------------------------------

insert into public.song_links (song_id, platform, url) values
  ('80000000-0000-4000-a000-000000000001', 'YouTube',     'https://www.youtube.com/results?search_query=amazing+grace'),
  ('80000000-0000-4000-a000-000000000001', 'Spotify',     'https://open.spotify.com/search/amazing%20grace'),
  ('80000000-0000-4000-a000-000000000002', 'YouTube',     'https://www.youtube.com/results?search_query=great+is+thy+faithfulness'),
  ('80000000-0000-4000-a000-000000000003', 'YouTube',     'https://www.youtube.com/results?search_query=blessed+assurance'),
  ('80000000-0000-4000-a000-000000000004', 'YouTube',     'https://www.youtube.com/results?search_query=it+is+well+with+my+soul'),
  ('80000000-0000-4000-a000-000000000004', 'Apple Music', 'https://music.apple.com/search?term=it%20is%20well%20with%20my%20soul'),
  ('80000000-0000-4000-a000-000000000005', 'YouTube',     'https://www.youtube.com/results?search_query=way+maker+sinach'),
  ('80000000-0000-4000-a000-000000000005', 'Spotify',     'https://open.spotify.com/search/way%20maker'),
  ('80000000-0000-4000-a000-000000000006', 'Spotify',     'https://open.spotify.com/search/goodness%20of%20god'),
  ('80000000-0000-4000-a000-000000000007', 'YouTube',     'https://www.youtube.com/results?search_query=what+a+beautiful+name'),
  ('80000000-0000-4000-a000-000000000007', 'Apple Music', 'https://music.apple.com/search?term=what%20a%20beautiful%20name'),
  ('80000000-0000-4000-a000-000000000008', 'YouTube',     'https://www.youtube.com/results?search_query=this+is+amazing+grace'),
  ('80000000-0000-4000-a000-000000000009', 'YouTube',     'https://www.youtube.com/results?search_query=total+praise+richard+smallwood'),
  ('80000000-0000-4000-a000-000000000010', 'YouTube',     'https://www.youtube.com/results?search_query=give+thanks+don+moen'),
  ('80000000-0000-4000-a000-000000000010', 'Spotify',     'https://open.spotify.com/search/give%20thanks%20don%20moen');

-- Rota entries ----------------------------------------------------------------------------
-- Choir services 01-04, Media 05-08, Ushers 09-10, Choir rehearsals 11-12
-- (12 is cancelled — kept visible instead of deleted).

insert into public.rota_entries
  (id, organisation_id, team_id, title, date, time, notes, created_by)
values
  ('90000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Sunday Morning Service', pg_temp.next_weekday(0), '09:15', 'Please arrive by 9:15 for warm-up.', '10000000-0000-4000-a000-000000000004'),
  ('90000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Sunday Morning Service', pg_temp.next_weekday(0, 1), '09:15', null, '10000000-0000-4000-a000-000000000004'),
  ('90000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Special Thanksgiving Service', pg_temp.next_weekday(0, 2), '09:00', 'Extra warm-up — two new songs this week.', '10000000-0000-4000-a000-000000000004'),
  ('90000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Sunday Morning Service', pg_temp.next_weekday(0, 3), '09:15', null, '10000000-0000-4000-a000-000000000004'),

  ('90000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002',
   'Sunday Morning Service', pg_temp.next_weekday(0), '09:00', 'Sound check at 9:00 sharp.', '10000000-0000-4000-a000-000000000007'),
  ('90000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002',
   'Sunday Morning Service', pg_temp.next_weekday(0, 1), '09:00', null, '10000000-0000-4000-a000-000000000007'),
  ('90000000-0000-4000-a000-000000000007', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002',
   'Special Thanksgiving Service', pg_temp.next_weekday(0, 2), '08:45', 'Extra camera for the shared lunch photos.', '10000000-0000-4000-a000-000000000007'),
  ('90000000-0000-4000-a000-000000000008', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002',
   'Sunday Morning Service', pg_temp.next_weekday(0, 3), '09:00', null, '10000000-0000-4000-a000-000000000007'),

  ('90000000-0000-4000-a000-000000000009', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000003',
   'Sunday Morning Service', pg_temp.next_weekday(0), '09:15', 'Doors open at 9:30.', '10000000-0000-4000-a000-000000000002'),
  ('90000000-0000-4000-a000-000000000010', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000003',
   'Special Thanksgiving Service', pg_temp.next_weekday(0, 2), '09:00', 'Expecting extra visitors — warm welcome please!', '10000000-0000-4000-a000-000000000002');

-- Choir rehearsals: 11 is active, 12 is cancelled (marked, not deleted).
insert into public.rota_entries
  (id, organisation_id, team_id, title, date, time, notes, created_by)
values
  ('90000000-0000-4000-a000-000000000011', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Choir Rehearsal', pg_temp.next_weekday(6), '17:00', 'Working on the new songs for Thanksgiving.', '10000000-0000-4000-a000-000000000004');

insert into public.rota_entries
  (id, organisation_id, team_id, title, date, time, notes, created_by,
   status, cancelled_at, cancelled_by, cancellation_reason)
values
  ('90000000-0000-4000-a000-000000000012', 'a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Choir Rehearsal', pg_temp.next_weekday(6, 1), '17:00', null, '10000000-0000-4000-a000-000000000004',
   'cancelled', now() - interval '1 day', '10000000-0000-4000-a000-000000000004',
   'The main hall is being used for the community fair that evening.');

-- Rota assignments ---------------------------------------------------------------------------
-- 'Praise Leader' / 'Worship Leader' (and legacy 'Song Leader') are the role
-- names the app and RLS treat as significant for song selection.

insert into public.rota_assignments (id, rota_entry_id, user_id, role_name) values
  -- Choir Sunday 1 — Sarah leads BOTH sections; songs selected
  ('91000000-0000-4000-a000-000000000001', '90000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004', 'Praise Leader'),
  ('91000000-0000-4000-a000-000000000029', '90000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004', 'Worship Leader'),
  ('91000000-0000-4000-a000-000000000002', '90000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000006', 'Backup Vocal'),
  ('91000000-0000-4000-a000-000000000003', '90000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000005', 'Choir Member'),
  -- Choir Sunday 2 — Michael: Praise, Hannah: Worship, NO songs selected (tests the flow)
  ('91000000-0000-4000-a000-000000000004', '90000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000006', 'Praise Leader'),
  ('91000000-0000-4000-a000-000000000005', '90000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000005', 'Worship Leader'),
  ('91000000-0000-4000-a000-000000000006', '90000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000004', 'Choir Member'),
  -- Choir Thanksgiving — Sarah: Praise, Michael: Worship
  ('91000000-0000-4000-a000-000000000007', '90000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', 'Praise Leader'),
  ('91000000-0000-4000-a000-000000000008', '90000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000005', 'Backup Vocal'),
  ('91000000-0000-4000-a000-000000000009', '90000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000006', 'Worship Leader'),
  -- Choir Sunday 4 — Hannah: Praise, Sarah: Worship
  ('91000000-0000-4000-a000-000000000010', '90000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000005', 'Praise Leader'),
  ('91000000-0000-4000-a000-000000000011', '90000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000006', 'Choir Member'),
  ('91000000-0000-4000-a000-000000000012', '90000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000004', 'Worship Leader'),
  -- Choir rehearsal (11) — every choir member expected, so all can confirm availability
  ('91000000-0000-4000-a000-000000000030', '90000000-0000-4000-a000-000000000011', '10000000-0000-4000-a000-000000000004', 'Choir Member'),
  ('91000000-0000-4000-a000-000000000031', '90000000-0000-4000-a000-000000000011', '10000000-0000-4000-a000-000000000005', 'Choir Member'),
  ('91000000-0000-4000-a000-000000000032', '90000000-0000-4000-a000-000000000011', '10000000-0000-4000-a000-000000000006', 'Choir Member'),
  -- Cancelled rehearsal (12) — assignments kept for history
  ('91000000-0000-4000-a000-000000000033', '90000000-0000-4000-a000-000000000012', '10000000-0000-4000-a000-000000000004', 'Choir Member'),
  ('91000000-0000-4000-a000-000000000034', '90000000-0000-4000-a000-000000000012', '10000000-0000-4000-a000-000000000005', 'Choir Member'),
  ('91000000-0000-4000-a000-000000000035', '90000000-0000-4000-a000-000000000012', '10000000-0000-4000-a000-000000000006', 'Choir Member'),
  -- Media
  ('91000000-0000-4000-a000-000000000013', '90000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000007', 'Sound'),
  ('91000000-0000-4000-a000-000000000014', '90000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000003', 'Camera'),
  ('91000000-0000-4000-a000-000000000015', '90000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000006', 'Slides'),
  ('91000000-0000-4000-a000-000000000016', '90000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000003', 'Sound'),
  ('91000000-0000-4000-a000-000000000017', '90000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000006', 'Camera'),
  ('91000000-0000-4000-a000-000000000018', '90000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000007', 'Livestream'),
  ('91000000-0000-4000-a000-000000000019', '90000000-0000-4000-a000-000000000007', '10000000-0000-4000-a000-000000000007', 'Sound'),
  ('91000000-0000-4000-a000-000000000020', '90000000-0000-4000-a000-000000000007', '10000000-0000-4000-a000-000000000003', 'Camera'),
  ('91000000-0000-4000-a000-000000000021', '90000000-0000-4000-a000-000000000007', '10000000-0000-4000-a000-000000000006', 'Livestream'),
  ('91000000-0000-4000-a000-000000000022', '90000000-0000-4000-a000-000000000008', '10000000-0000-4000-a000-000000000006', 'Sound'),
  ('91000000-0000-4000-a000-000000000023', '90000000-0000-4000-a000-000000000008', '10000000-0000-4000-a000-000000000007', 'Slides'),
  ('91000000-0000-4000-a000-000000000024', '90000000-0000-4000-a000-000000000008', '10000000-0000-4000-a000-000000000003', 'Livestream'),
  -- Ushers
  ('91000000-0000-4000-a000-000000000025', '90000000-0000-4000-a000-000000000009', '10000000-0000-4000-a000-000000000001', 'Front Door'),
  ('91000000-0000-4000-a000-000000000026', '90000000-0000-4000-a000-000000000009', '10000000-0000-4000-a000-000000000003', 'Offering'),
  ('91000000-0000-4000-a000-000000000027', '90000000-0000-4000-a000-000000000010', '10000000-0000-4000-a000-000000000002', 'Front Door'),
  ('91000000-0000-4000-a000-000000000028', '90000000-0000-4000-a000-000000000010', '10000000-0000-4000-a000-000000000001', 'Offering');

-- Availability responses (mixed; missing row = "not responded") --------------------------------

insert into public.availability_responses (rota_assignment_id, user_id, status, note) values
  ('91000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004', 'available',   null),
  ('91000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000006', 'available',   'I may be 10 minutes late.'),
  ('91000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000005', 'maybe',       'Waiting to confirm childcare.'),
  ('91000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000006', 'available',   null),
  ('91000000-0000-4000-a000-000000000007', '10000000-0000-4000-a000-000000000004', 'available',   null),
  ('91000000-0000-4000-a000-000000000012', '10000000-0000-4000-a000-000000000004', 'unavailable', 'Away that weekend.'),
  ('91000000-0000-4000-a000-000000000013', '10000000-0000-4000-a000-000000000007', 'available',   null),
  ('91000000-0000-4000-a000-000000000014', '10000000-0000-4000-a000-000000000003', 'maybe',       'Can serve but need to leave early.'),
  ('91000000-0000-4000-a000-000000000017', '10000000-0000-4000-a000-000000000006', 'available',   null),
  ('91000000-0000-4000-a000-000000000025', '10000000-0000-4000-a000-000000000001', 'available',   null),
  -- Rehearsal tracker: Sarah available, Hannah maybe, Michael not responded
  ('91000000-0000-4000-a000-000000000030', '10000000-0000-4000-a000-000000000004', 'available',   null),
  ('91000000-0000-4000-a000-000000000031', '10000000-0000-4000-a000-000000000005', 'maybe',       'Depends on my shift ending on time.');

-- Choir song selections, split into praise/worship sections -------------------------------------
-- (rota-choir-2 deliberately has none; order_index restarts per section)

insert into public.choir_rota_song_selections (rota_entry_id, song_id, section, selected_by, order_index) values
  -- Sunday 1 — praise opens upbeat, worship slows down (Sarah picked both)
  ('90000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000008', 'praise',  '10000000-0000-4000-a000-000000000004', 0),
  ('90000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000005', 'worship', '10000000-0000-4000-a000-000000000004', 0),
  ('90000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000004', 'worship', '10000000-0000-4000-a000-000000000004', 1),
  -- Thanksgiving — Sarah picked praise, Michael picked worship
  ('90000000-0000-4000-a000-000000000003', '80000000-0000-4000-a000-000000000010', 'praise',  '10000000-0000-4000-a000-000000000004', 0),
  ('90000000-0000-4000-a000-000000000003', '80000000-0000-4000-a000-000000000009', 'praise',  '10000000-0000-4000-a000-000000000004', 1),
  ('90000000-0000-4000-a000-000000000003', '80000000-0000-4000-a000-000000000002', 'worship', '10000000-0000-4000-a000-000000000006', 0);

-- Chat messages -----------------------------------------------------------------------------------

insert into public.chat_messages (organisation_id, team_id, sender_id, body, created_at) values
  -- Choir
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004',
   'Hi everyone! Rehearsal this Saturday starts at 5pm, not 5:30 — see the announcement for details.', now() - interval '30 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000005',
   'Thanks Sarah, see you there!', now() - interval '29 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000006',
   'I have picked most of the songs for the Sunday I am leading — will finish the list tonight.', now() - interval '26 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004',
   'Wonderful. Remember you can attach them straight to the rota in the app.', now() - interval '25 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000005',
   'Could we run Total Praise one more time on Saturday? The harmonies in the bridge are still tricky.', now() - interval '8 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000004',
   'Good idea Hannah, we will make time for it.', now() - interval '6 hours'),
  -- Media
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000007',
   'Rota for the next month is up — please confirm your availability when you get a chance.', now() - interval '50 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003',
   'Done. I might need to leave early this Sunday, added a note.', now() - interval '48 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000006',
   'New slides template is ready for Sunday. Looks much cleaner!', now() - interval '20 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000007',
   'Great work Michael. Sound check at 9:00 sharp please, everyone.', now() - interval '18 hours'),
  -- Ushers
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000002',
   'Reminder: doors open at 9:30 this Sunday. Please be at the front door by 9:15.', now() - interval '40 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001',
   'I will bring the new welcome leaflets.', now() - interval '38 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000003',
   'Perfect, thank you both!', now() - interval '36 hours'),
  -- Youth Team
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000003',
   'Youth Fellowship next Friday — who can help with setup from 5:30?', now() - interval '44 hours'),
  ('a0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000005',
   'I can be there from 5:30. 👍', now() - interval '42 hours');

-- Notification preferences (defaults: everything on) ------------------------------------------------

insert into public.notification_preferences (user_id) values
  ('10000000-0000-4000-a000-000000000001'),
  ('10000000-0000-4000-a000-000000000002'),
  ('10000000-0000-4000-a000-000000000003'),
  ('10000000-0000-4000-a000-000000000004'),
  ('10000000-0000-4000-a000-000000000005'),
  ('10000000-0000-4000-a000-000000000006'),
  ('10000000-0000-4000-a000-000000000007'),
  ('10000000-0000-4000-a000-000000000008');

commit;
