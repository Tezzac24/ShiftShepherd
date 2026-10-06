import type { useAppData } from '../../../lib/appData/AppDataContext';
import { ChoirSongSelection, Song } from '../../../types';
import { entry, makeData, profile, singer, team } from '../../rota/__tests__/rotaFixtures';

export { admin, assignments, deferred, entry, member, profile, singer, team } from '../../rota/__tests__/rotaFixtures';

export const song: Song = {
  id: 'song-1', team_id: team.id, organisation_id: profile.organisation_id, title: 'Alpha song', artist: 'Our choir',
  lyrics: 'First line\nSecond line\n\nA new verse', notes: 'Begin softly.', tags: ['Praise', 'Custom retained tag'],
  links: [{ id: 'link-1', song_id: 'song-1', platform: 'YouTube', url: 'https://example.test/song' }],
  added_by: singer.id, created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-02T09:00:00Z',
};
export const secondSong: Song = { ...song, id: 'song-2', title: 'Beta song', artist: 'Another artist', tags: ['Worship'], links: [], notes: null };
export const thirdSong: Song = { ...song, id: 'song-3', title: 'Gamma song', tags: [], links: [] };
export const selections: ChoirSongSelection[] = [
  { id: 'selection-1', rota_entry_id: entry.id, song_id: song.id, section: 'praise', selected_by: singer.id, order_index: 0, notes: 'Existing selection note' },
  { id: 'selection-3', rota_entry_id: entry.id, song_id: thirdSong.id, section: 'worship', selected_by: singer.id, order_index: 0, notes: null },
];

export function makeChoirData(patch: Partial<ReturnType<typeof useAppData>> = {}) {
  return makeData({ songs: [song, secondSong, thirdSong], songSelections: selections,
    addSong: jest.fn(async () => ({ ...song, id: 'new-song' })), updateSong: jest.fn(async () => undefined), deleteSong: jest.fn(async () => undefined),
    setSongSelections: jest.fn(async () => undefined), ...patch });
}
