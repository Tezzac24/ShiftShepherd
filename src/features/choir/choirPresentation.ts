import { Song, SongPlatform } from '../../types';

export function songsForChoir(songs: Song[], teamId: string, organisationId: string) {
  return songs.filter((song) => song.team_id === teamId && song.organisation_id === organisationId);
}

export function matchingSong(songs: Song[], songId: string | null, teamId: string | null, organisationId: string) {
  return songs.find((song) => song.id === songId && song.team_id === teamId && song.organisation_id === organisationId);
}

export interface DraftLink {
  /** Stable local row identity, excluded from the mutation payload. */
  localId: string;
  platform: SongPlatform;
  url: string;
}
export interface SongDraft {
  title: string;
  lyrics: string;
  artist: string;
  notes: string;
  tags: string[];
  links: DraftLink[];
}
export type SongField = 'title' | 'lyrics';
export type SongErrors = Partial<Record<SongField, string>>;

export function songDraft(song?: Song): SongDraft {
  return { title: song?.title ?? '', lyrics: song?.lyrics ?? '', artist: song?.artist ?? '', notes: song?.notes ?? '',
    tags: [...(song?.tags ?? [])], links: song?.links.map((link) => ({ localId: link.id, platform: link.platform, url: link.url })) ?? [] };
}

export function validateSongDraft(draft: SongDraft): SongErrors {
  return { ...(!draft.title.trim() ? { title: 'Add a song title.' } : {}), ...(!draft.lyrics.trim() ? { lyrics: 'Add the lyrics.' } : {}) };
}

export function songSummary(song: Song) {
  return [song.artist, song.tags.join(' · ')].filter(Boolean).join('\n');
}

export function moveSong(ids: string[], songId: string, delta: -1 | 1) {
  const index = ids.indexOf(songId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
