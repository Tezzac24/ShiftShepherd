-- ============================================================================
-- Shift Shepherd — Row Level Security
--
-- These policies are the server-side twin of src/lib/permissions/index.ts.
-- Every rule there must hold here, because the client checks only hide UI —
-- RLS is what actually protects the data.
--
-- Identity model: auth.uid() (Supabase Auth) → profiles.auth_user_id → profile
-- row. All helpers resolve the caller through that link.
--
-- Helpers are SECURITY DEFINER so they can read profiles/team_memberships
-- without tripping over those tables' own RLS (avoids infinite recursion).
-- They are STABLE and schema-qualified with a pinned search_path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------

-- The caller's profile id (or null when not linked/signed in).
create or replace function public.current_profile_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid();
$$;

-- Caller belongs to the organisation.
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and organisation_id = org
  );
$$;

-- Caller holds a given organisation-level role.
create or replace function public.has_org_role(org uuid, required public.organisation_role_name)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_roles r
    join public.profiles p on p.id = r.user_id
    where p.auth_user_id = auth.uid()
      and r.organisation_id = org
      and r.role = required
  );
$$;

create or replace function public.is_church_admin(org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_org_role(org, 'church_admin');
$$;

-- Caller is a member of the team (any team role).
create or replace function public.is_team_member(team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    join public.profiles p on p.id = m.user_id
    where p.auth_user_id = auth.uid() and m.team_id = team
  );
$$;

-- Caller is the team's leader.
create or replace function public.is_team_leader(team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    join public.profiles p on p.id = m.user_id
    where p.auth_user_id = auth.uid()
      and m.team_id = team
      and m.role = 'team_leader'
  );
$$;

-- The organisation a team belongs to.
create or replace function public.team_org(team uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organisation_id from public.teams where id = team;
$$;

-- Team visibility: members see their teams; church admins see every team.
create or replace function public.can_access_team(team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_team_member(team) or public.is_church_admin(public.team_org(team));
$$;

-- Rota management: the team's leader or a church admin.
create or replace function public.can_manage_team(team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_team_leader(team) or public.is_church_admin(public.team_org(team));
$$;

-- The team a rota entry belongs to.
create or replace function public.entry_team(entry uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select team_id from public.rota_entries where id = entry;
$$;

-- The team a rota assignment (via its entry) belongs to.
create or replace function public.assignment_team(assignment uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select e.team_id
  from public.rota_assignments a
  join public.rota_entries e on e.id = a.rota_entry_id
  where a.id = assignment;
$$;

-- The assignment belongs to the caller.
create or replace function public.is_my_assignment(assignment uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rota_assignments a
    join public.profiles p on p.id = a.user_id
    where a.id = assignment and p.auth_user_id = auth.uid()
  );
$$;

-- Caller is the assigned song leader for a rota entry.
-- 'Song Leader' matches SONG_LEADER_ROLE in src/lib/permissions/index.ts.
create or replace function public.is_song_leader_for_entry(entry uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rota_assignments a
    join public.profiles p on p.id = a.user_id
    where a.rota_entry_id = entry
      and a.role_name = 'Song Leader'
      and p.auth_user_id = auth.uid()
  );
$$;

-- Song selection rights: the assigned song leader for the date, the team's
-- leader (override), or a church admin. Mirrors canSelectSongsForRota().
create or replace function public.can_select_songs(entry uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_song_leader_for_entry(entry)
      or public.can_manage_team(public.entry_team(entry));
$$;

-- The team a song belongs to.
create or replace function public.song_team(song uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select team_id from public.songs where id = song;
$$;

-- The team a chat message belongs to.
create or replace function public.message_team(message uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select team_id from public.chat_messages where id = message;
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere (no anonymous access — the app requires login)
-- ----------------------------------------------------------------------------

alter table public.organisations              enable row level security;
alter table public.profiles                   enable row level security;
alter table public.organisation_roles         enable row level security;
alter table public.teams                      enable row level security;
alter table public.team_memberships           enable row level security;
alter table public.event_categories           enable row level security;
alter table public.events                     enable row level security;
alter table public.announcements              enable row level security;
alter table public.rota_entries               enable row level security;
alter table public.rota_assignments           enable row level security;
alter table public.availability_responses     enable row level security;
alter table public.songs                      enable row level security;
alter table public.song_links                 enable row level security;
alter table public.choir_rota_song_selections enable row level security;
alter table public.chat_messages              enable row level security;
alter table public.chat_attachments           enable row level security;
alter table public.notification_preferences   enable row level security;
alter table public.push_tokens                enable row level security;

-- ----------------------------------------------------------------------------
-- organisations
-- ----------------------------------------------------------------------------

create policy "org members can view their organisation"
  on public.organisations for select to authenticated
  using (public.is_org_member(id));

create policy "church admins can update their organisation"
  on public.organisations for update to authenticated
  using (public.is_church_admin(id))
  with check (public.is_church_admin(id));

-- inserts/deletes of organisations happen via the service role only.

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------

create policy "org members can view profiles in their organisation"
  on public.profiles for select to authenticated
  using (public.is_org_member(organisation_id));

create policy "users can update their own profile"
  on public.profiles for update to authenticated
  using (auth_user_id = auth.uid() or public.is_church_admin(organisation_id))
  with check (auth_user_id = auth.uid() or public.is_church_admin(organisation_id));

-- Profile creation is handled by the on-signup trigger / service role (see
-- docs/supabase-integration-plan.md). No client insert policy on purpose.

-- ----------------------------------------------------------------------------
-- organisation_roles
-- ----------------------------------------------------------------------------

create policy "org members can view organisation roles"
  on public.organisation_roles for select to authenticated
  using (public.is_org_member(organisation_id));

create policy "church admins manage organisation roles"
  on public.organisation_roles for all to authenticated
  using (public.is_church_admin(organisation_id))
  with check (public.is_church_admin(organisation_id));

-- ----------------------------------------------------------------------------
-- teams: users see only teams they belong to, unless church admin
-- ----------------------------------------------------------------------------

create policy "members and admins can view teams"
  on public.teams for select to authenticated
  using (public.is_team_member(id) or public.is_church_admin(organisation_id));

create policy "church admins manage teams"
  on public.teams for all to authenticated
  using (public.is_church_admin(organisation_id))
  with check (public.is_church_admin(organisation_id));

-- ----------------------------------------------------------------------------
-- team_memberships
-- ----------------------------------------------------------------------------

create policy "team members and admins can view memberships"
  on public.team_memberships for select to authenticated
  using (public.can_access_team(team_id) or user_id = public.current_profile_id());

create policy "church admins manage memberships"
  on public.team_memberships for all to authenticated
  using (public.is_church_admin(public.team_org(team_id)))
  with check (public.is_church_admin(public.team_org(team_id)));

-- ----------------------------------------------------------------------------
-- event_categories
-- ----------------------------------------------------------------------------

create policy "org members can view event categories"
  on public.event_categories for select to authenticated
  using (public.is_org_member(organisation_id));

create policy "admins and event managers manage event categories"
  on public.event_categories for all to authenticated
  using (public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager'))
  with check (public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager'));

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------

create policy "org members can view events"
  on public.events for select to authenticated
  using (public.is_org_member(organisation_id));

create policy "admins and event managers create events"
  on public.events for insert to authenticated
  with check (
    created_by = public.current_profile_id()
    and (public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager'))
  );

create policy "admins and event managers update events"
  on public.events for update to authenticated
  using (public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager'))
  with check (public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager'));

create policy "admins and event managers delete events"
  on public.events for delete to authenticated
  using (public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager'));

-- ----------------------------------------------------------------------------
-- announcements
-- church-wide (team_id null): visible to the org; managed by admins and
-- announcement managers. Team announcements: visible to that team; managed
-- by the team's leader (or admins).
-- ----------------------------------------------------------------------------

create policy "members can view announcements for their audience"
  on public.announcements for select to authenticated
  using (
    public.is_org_member(organisation_id)
    and (team_id is null or public.can_access_team(team_id))
  );

create policy "authorised users create announcements"
  on public.announcements for insert to authenticated
  with check (
    created_by = public.current_profile_id()
    and (
      (team_id is null
        and (public.is_church_admin(organisation_id)
          or public.has_org_role(organisation_id, 'announcement_manager')))
      or
      (team_id is not null and public.can_manage_team(team_id))
    )
  );

create policy "authorised users update announcements"
  on public.announcements for update to authenticated
  using (
    (team_id is null
      and (public.is_church_admin(organisation_id)
        or public.has_org_role(organisation_id, 'announcement_manager')))
    or (team_id is not null and public.can_manage_team(team_id))
  )
  with check (
    (team_id is null
      and (public.is_church_admin(organisation_id)
        or public.has_org_role(organisation_id, 'announcement_manager')))
    or (team_id is not null and public.can_manage_team(team_id))
  );

create policy "authorised users delete announcements"
  on public.announcements for delete to authenticated
  using (
    (team_id is null
      and (public.is_church_admin(organisation_id)
        or public.has_org_role(organisation_id, 'announcement_manager')))
    or (team_id is not null and public.can_manage_team(team_id))
  );

-- ----------------------------------------------------------------------------
-- rota_entries: team members view; team leaders (or admins) manage
-- ----------------------------------------------------------------------------

create policy "team members can view rota entries"
  on public.rota_entries for select to authenticated
  using (public.can_access_team(team_id));

create policy "team leaders create rota entries"
  on public.rota_entries for insert to authenticated
  with check (
    created_by = public.current_profile_id()
    and public.can_manage_team(team_id)
  );

create policy "team leaders update rota entries"
  on public.rota_entries for update to authenticated
  using (public.can_manage_team(team_id))
  with check (public.can_manage_team(team_id));

create policy "team leaders delete rota entries"
  on public.rota_entries for delete to authenticated
  using (public.can_manage_team(team_id));

-- ----------------------------------------------------------------------------
-- rota_assignments
-- ----------------------------------------------------------------------------

create policy "team members can view rota assignments"
  on public.rota_assignments for select to authenticated
  using (public.can_access_team(public.entry_team(rota_entry_id)));

create policy "team leaders manage rota assignments"
  on public.rota_assignments for all to authenticated
  using (public.can_manage_team(public.entry_team(rota_entry_id)))
  with check (public.can_manage_team(public.entry_team(rota_entry_id)));

-- ----------------------------------------------------------------------------
-- availability_responses: assigned users manage their own response;
-- the whole team can see responses (the app shows statuses to everyone,
-- notes are surfaced to leaders in the UI)
-- ----------------------------------------------------------------------------

create policy "team members can view availability responses"
  on public.availability_responses for select to authenticated
  using (public.can_access_team(public.assignment_team(rota_assignment_id)));

create policy "assigned users create their own response"
  on public.availability_responses for insert to authenticated
  with check (
    user_id = public.current_profile_id()
    and public.is_my_assignment(rota_assignment_id)
  );

create policy "assigned users update their own response"
  on public.availability_responses for update to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());

create policy "assigned users delete their own response"
  on public.availability_responses for delete to authenticated
  using (user_id = public.current_profile_id());

-- ----------------------------------------------------------------------------
-- songs: every member of the owning team (choir) can add, edit, and delete
-- any song — deliberate product decision (docs, section 12.2)
-- ----------------------------------------------------------------------------

create policy "team members can view songs"
  on public.songs for select to authenticated
  using (public.can_access_team(team_id));

create policy "team members add songs"
  on public.songs for insert to authenticated
  with check (
    added_by = public.current_profile_id()
    and (public.is_team_member(team_id)
      or public.is_church_admin(public.team_org(team_id)))
  );

create policy "team members update any song"
  on public.songs for update to authenticated
  using (public.is_team_member(team_id)
      or public.is_church_admin(public.team_org(team_id)))
  with check (public.is_team_member(team_id)
      or public.is_church_admin(public.team_org(team_id)));

create policy "team members delete any song"
  on public.songs for delete to authenticated
  using (public.is_team_member(team_id)
      or public.is_church_admin(public.team_org(team_id)));

-- ----------------------------------------------------------------------------
-- song_links: follow the parent song's team
-- ----------------------------------------------------------------------------

create policy "team members can view song links"
  on public.song_links for select to authenticated
  using (public.can_access_team(public.song_team(song_id)));

create policy "team members manage song links"
  on public.song_links for all to authenticated
  using (public.is_team_member(public.song_team(song_id))
      or public.is_church_admin(public.team_org(public.song_team(song_id))))
  with check (public.is_team_member(public.song_team(song_id))
      or public.is_church_admin(public.team_org(public.song_team(song_id))));

-- ----------------------------------------------------------------------------
-- choir_rota_song_selections: only the assigned song leader for the date,
-- the choir team leader (override), or a church admin can change selections;
-- all team members can view them
-- ----------------------------------------------------------------------------

create policy "team members can view song selections"
  on public.choir_rota_song_selections for select to authenticated
  using (public.can_access_team(public.entry_team(rota_entry_id)));

create policy "song leaders create song selections"
  on public.choir_rota_song_selections for insert to authenticated
  with check (
    selected_by = public.current_profile_id()
    and public.can_select_songs(rota_entry_id)
  );

create policy "song leaders update song selections"
  on public.choir_rota_song_selections for update to authenticated
  using (public.can_select_songs(rota_entry_id))
  with check (public.can_select_songs(rota_entry_id));

create policy "song leaders delete song selections"
  on public.choir_rota_song_selections for delete to authenticated
  using (public.can_select_songs(rota_entry_id));

-- ----------------------------------------------------------------------------
-- chat_messages: team members only (admins can view/post everywhere)
-- ----------------------------------------------------------------------------

create policy "team members can view chat messages"
  on public.chat_messages for select to authenticated
  using (public.can_access_team(team_id));

create policy "team members send chat messages"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = public.current_profile_id()
    and (public.is_team_member(team_id)
      or public.is_church_admin(public.team_org(team_id)))
  );

-- No update/delete in V1 — editing and deleting messages is out of scope.

-- ----------------------------------------------------------------------------
-- chat_attachments
-- ----------------------------------------------------------------------------

create policy "team members can view chat attachments"
  on public.chat_attachments for select to authenticated
  using (public.can_access_team(public.message_team(message_id)));

create policy "senders attach files to their own messages"
  on public.chat_attachments for insert to authenticated
  with check (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.sender_id = public.current_profile_id()
    )
  );

-- ----------------------------------------------------------------------------
-- notification_preferences & push_tokens: strictly personal
-- ----------------------------------------------------------------------------

create policy "users manage their own notification preferences"
  on public.notification_preferences for all to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());

create policy "users manage their own push tokens"
  on public.push_tokens for all to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());
