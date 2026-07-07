-- ============================================================================
-- Shift Shepherd — initial schema
--
-- Mirrors the TypeScript entities in src/types/index.ts (snake_case, same
-- field names) so the mock-data app state can be swapped for Supabase rows
-- with minimal churn.
--
-- Multi-church ready: every top-level table carries organisation_id; child
-- tables (assignments, responses, links, selections, attachments) derive
-- their organisation through their parent.
--
-- Note on file naming: the Supabase CLI expects migrations named
-- `<14-digit-timestamp>_name.sql`. If you use `supabase db push`, rename
-- these files (keeping their order), e.g. `20260707000001_initial_schema.sql`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type public.team_type as enum ('generic', 'choir', 'media');

create type public.team_role as enum ('member', 'team_leader');

create type public.organisation_role_name as enum (
  'church_admin',
  'announcement_manager',
  'event_manager',
  'general_member'
);

create type public.announcement_audience as enum ('church', 'team');

create type public.availability_status as enum (
  'available',
  'unavailable',
  'maybe',
  'not_responded'
);

create type public.song_platform as enum ('YouTube', 'Spotify', 'Apple Music', 'Other');

create type public.push_platform as enum ('ios', 'android', 'web');

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- organisations
-- ----------------------------------------------------------------------------

create table public.organisations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  logo_url       text,
  primary_colour text not null default '#2F5FC4',
  created_at     timestamptz not null default now()
);

comment on table public.organisations is
  'A church. V1 runs with a single row; the model supports multi-church later.';

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------

create table public.profiles (
  id              uuid primary key default gen_random_uuid(),
  -- Nullable so demo/seed profiles can exist before a real Supabase Auth user
  -- signs up and is linked. Tighten to NOT NULL once all members are linked.
  auth_user_id    uuid unique references auth.users (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  full_name       text not null,
  email           text not null,
  phone           text,
  avatar_url      text,
  created_at      timestamptz not null default now(),

  unique (organisation_id, email)
);

create index profiles_organisation_id_idx on public.profiles (organisation_id);

comment on table public.profiles is
  'App user profile. Linked to Supabase Auth via auth_user_id = auth.uid().';

-- ----------------------------------------------------------------------------
-- organisation_roles
-- ----------------------------------------------------------------------------

create table public.organisation_roles (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.organisation_role_name not null default 'general_member',

  unique (organisation_id, user_id)
);

create index organisation_roles_user_id_idx on public.organisation_roles (user_id);

comment on table public.organisation_roles is
  'Organisation-level role per user (one per user per organisation).';

-- ----------------------------------------------------------------------------
-- teams & memberships
-- ----------------------------------------------------------------------------

create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null,
  description     text not null default '',
  type            public.team_type not null default 'generic',
  created_at      timestamptz not null default now()
);

create index teams_organisation_id_idx on public.teams (organisation_id);

create table public.team_memberships (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.team_role not null default 'member',
  created_at timestamptz not null default now(),

  unique (team_id, user_id)
);

create index team_memberships_user_id_idx on public.team_memberships (user_id);

-- ----------------------------------------------------------------------------
-- event_categories & events
-- ----------------------------------------------------------------------------

create table public.event_categories (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null,
  colour          text not null default '#2F5FC4',

  unique (organisation_id, name)
);

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  title           text not null,
  description     text not null default '',
  -- restrict: reassign events before deleting a category
  category_id     uuid not null references public.event_categories (id) on delete restrict,
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  location        text not null default '',
  -- optional related team
  team_id         uuid references public.teams (id) on delete set null,
  -- restrict: authored content keeps its author; anonymise profiles rather
  -- than hard-deleting them (see docs/supabase-integration-plan.md)
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (end_time > start_time)
);

create index events_org_start_idx on public.events (organisation_id, start_time);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- announcements
-- ----------------------------------------------------------------------------

create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- null = church-wide announcement
  team_id         uuid references public.teams (id) on delete cascade,
  title           text not null,
  body            text not null,
  audience        public.announcement_audience not null default 'church',
  pinned          boolean not null default false,
  image_url       text,
  linked_event_id uuid references public.events (id) on delete set null,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- keep audience consistent with team_id
  check ((team_id is null and audience = 'church') or (team_id is not null and audience = 'team'))
);

create index announcements_org_created_idx
  on public.announcements (organisation_id, created_at desc);
create index announcements_team_id_idx on public.announcements (team_id);

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- rota_entries, rota_assignments, availability_responses
-- ----------------------------------------------------------------------------

