-- ============================================================================
-- Shift Shepherd — choir song selection sections (praise / worship)
--
-- Choir services split their set list into two sections, each usually led by
-- a different person:
--   * Praise  — upbeat opening songs, managed by the 'Praise Leader'
--   * Worship — slower reflective songs, managed by the 'Worship Leader'
--
-- Mirrors src/types ChoirSongSelection.section and the section-level
-- permission helpers in src/lib/permissions/index.ts:
--   * canManagePraiseSongsForRotaEntry / canManageWorshipSongsForRotaEntry
--   * The legacy 'Song Leader' role still manages BOTH sections.
--   * The choir team leader and church admin manage both (unchanged).
--
-- Do not apply to a live project as part of this change; this is planning.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Column: choir_rota_song_selections.section
-- ----------------------------------------------------------------------------

alter table public.choir_rota_song_selections
  add column section text not null default 'praise'
  constraint choir_song_selections_section_check
    check (section in ('praise', 'worship'));

comment on column public.choir_rota_song_selections.section is
  'Which part of the service the song belongs to. Praise and worship lists are ordered independently (order_index restarts per section).';

-- A song can appear once per rota date (unchanged: unique (rota_entry_id,
-- song_id) already prevents the same song in both sections).

-- Ordering is per section now; replace the old entry-wide ordering index.
drop index if exists public.song_selections_entry_idx;
create index song_selections_entry_section_idx
  on public.choir_rota_song_selections (rota_entry_id, section, order_index);

-- ----------------------------------------------------------------------------
-- RLS: section-level song management
-- ----------------------------------------------------------------------------

-- Caller is the assigned leader for a given section on a rota entry.
-- 'Praise Leader' / 'Worship Leader' match PRAISE_LEADER_ROLE /
-- WORSHIP_LEADER_ROLE in src/lib/permissions/index.ts; the legacy
-- 'Song Leader' role covers both sections.
create or replace function public.is_section_leader_for_entry(entry uuid, song_section text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rota_assignments a
    join public.profiles p on p.id = a.user_id
    where a.rota_entry_id = entry
      and p.auth_user_id = auth.uid()
      and (
        a.role_name = 'Song Leader'
        or (song_section = 'praise'  and a.role_name = 'Praise Leader')
        or (song_section = 'worship' and a.role_name = 'Worship Leader')
      )
  );
$$;

-- Section management rights: the section's assigned leader, the team's
-- leader (override), or a church admin. Mirrors
-- canManageSongSectionForRotaEntry().
create or replace function public.can_manage_song_section(entry uuid, song_section text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_section_leader_for_entry(entry, song_section)
      or public.can_manage_team(public.entry_team(entry));
$$;

-- Keep can_select_songs() as "can manage at least one section" so anything
-- still calling it behaves sensibly.
create or replace function public.can_select_songs(entry uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.can_manage_song_section(entry, 'praise')
      or public.can_manage_song_section(entry, 'worship');
$$;

-- Replace the write policies with section-aware ones (select is unchanged:
-- all team members can view selections).

drop policy if exists "song leaders create song selections"
  on public.choir_rota_song_selections;
drop policy if exists "song leaders update song selections"
  on public.choir_rota_song_selections;
drop policy if exists "song leaders delete song selections"
  on public.choir_rota_song_selections;

create policy "section leaders create song selections"
  on public.choir_rota_song_selections for insert to authenticated
  with check (
    selected_by = public.current_profile_id()
    and public.can_manage_song_section(rota_entry_id, section)
    and public.song_team(song_id) = public.entry_team(rota_entry_id)
  );

create policy "section leaders update song selections"
  on public.choir_rota_song_selections for update to authenticated
  using (
    public.can_manage_song_section(rota_entry_id, section)
    and public.song_team(song_id) = public.entry_team(rota_entry_id)
  )
  with check (
    public.can_manage_song_section(rota_entry_id, section)
    and public.song_team(song_id) = public.entry_team(rota_entry_id)
  );

create policy "section leaders delete song selections"
  on public.choir_rota_song_selections for delete to authenticated
  using (
    public.can_manage_song_section(rota_entry_id, section)
    and public.song_team(song_id) = public.entry_team(rota_entry_id)
  );
