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