create table public.rota_entries (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  team_id         uuid not null references public.teams (id) on delete cascade,
  title           text not null,
  date            date not null,
  time            time,
  notes           text,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index rota_entries_team_date_idx on public.rota_entries (team_id, date);

create trigger rota_entries_set_updated_at
  before update on public.rota_entries
  for each row execute function public.set_updated_at();

create table public.rota_assignments (
  id            uuid primary key default gen_random_uuid(),
  rota_entry_id uuid not null references public.rota_entries (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- free text on purpose: role names differ per team ("Song Leader", "Sound",
  -- "Front Door"…). The app treats 'Song Leader' as significant (see
  -- src/lib/permissions SONG_LEADER_ROLE).
  role_name     text not null,
  created_at    timestamptz not null default now(),

  unique (rota_entry_id, user_id, role_name)
);

create index rota_assignments_entry_idx on public.rota_assignments (rota_entry_id);
create index rota_assignments_user_idx on public.rota_assignments (user_id);

create table public.availability_responses (
  id                 uuid primary key default gen_random_uuid(),
  rota_assignment_id uuid not null references public.rota_assignments (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  status             public.availability_status not null default 'not_responded',
  note               text,
  updated_at         timestamptz not null default now(),

  -- the app treats responses as one-per-assignment (upsert semantics)
  unique (rota_assignment_id)
);

create index availability_responses_user_idx on public.availability_responses (user_id);

create trigger availability_responses_set_updated_at
  before update on public.availability_responses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- songs, song_links, choir_rota_song_selections
-- ----------------------------------------------------------------------------

create table public.songs (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  team_id         uuid not null references public.teams (id) on delete cascade,
  title           text not null,
  artist          text,
  lyrics          text not null default '',
  notes           text,
  -- The app nests tags on the song object; text[] keeps that shape 1:1.
  tags            text[] not null default '{}',
  added_by        uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index songs_team_id_idx on public.songs (team_id);
-- Song search is title/artist/tags. If ILIKE search gets slow at scale,
-- enable pg_trgm and add a GIN index — not needed for a single church.

create trigger songs_set_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

create table public.song_links (
  id       uuid primary key default gen_random_uuid(),
  song_id  uuid not null references public.songs (id) on delete cascade,
  platform public.song_platform not null default 'Other',
  url      text not null
);

create index song_links_song_id_idx on public.song_links (song_id);

create table public.choir_rota_song_selections (
  id            uuid primary key default gen_random_uuid(),
  rota_entry_id uuid not null references public.rota_entries (id) on delete cascade,
  song_id       uuid not null references public.songs (id) on delete cascade,
  selected_by   uuid not null references public.profiles (id) on delete restrict,
  order_index   integer not null default 0 check (order_index >= 0),
  notes         text,

  unique (rota_entry_id, song_id)
);

create index song_selections_entry_idx
  on public.choir_rota_song_selections (rota_entry_id, order_index);

-- ----------------------------------------------------------------------------
-- chat_messages & chat_attachments
-- ----------------------------------------------------------------------------

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  team_id         uuid not null references public.teams (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete restrict,
  body            text not null,
  created_at      timestamptz not null default now()
);

create index chat_messages_team_created_idx
  on public.chat_messages (team_id, created_at);

create table public.chat_attachments (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  file_url   text not null,
  file_type  text not null,
  file_name  text not null,
  created_at timestamptz not null default now()
);

create index chat_attachments_message_idx on public.chat_attachments (message_id);

-- ----------------------------------------------------------------------------
-- notification_preferences & push_tokens
-- ----------------------------------------------------------------------------

create table public.notification_preferences (
  id                               uuid primary key default gen_random_uuid(),
  user_id                          uuid not null references public.profiles (id) on delete cascade,
  announcement_notifications       boolean not null default true,
  team_announcement_notifications  boolean not null default true,
  chat_notifications               boolean not null default true,
  rota_notifications               boolean not null default true,
  event_reminders                  boolean not null default true,
  availability_reminders           boolean not null default true,

  unique (user_id)
);

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null unique,
  platform   public.push_platform not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Cross-table consistency guard
-- ----------------------------------------------------------------------------
--
-- These checks close the gaps that simple single-column foreign keys cannot:
-- rows with an organisation_id must not point at teams, events, categories,
-- or profiles from a different church; availability responses must belong to
-- the same user as their assignment; and choir song selections must use songs
-- from the same team as the rota entry.

create or replace function public.validate_cross_table_consistency()
returns trigger
language plpgsql
as $$
declare
  v_org uuid;
  v_related_org uuid;
  v_team uuid;
  v_related_team uuid;
  v_team_type public.team_type;
  v_user uuid;
begin
  if tg_table_name = 'organisation_roles' then
    select organisation_id into v_related_org
    from public.profiles
    where id = new.user_id;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'organisation_roles.user_id must belong to organisation_id';
    end if;

  elsif tg_table_name = 'team_memberships' then
    select organisation_id into v_org
    from public.teams
    where id = new.team_id;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.user_id;

    if v_org is distinct from v_related_org then
      raise exception 'team_memberships.user_id must belong to the team organisation';
    end if;

  elsif tg_table_name = 'events' then
    select organisation_id into v_related_org
    from public.event_categories
    where id = new.category_id;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'events.category_id must belong to organisation_id';
    end if;

    if new.team_id is not null then
      select organisation_id into v_related_org
      from public.teams
      where id = new.team_id;

      if v_related_org is distinct from new.organisation_id then
        raise exception 'events.team_id must belong to organisation_id';
      end if;
    end if;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.created_by;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'events.created_by must belong to organisation_id';
    end if;

  elsif tg_table_name = 'announcements' then
    if new.team_id is not null then
      select organisation_id into v_related_org
      from public.teams
      where id = new.team_id;

      if v_related_org is distinct from new.organisation_id then
        raise exception 'announcements.team_id must belong to organisation_id';
      end if;
    end if;

    if new.linked_event_id is not null then
      select organisation_id into v_related_org
      from public.events
      where id = new.linked_event_id;

      if v_related_org is distinct from new.organisation_id then
        raise exception 'announcements.linked_event_id must belong to organisation_id';
      end if;
    end if;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.created_by;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'announcements.created_by must belong to organisation_id';
    end if;

  elsif tg_table_name = 'rota_entries' then
    select organisation_id into v_related_org
    from public.teams
    where id = new.team_id;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'rota_entries.team_id must belong to organisation_id';
    end if;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.created_by;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'rota_entries.created_by must belong to organisation_id';
    end if;

  elsif tg_table_name = 'rota_assignments' then
    select e.organisation_id, e.team_id into v_org, v_team
    from public.rota_entries e
    where e.id = new.rota_entry_id;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.user_id;

    if v_related_org is distinct from v_org then
      raise exception 'rota_assignments.user_id must belong to the rota organisation';
    end if;

    if not exists (
      select 1
      from public.team_memberships m
      where m.team_id = v_team and m.user_id = new.user_id
    ) then
      raise exception 'rota_assignments.user_id must be a member of the rota team';
    end if;

  elsif tg_table_name = 'availability_responses' then
    select user_id into v_user
    from public.rota_assignments
    where id = new.rota_assignment_id;

    if v_user is distinct from new.user_id then
      raise exception 'availability_responses.user_id must match the assigned user';
    end if;

  elsif tg_table_name = 'songs' then
    select organisation_id, type into v_related_org, v_team_type
    from public.teams
    where id = new.team_id;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'songs.team_id must belong to organisation_id';
    end if;

    if v_team_type is distinct from 'choir'::public.team_type then
      raise exception 'songs.team_id must be a choir team';
    end if;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.added_by;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'songs.added_by must belong to organisation_id';
    end if;

  elsif tg_table_name = 'choir_rota_song_selections' then
    select team_id, organisation_id into v_team, v_org
    from public.rota_entries
    where id = new.rota_entry_id;

    select team_id, organisation_id into v_related_team, v_related_org
    from public.songs
    where id = new.song_id;

    if v_related_team is distinct from v_team
       or v_related_org is distinct from v_org then
      raise exception 'choir_rota_song_selections.song_id must belong to the rota team';
    end if;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.selected_by;

    if v_related_org is distinct from v_org then
      raise exception 'choir_rota_song_selections.selected_by must belong to the rota organisation';
    end if;

  elsif tg_table_name = 'chat_messages' then
    select organisation_id into v_related_org
    from public.teams
    where id = new.team_id;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'chat_messages.team_id must belong to organisation_id';
    end if;

    select organisation_id into v_related_org
    from public.profiles
    where id = new.sender_id;

    if v_related_org is distinct from new.organisation_id then
      raise exception 'chat_messages.sender_id must belong to organisation_id';
    end if;
  end if;

  return new;
end;
$$;

create trigger organisation_roles_validate_consistency
  before insert or update of organisation_id, user_id on public.organisation_roles
  for each row execute function public.validate_cross_table_consistency();

create trigger team_memberships_validate_consistency
  before insert or update of team_id, user_id on public.team_memberships
  for each row execute function public.validate_cross_table_consistency();

create trigger events_validate_consistency
  before insert or update of organisation_id, category_id, team_id, created_by on public.events
  for each row execute function public.validate_cross_table_consistency();

create trigger announcements_validate_consistency
  before insert or update of organisation_id, team_id, linked_event_id, created_by on public.announcements
  for each row execute function public.validate_cross_table_consistency();

create trigger rota_entries_validate_consistency
  before insert or update of organisation_id, team_id, created_by on public.rota_entries
  for each row execute function public.validate_cross_table_consistency();

create trigger rota_assignments_validate_consistency
  before insert or update of rota_entry_id, user_id on public.rota_assignments
  for each row execute function public.validate_cross_table_consistency();

create trigger availability_responses_validate_consistency
  before insert or update of rota_assignment_id, user_id on public.availability_responses
  for each row execute function public.validate_cross_table_consistency();

create trigger songs_validate_consistency
  before insert or update of organisation_id, team_id, added_by on public.songs
  for each row execute function public.validate_cross_table_consistency();

create trigger song_selections_validate_consistency
  before insert or update of rota_entry_id, song_id, selected_by on public.choir_rota_song_selections
  for each row execute function public.validate_cross_table_consistency();

create trigger chat_messages_validate_consistency
  before insert or update of organisation_id, team_id, sender_id on public.chat_messages
  for each row execute function public.validate_cross_table_consistency();
