import { matchingSong, moveSong, songDraft, songsForChoir, validateSongDraft } from '../choirPresentation';
import { secondSong, song, team } from './choirFixtures';

describe('choir presentation helpers', () => {
  it('requires both the song owner and organisation to match the route', () => {
    const songs = [song, { ...secondSong, organisation_id: 'elsewhere' }, { ...song, id: 'foreign-team', team_id: 'other' }];
    expect(songsForChoir(songs, team.id, team.organisation_id)).toEqual([song]);
    expect(matchingSong(songs, song.id, 'other', team.organisation_id)).toBeUndefined();
    expect(matchingSong(songs, secondSong.id, team.id, team.organisation_id)).toBeUndefined();
  });
  it('retains optional values and custom tags without borrowing mutable arrays', () => {
    const draft = songDraft(song);
    expect(draft.tags).toEqual(song.tags);
    expect(draft.tags).not.toBe(song.tags);
    expect(draft.links[0]).toEqual({ localId: 'link-1', platform: 'YouTube', url: 'https://example.test/song' });
    expect(draft.notes).toBe(song.notes);
  });
  it('requires only the original title and lyrics fields', () => {
    expect(validateSongDraft(songDraft())).toEqual({ title: 'Add a song title.', lyrics: 'Add the lyrics.' });
    expect(validateSongDraft({ ...songDraft(), title: ' Title ', lyrics: ' Words ' })).toEqual({});
  });
  it('reorders by stable song identity without mutating the draft', () => {
    const ids = ['one', 'two', 'three'];
    expect(moveSong(ids, 'two', -1)).toEqual(['two', 'one', 'three']);
    expect(moveSong(ids, 'two', 1)).toEqual(['one', 'three', 'two']);
    expect(moveSong(ids, 'one', -1)).toBe(ids);
    expect(moveSong(ids, 'missing', 1)).toBe(ids);
    expect(ids).toEqual(['one', 'two', 'three']);
  });
});
