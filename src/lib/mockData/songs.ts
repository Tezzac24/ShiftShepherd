/**
 * Mock choir song database.
 * Public-domain hymns include a verse; modern songs use placeholder lyrics
 * to avoid reproducing copyrighted text in the scaffold.
 * TODO: wire to Supabase — `songs` and `song_links` tables.
 */
import { Song, SongLink, SongPlatform } from '../../types';
import { daysAgo, iso } from '../../utils/dates';
import { ORG_ID } from './people';

const link = (song_id: string, platform: SongPlatform, url: string, i: number): SongLink => ({
  id: `${song_id}-link-${i}`,
  song_id,
  platform,
  url,
});

const song = (
  id: string,
  title: string,
  artist: string | null,
  lyrics: string,
  tags: string[],
  added_by: string,
  createdDaysAgo: number,
  links: { platform: SongPlatform; url: string }[],
  notes: string | null = null,
): Song => ({
  id,
  organisation_id: ORG_ID,
  team_id: 'team-choir',
  title,
  artist,
  lyrics,
  notes,
  tags,
  links: links.map((l, i) => link(id, l.platform, l.url, i + 1)),
  added_by,
  created_at: iso(daysAgo(createdDaysAgo)),
  updated_at: iso(daysAgo(createdDaysAgo)),
});

const PLACEHOLDER_LYRICS =
  'Full lyrics to be added by the choir.\n\n(Use the Edit button to paste the lyrics here so everyone can practise from the app.)';

export const mockSongs: Song[] = [
  song(
    'song-amazing-grace',
    'Amazing Grace',
    'John Newton',
    'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n’Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.',
    ['Worship', 'Slow', 'Classic'],
    'user-sarah',
    40,
    [
      { platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=amazing+grace' },
      { platform: 'Spotify', url: 'https://open.spotify.com/search/amazing%20grace' },
    ],
    'Usually sung in G. Verse 1 acapella, band joins from verse 2.',
  ),
  song(
    'song-great-is-thy-faithfulness',
    'Great Is Thy Faithfulness',
    'Thomas Chisholm',
    'Great is Thy faithfulness, O God my Father,\nThere is no shadow of turning with Thee;\nThou changest not, Thy compassions, they fail not;\nAs Thou hast been Thou forever wilt be.\n\nGreat is Thy faithfulness! Great is Thy faithfulness!\nMorning by morning new mercies I see.',
    ['Worship', 'Slow', 'Thanksgiving'],
    'user-hannah',
    35,
    [{ platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=great+is+thy+faithfulness' }],
  ),
  song(
    'song-blessed-assurance',
    'Blessed Assurance',
    'Fanny Crosby',
    'Blessed assurance, Jesus is mine!\nOh, what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.\n\nThis is my story, this is my song,\nPraising my Saviour all the day long.',
    ['Praise', 'Classic'],
    'user-michael',
    32,
    [{ platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=blessed+assurance' }],
  ),
  song(
    'song-it-is-well',
    'It Is Well With My Soul',
    'Horatio Spafford',
    'When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.',
    ['Worship', 'Slow', 'Communion'],
    'user-sarah',
    30,
    [
      { platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=it+is+well+with+my+soul' },
      { platform: 'Apple Music', url: 'https://music.apple.com/search?term=it%20is%20well%20with%20my%20soul' },
    ],
  ),
  song(
    'song-way-maker',
    'Way Maker',
    'Sinach',
    PLACEHOLDER_LYRICS,
    ['Worship', 'Slow'],
    'user-hannah',
    25,
    [
      { platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=way+maker+sinach' },
      { platform: 'Spotify', url: 'https://open.spotify.com/search/way%20maker' },
    ],
    'Congregation favourite. Key of E.',
  ),
  song(
    'song-goodness-of-god',
    'Goodness of God',
    'Bethel Music',
    PLACEHOLDER_LYRICS,
    ['Worship', 'Thanksgiving', 'Slow'],
    'user-michael',
    22,
    [{ platform: 'Spotify', url: 'https://open.spotify.com/search/goodness%20of%20god' }],
  ),
  song(
    'song-what-a-beautiful-name',
    'What a Beautiful Name',
    'Hillsong Worship',
    PLACEHOLDER_LYRICS,
    ['Worship', 'Slow'],
    'user-sarah',
    20,
    [
      { platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=what+a+beautiful+name' },
      { platform: 'Apple Music', url: 'https://music.apple.com/search?term=what%20a%20beautiful%20name' },
    ],
  ),
  song(
    'song-this-is-amazing-grace',
    'This Is Amazing Grace',
    'Phil Wickham',
    PLACEHOLDER_LYRICS,
    ['Praise', 'Fast'],
    'user-hannah',
    18,
    [{ platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=this+is+amazing+grace' }],
    'Great opener — upbeat.',
  ),
  song(
    'song-total-praise',
    'Total Praise',
    'Richard Smallwood',
    PLACEHOLDER_LYRICS,
    ['Praise', 'Choir Piece'],
    'user-michael',
    15,
    [{ platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=total+praise+richard+smallwood' }],
    'Four-part harmony — needs rehearsal before Sunday.',
  ),
  song(
    'song-give-thanks',
    'Give Thanks',
    'Don Moen',
    PLACEHOLDER_LYRICS,
    ['Thanksgiving', 'Slow', 'Communion'],
    'user-sarah',
    12,
    [
      { platform: 'YouTube', url: 'https://www.youtube.com/results?search_query=give+thanks+don+moen' },
      { platform: 'Spotify', url: 'https://open.spotify.com/search/give%20thanks%20don%20moen' },
    ],
  ),
];

/** Suggested tags offered when adding/editing a song. */
export const suggestedSongTags = [
  'Worship',
  'Praise',
  'Slow',
  'Fast',
  'Communion',
  'Thanksgiving',
  'Classic',
  'Choir Piece',
];
