/**
 * Choir songs service - live Supabase slice for the song database, song links,
 * and choir rota song selections.
 *
 * All Supabase reads/writes for songs live here so screens and AppDataContext
 * never build queries themselves. RLS remains the authority:
 *
 *  - choir team members and church admins can manage songs and links;
 *  - team members can read song selections;
 *  - only the assigned section leader, choir team leader, or church admin can
 *    change that section's rota song selections.
 *
 * This service needs the grants migration
 * `20260709171613_grant_authenticated_songs_api_privileges.sql` applied.
 * Until then, live song screens show a friendly load/save error; demo mode is
 * unaffected.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import {
  ChoirSongSelection,
  Song,
  SongLink,
  SongPlatform,
  SongSection,
} from '../../../types';
import { getSupabase } from '../client';

const LOAD_ERROR = "We couldn't load songs right now. Please try again.";
const SAVE_ERROR = 'Your changes could not be saved. Please try again.';
const DELETE_ERROR = 'This song could not be deleted. Please try again.';
const SELECTION_SAVE_ERROR = 'Your song choices could not be saved. Please try again.';
const PERMISSION_ERROR = 'You do not have permission to do that.';
const MISSING_SONG_ERROR = 'This song is no longer available. It may have been removed.';
const MISSING_SELECTION_ERROR =
  'This rota date is no longer available. It may have been removed.';
const OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";

export type NewSongInput = Omit<Song, 'id' | 'organisation_id' | 'created_at' | 'updated_at'>;

export interface SongsData {
  songs: Song[];
  selections: ChoirSongSelection[];
}

interface SongRow {
  id: string;
  organisation_id: string;
  team_id: string;
  title: string;
  artist: string | null;
  lyrics: string;
  notes: string | null;
  tags: string[] | null;
  added_by: string;
  created_at: string;
  updated_at: string;
}

interface SongLinkRow {
  id: string;
  song_id: string;
  platform: SongPlatform;
  url: string;
}

interface SelectionRow {
  id: string;
  rota_entry_id: string;
  song_id: string;
  section: SongSection;
  selected_by: string;
  order_index: number;
  notes: string | null;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error(OFFLINE_ERROR);
  }
  return supabase;
}

function isPermissionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === '42501' || /row-level security|permission denied/i.test(e?.message ?? '');
}

function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  return /fetch|network|timeout/i.test(message);
}

const FRIENDLY_MESSAGES = new Set([
  LOAD_ERROR,
  SAVE_ERROR,
  DELETE_ERROR,
  SELECTION_SAVE_ERROR,
  PERMISSION_ERROR,
  MISSING_SONG_ERROR,
  MISSING_SELECTION_ERROR,
  OFFLINE_ERROR,
]);

function fail(operation: string, error: unknown, fallback: string): never {
  console.warn(`[songs] ${operation} failed`, error);
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isPermissionError(error)) throw new Error(PERMISSION_ERROR);
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(fallback);
}

function requireLiveId(id: string, mockPrefixes: string[], what: string): string {
  if (mockPrefixes.some((prefix) => id.startsWith(prefix))) {
    console.warn(`[songs] refusing mock ${what} id "${id}"`);
    throw new Error(SAVE_ERROR);
  }
  return id;
}

async function fetchOrganisationId(
  supabase: SupabaseClient,
  liveProfileId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('organisation_id')
    .eq('id', liveProfileId)
    .single();
  if (error) throw error;
  return data.organisation_id as string;
}

function toAppSong(row: SongRow, links: SongLinkRow[]): Song {
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    team_id: row.team_id,
    title: row.title,
    artist: row.artist,
    lyrics: row.lyrics,
    notes: row.notes,
    tags: Array.isArray(row.tags) ? row.tags : [],
    links,
    added_by: row.added_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sortSongs(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => a.title.localeCompare(b.title));
}

function groupLinks(rows: SongLinkRow[]): Map<string, SongLinkRow[]> {
  const linksBySong = new Map<string, SongLinkRow[]>();
  for (const row of rows) {
    linksBySong.set(row.song_id, [...(linksBySong.get(row.song_id) ?? []), row]);
  }
  return linksBySong;
}

function toDbSongPatch(patch: Partial<Song>) {
  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.artist !== undefined) fields.artist = patch.artist;
  if (patch.lyrics !== undefined) fields.lyrics = patch.lyrics;
  if (patch.notes !== undefined) fields.notes = patch.notes;
  if (patch.tags !== undefined) fields.tags = patch.tags;
  return fields;
}

function toLinkRows(songId: string, links: SongLink[] | undefined) {
  return (links ?? [])
    .filter((link) => link.url.trim())
    .map((link) => ({
      song_id: songId,
      platform: link.platform,
      url: link.url.trim(),
    }));
}

async function replaceSongLinks(
  supabase: SupabaseClient,
  songId: string,
  links: SongLink[],
): Promise<void> {
  const { error: deleteError } = await supabase.from('song_links').delete().eq('song_id', songId);
  if (deleteError) throw deleteError;
  const rows = toLinkRows(songId, links);
  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from('song_links').insert(rows);
  if (insertError) throw insertError;
}

async function fetchSongById(supabase: SupabaseClient, id: string): Promise<Song> {
  const [songRes, linksRes] = await Promise.all([
    supabase
      .from('songs')
      .select(
        'id, organisation_id, team_id, title, artist, lyrics, notes, tags, added_by, created_at, updated_at',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('song_links').select('id, song_id, platform, url').eq('song_id', id),
  ]);
  if (songRes.error) throw songRes.error;
  if (linksRes.error) throw linksRes.error;
  if (!songRes.data) throw new Error(MISSING_SONG_ERROR);
  return toAppSong(songRes.data as SongRow, (linksRes.data ?? []) as SongLinkRow[]);
}

async function fetchSelectionSection(
  supabase: SupabaseClient,
  rotaEntryId: string,
  section: SongSection,
): Promise<ChoirSongSelection[]> {
  const { data, error } = await supabase
    .from('choir_rota_song_selections')
    .select('id, rota_entry_id, song_id, section, selected_by, order_index, notes')
    .eq('rota_entry_id', rotaEntryId)
    .eq('section', section)
    .order('order_index', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SelectionRow[];
}

function matchesRequestedOrder(
  rows: ChoirSongSelection[],
  requestedSongIds: string[],
): boolean {
  if (rows.length !== requestedSongIds.length) return false;
  return rows.every((row, index) => row.song_id === requestedSongIds[index]);
}

export async function fetchSongsData(): Promise<SongsData> {
  const supabase = requireClient();
  try {
    const [songsRes, linksRes, selectionsRes] = await Promise.all([
      supabase
        .from('songs')
        .select(
          'id, organisation_id, team_id, title, artist, lyrics, notes, tags, added_by, created_at, updated_at',
        )
        .order('title', { ascending: true }),
      supabase
        .from('song_links')
        .select('id, song_id, platform, url')
        .order('song_id', { ascending: true })
        .order('platform', { ascending: true }),
      supabase
        .from('choir_rota_song_selections')
        .select('id, rota_entry_id, song_id, section, selected_by, order_index, notes')
        .order('rota_entry_id', { ascending: true })
        .order('section', { ascending: true })
        .order('order_index', { ascending: true }),
    ]);
    if (songsRes.error) throw songsRes.error;
    if (linksRes.error) throw linksRes.error;
    if (selectionsRes.error) throw selectionsRes.error;

    const linksBySong = groupLinks((linksRes.data ?? []) as SongLinkRow[]);
    return {
      songs: sortSongs(
        ((songsRes.data ?? []) as SongRow[]).map((row) =>
          toAppSong(row, linksBySong.get(row.id) ?? []),
        ),
      ),
      selections: (selectionsRes.data ?? []) as SelectionRow[],
    };
  } catch (error) {
    fail('list', error, LOAD_ERROR);
  }
}

export async function createSong(
  input: NewSongInput,
  liveProfileId: string,
): Promise<Song> {
  const supabase = requireClient();
  try {
    const organisationId = await fetchOrganisationId(supabase, liveProfileId);
    const { data: songRow, error: songError } = await supabase
      .from('songs')
      .insert({
        organisation_id: organisationId,
        team_id: requireLiveId(input.team_id, ['team-'], 'team'),
        title: input.title,
        artist: input.artist,
        lyrics: input.lyrics,
        notes: input.notes,
        tags: input.tags,
        added_by: liveProfileId,
      })
      .select(
        'id, organisation_id, team_id, title, artist, lyrics, notes, tags, added_by, created_at, updated_at',
      )
      .single();
    if (songError) throw songError;

    const songId = (songRow as SongRow).id;
    try {
      const linkRows = toLinkRows(songId, input.links);
      if (linkRows.length > 0) {
        const { error: linksError } = await supabase.from('song_links').insert(linkRows);
        if (linksError) throw linksError;
      }
    } catch (linksError) {
      await supabase.from('songs').delete().eq('id', songId);
      throw linksError;
    }

    return fetchSongById(supabase, songId);
  } catch (error) {
    fail('create', error, SAVE_ERROR);
  }
}

export async function updateSong(id: string, patch: Partial<Song>): Promise<Song> {
  const supabase = requireClient();
  try {
    const songId = requireLiveId(id, ['song-'], 'song');
    const fields = toDbSongPatch(patch);
    if (Object.keys(fields).length > 0) {
      const { data, error } = await supabase
        .from('songs')
        .update(fields)
        .eq('id', songId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(MISSING_SONG_ERROR);
    }
    if (patch.links) {
      await replaceSongLinks(supabase, songId, patch.links);
    }
    return fetchSongById(supabase, songId);
  } catch (error) {
    fail('update', error, SAVE_ERROR);
  }
}

export async function deleteSong(id: string): Promise<void> {
  const supabase = requireClient();
  try {
    const songId = requireLiveId(id, ['song-'], 'song');
    const { data, error } = await supabase.from('songs').delete().eq('id', songId).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(MISSING_SONG_ERROR);
  } catch (error) {
    fail('delete', error, DELETE_ERROR);
  }
}

export async function replaceSongSelections(
  rotaEntryId: string,
  section: SongSection,
  songIds: string[],
  liveProfileId: string,
): Promise<ChoirSongSelection[]> {
  const supabase = requireClient();
  try {
    const entryId = requireLiveId(rotaEntryId, ['rota-'], 'rota entry');
    const selectedBy = requireLiveId(liveProfileId, ['user-'], 'profile');
    const uniqueSongIds = songIds.filter((songId, index) => songIds.indexOf(songId) === index);
    const liveSongIds = uniqueSongIds.map((songId) =>
      requireLiveId(songId, ['song-'], 'song'),
    );

    const { error: deleteError } = await supabase
      .from('choir_rota_song_selections')
      .delete()
      .eq('rota_entry_id', entryId)
      .eq('section', section);
    if (deleteError) throw deleteError;

    if (liveSongIds.length > 0) {
      const { error: insertError } = await supabase
        .from('choir_rota_song_selections')
        .insert(
          liveSongIds.map((songId, index) => ({
            rota_entry_id: entryId,
            song_id: songId,
            section,
            selected_by: selectedBy,
            order_index: index,
            notes: null,
          })),
        );
      if (insertError) throw insertError;
    }

    const saved = await fetchSelectionSection(supabase, entryId, section);
    if (!matchesRequestedOrder(saved, liveSongIds)) {
      throw new Error(PERMISSION_ERROR);
    }
    return saved;
  } catch (error) {
    fail('replace selections', error, SELECTION_SAVE_ERROR);
  }
}
