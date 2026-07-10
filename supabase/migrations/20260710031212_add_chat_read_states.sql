-- ============================================================================
-- Shift Shepherd - chat read states (private unread tracking V1)
--
-- One row per (user, team): the point up to which that user has read the
-- team's chat. Unread = messages from other people created after that point.
-- Strictly personal - no policy exposes one user's read state to anyone
-- else, so there are no visible read receipts and no "seen by" surface.
--
-- The app upserts onto unique (user_id, team_id) when a team chat is opened
-- (and again as new messages arrive while it stays open). No backfill: a row
-- first appears the first time a user opens a chat after this migration, and
-- the app treats a missing row conservatively (only messages newer than the
-- session's first read-state load count as unread).
-- ============================================================================

begin;

create table public.chat_read_states (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  last_read_at timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (user_id, team_id)
);

-- The unique (user_id, team_id) index already serves the app's only query
-- (all of the caller's own rows); this covers the team_id FK for team
-- deletes and any future team-scoped maintenance.
create index chat_read_states_team_idx on public.chat_read_states (team_id);

create trigger chat_read_states_set_updated_at
  before update on public.chat_read_states
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: strictly personal, and only for teams the user can access
-- ----------------------------------------------------------------------------

alter table public.chat_read_states enable row level security;

create policy "users view their own chat read states"
  on public.chat_read_states for select to authenticated
  using (user_id = public.current_profile_id());

create policy "users create their own chat read states"
  on public.chat_read_states for insert to authenticated
  with check (
    user_id = public.current_profile_id()
    and public.can_access_team(team_id)
  );

create policy "users update their own chat read states"
  on public.chat_read_states for update to authenticated
  using (user_id = public.current_profile_id())
  with check (
    user_id = public.current_profile_id()
    and public.can_access_team(team_id)
  );

-- No delete policy and no delete grant - the app never deletes read state in
-- V1 (rows cascade away with their profile or team).

-- ----------------------------------------------------------------------------
-- Data API privileges: RLS stays the authority; nothing for anon
-- ----------------------------------------------------------------------------

grant select, insert, update on table public.chat_read_states to authenticated;

commit;
