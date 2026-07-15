-- ============================================================================
-- Team Creation & Editing V1
--
-- Adds church-admin-owned team lifecycle RPCs and a reversible archive state.
-- Archiving never removes the team or any child row. Existing active-team
-- access helpers fail closed for archived teams, while the teams SELECT policy
-- still lets church admins identify archived rows for restoration.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Archive metadata and organisation-scoped listing indexes.
-- ---------------------------------------------------------------------------

alter table public.teams
  add column archived_at timestamptz,
  add column archived_by uuid;

alter table public.teams
  add constraint teams_archived_by_fkey
  foreign key (archived_by)
  references public.profiles (id)
  on delete set null;

comment on column public.teams.archived_at is
  'Server timestamp for reversible team archive; null means the team is active.';
comment on column public.teams.archived_by is
  'Active church-admin profile that archived the team; attribution may become null if that profile is deleted.';

create index teams_organisation_active_name_idx
  on public.teams (organisation_id, lower(name), id)
  where archived_at is null;

create index teams_organisation_archived_at_idx
  on public.teams (organisation_id, archived_at desc, lower(name), id)
  where archived_at is not null;

create index teams_archived_by_idx
  on public.teams (archived_by)
  where archived_by is not null;

-- ---------------------------------------------------------------------------
-- 2. Active-team access boundary.
--
-- These helpers are the shared dependency for team membership, rota, choir,
-- chat, attachment, and private team-avatar policies/RPCs. Returning no team
-- relationship for archived rows blocks new active participation without
-- deleting history or broadening archived reads.
-- ---------------------------------------------------------------------------

create or replace function public.team_org(team uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_row.organisation_id
  from public.teams team_row
  where team_row.id = team
    and team_row.archived_at is null
$$;

create or replace function public.is_team_member(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_memberships membership
    join public.teams team_row on team_row.id = membership.team_id
    where membership.user_id = public.current_profile_id()
      and membership.team_id = team
      and team_row.archived_at is null
  )
$$;

create or replace function public.is_team_leader(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_memberships membership
    join public.teams team_row on team_row.id = membership.team_id
    where membership.user_id = public.current_profile_id()
      and membership.team_id = team
      and membership.role = 'team_leader'
      and team_row.archived_at is null
  )
$$;

create or replace function public.can_access_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_team_member(team)
      or public.is_church_admin(public.team_org(team))
$$;

create or replace function public.can_manage_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_team_leader(team)
      or public.is_church_admin(public.team_org(team))
$$;

create or replace function public.is_choir_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams team_row
    where team_row.id = team
      and team_row.type = 'choir'
      and team_row.archived_at is null
  )
$$;

create or replace function public.entry_team(entry uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select entry_row.team_id
  from public.rota_entries entry_row
  join public.teams team_row on team_row.id = entry_row.team_id
  where entry_row.id = entry
    and team_row.archived_at is null
$$;

create or replace function public.assignment_team(assignment uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select entry_row.team_id
  from public.rota_assignments assignment_row
  join public.rota_entries entry_row on entry_row.id = assignment_row.rota_entry_id
  join public.teams team_row on team_row.id = entry_row.team_id
  where assignment_row.id = assignment
    and team_row.archived_at is null
$$;

create or replace function public.song_team(song uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select song_row.team_id
  from public.songs song_row
  join public.teams team_row on team_row.id = song_row.team_id
  where song_row.id = song
    and team_row.archived_at is null
$$;

create or replace function public.message_team(message uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select message_row.team_id
  from public.chat_messages message_row
  join public.teams team_row on team_row.id = message_row.team_id
  where message_row.id = message
    and team_row.archived_at is null
$$;

create or replace function public.is_my_assignment(assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rota_assignments assignment_row
    join public.rota_entries entry_row on entry_row.id = assignment_row.rota_entry_id
    join public.teams team_row on team_row.id = entry_row.team_id
    where assignment_row.id = assignment
      and assignment_row.user_id = public.current_profile_id()
      and team_row.archived_at is null
  )
$$;

create or replace function public.is_song_leader_for_entry(entry uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rota_assignments assignment_row
    join public.rota_entries entry_row on entry_row.id = assignment_row.rota_entry_id
    join public.teams team_row on team_row.id = entry_row.team_id
    where assignment_row.rota_entry_id = entry
      and assignment_row.role_name = 'Song Leader'
      and assignment_row.user_id = public.current_profile_id()
      and team_row.archived_at is null
  )
$$;

create or replace function public.is_section_leader_for_entry(
  entry uuid,
  song_section text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rota_assignments assignment_row
    join public.rota_entries entry_row on entry_row.id = assignment_row.rota_entry_id
    join public.teams team_row on team_row.id = entry_row.team_id
    where assignment_row.rota_entry_id = entry
      and assignment_row.user_id = public.current_profile_id()
      and team_row.archived_at is null
      and (
        assignment_row.role_name = 'Song Leader'
        or (song_section = 'praise' and assignment_row.role_name = 'Praise Leader')
        or (song_section = 'worship' and assignment_row.role_name = 'Worship Leader')
      )
  )
$$;

-- Team rows remain SELECT-only to the app. Remove the historical broad RLS
-- write policy so lifecycle writes cannot become direct table writes if a
-- table grant is accidentally broadened later.
drop policy if exists "church admins manage teams" on public.teams;

-- Organisation events are generally organisation-readable, but a team-linked
-- event may only be created or mutated while that team is active and belongs
-- to the event's organisation. Existing archived rows remain physically kept.
drop policy if exists "admins and event managers create events" on public.events;
create policy "admins and event managers create events"
  on public.events for insert to authenticated
  with check (
    created_by = public.current_profile_id()
    and (team_id is null or public.team_org(team_id) = organisation_id)
    and (
      public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager')
    )
  );

drop policy if exists "admins and event managers update events" on public.events;
create policy "admins and event managers update events"
  on public.events for update to authenticated
  using (
    (team_id is null or public.team_org(team_id) = organisation_id)
    and (
      public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager')
    )
  )
  with check (
    (team_id is null or public.team_org(team_id) = organisation_id)
    and (
      public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager')
    )
  );

drop policy if exists "admins and event managers delete events" on public.events;
create policy "admins and event managers delete events"
  on public.events for delete to authenticated
  using (
    (team_id is null or public.team_org(team_id) = organisation_id)
    and (
      public.is_church_admin(organisation_id)
      or public.has_org_role(organisation_id, 'event_manager')
    )
  );

-- Linked chat images are history. The owner cleanup policy remains available
-- only for uploads that never acquired a chat_attachments row.
drop policy if exists "uploaders delete their own chat image objects" on storage.objects;
create policy "uploaders delete their own chat image objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and owner_id = (select auth.uid()::text)
    and not exists (
      select 1
      from public.chat_attachments attachment
      where attachment.file_url = name
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Church-admin team lifecycle RPCs.
-- ---------------------------------------------------------------------------

create function public.create_team(
  p_name text,
  p_description text default null,
  p_initial_admin_profile_id uuid default null
)
returns table (
  team_id uuid,
  organisation_id uuid,
  team_name text,
  team_description text,
  team_type public.team_type,
  avatar_url text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz,
  initial_admin_membership_id uuid,
  initial_admin_profile_id uuid,
  initial_admin_role public.team_role,
  initial_admin_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_name text := pg_catalog.btrim(p_name);
  v_description text := pg_catalog.btrim(coalesce(p_description, ''));
  v_team public.teams%rowtype;
  v_membership public.team_memberships%rowtype;
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;
  if v_caller_profile_id is null then
    if exists (
      select 1
      from public.user_accounts account
      join public.profiles profile on profile.id = account.active_profile_id
      where account.auth_user_id = v_auth_user_id
        and profile.access_status = 'removed'
    ) then
      raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
    end if;
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id
    and profile.auth_user_id = v_auth_user_id
    and profile.access_status = 'active';
  if v_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;

  perform 1
  from public.organisations organisation
  where organisation.id = v_organisation_id
  for update;
  perform 1
  from public.user_accounts account
  where account.auth_user_id = v_auth_user_id
  for update;
  if public.current_profile_id() is distinct from v_caller_profile_id then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
  end if;
  if not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_NAME';
  end if;
  if pg_catalog.char_length(v_description) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_DESCRIPTION';
  end if;

  if p_initial_admin_profile_id is not null then
    perform 1
    from public.profiles profile
    where profile.id = p_initial_admin_profile_id
      and profile.organisation_id = v_organisation_id
      and profile.auth_user_id is not null
      and profile.access_status = 'active'
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'INVALID_INITIAL_ADMIN';
    end if;
  end if;

  insert into public.teams (organisation_id, name, description, type, archived_at, archived_by)
  values (
    v_organisation_id,
    v_name,
    v_description,
    'generic'::public.team_type,
    null,
    null
  )
  returning * into v_team;

  if p_initial_admin_profile_id is not null then
    insert into public.team_memberships as membership (team_id, user_id, role)
    values (v_team.id, p_initial_admin_profile_id, 'team_leader'::public.team_role)
    on conflict on constraint team_memberships_team_id_user_id_key
    do update set role = 'team_leader'::public.team_role
    returning membership.* into v_membership;
  end if;

  return query select
    v_team.id,
    v_team.organisation_id,
    v_team.name,
    v_team.description,
    v_team.type,
    v_team.avatar_url,
    v_team.archived_at,
    v_team.archived_by,
    v_team.created_at,
    v_membership.id,
    v_membership.user_id,
    v_membership.role,
    v_membership.created_at;
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

create function public.update_team(
  p_team_id uuid,
  p_name text,
  p_description text default null
)
returns table (
  team_id uuid,
  organisation_id uuid,
  team_name text,
  team_description text,
  team_type public.team_type,
  avatar_url text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_name text := pg_catalog.btrim(p_name);
  v_description text := pg_catalog.btrim(coalesce(p_description, ''));
  v_team public.teams%rowtype;
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;
  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id
    and profile.auth_user_id = v_auth_user_id
    and profile.access_status = 'active';
  if v_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;
  perform 1 from public.organisations organisation
  where organisation.id = v_organisation_id for update;
  perform 1 from public.user_accounts account
  where account.auth_user_id = v_auth_user_id for update;
  if public.current_profile_id() is distinct from v_caller_profile_id then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
  end if;
  if not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_NAME';
  end if;
  if pg_catalog.char_length(v_description) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_DESCRIPTION';
  end if;

  select team.* into v_team
  from public.teams team
  where team.id = p_team_id
    and team.organisation_id = v_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;
  if v_team.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'TEAM_ARCHIVED';
  end if;

  update public.teams team
  set name = v_name,
      description = v_description
  where team.id = v_team.id
  returning team.* into v_team;

  return query select v_team.id, v_team.organisation_id, v_team.name,
    v_team.description, v_team.type, v_team.avatar_url, v_team.archived_at,
    v_team.archived_by, v_team.created_at;
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

create function public.archive_team(p_team_id uuid)
returns table (
  team_id uuid,
  organisation_id uuid,
  team_name text,
  team_description text,
  team_type public.team_type,
  avatar_url text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_team public.teams%rowtype;
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;
  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id
    and profile.auth_user_id = v_auth_user_id
    and profile.access_status = 'active';
  if v_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;
  perform 1 from public.organisations organisation
  where organisation.id = v_organisation_id for update;
  perform 1 from public.user_accounts account
  where account.auth_user_id = v_auth_user_id for update;
  if public.current_profile_id() is distinct from v_caller_profile_id then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
  end if;
  if not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  select team.* into v_team
  from public.teams team
  where team.id = p_team_id
    and team.organisation_id = v_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;
  if v_team.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'TEAM_ALREADY_ARCHIVED';
  end if;

  update public.teams team
  set archived_at = pg_catalog.now(),
      archived_by = v_caller_profile_id
  where team.id = v_team.id
  returning team.* into v_team;

  return query select v_team.id, v_team.organisation_id, v_team.name,
    v_team.description, v_team.type, v_team.avatar_url, v_team.archived_at,
    v_team.archived_by, v_team.created_at;
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

create function public.restore_team(p_team_id uuid)
returns table (
  team_id uuid,
  organisation_id uuid,
  team_name text,
  team_description text,
  team_type public.team_type,
  avatar_url text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_team public.teams%rowtype;
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;
  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id
    and profile.auth_user_id = v_auth_user_id
    and profile.access_status = 'active';
  if v_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;
  perform 1 from public.organisations organisation
  where organisation.id = v_organisation_id for update;
  perform 1 from public.user_accounts account
  where account.auth_user_id = v_auth_user_id for update;
  if public.current_profile_id() is distinct from v_caller_profile_id then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
  end if;
  if not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  select team.* into v_team
  from public.teams team
  where team.id = p_team_id
    and team.organisation_id = v_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;
  if v_team.archived_at is null then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_ARCHIVED';
  end if;

  update public.teams team
  set archived_at = null,
      archived_by = null
  where team.id = v_team.id
  returning team.* into v_team;

  return query select v_team.id, v_team.organisation_id, v_team.name,
    v_team.description, v_team.type, v_team.avatar_url, v_team.archived_at,
    v_team.archived_by, v_team.created_at;
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

-- Serialize membership addition with archive on the same team row and expose
-- a stable archive-specific failure instead of relying only on RLS/helper
-- denial. Optional initial-admin insertion in create_team remains atomic in
-- that RPC's transaction and does not pass through this ordinary-member RPC.
create or replace function public.add_team_member(
  p_team_id uuid,
  p_profile_id uuid
)
returns table (
  membership_id uuid,
  team_id uuid,
  profile_id uuid,
  role public.team_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_profile_id uuid := public.current_profile_id();
  v_caller_organisation_id uuid;
  v_team public.teams%rowtype;
begin
  select profile.organisation_id into v_caller_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id
    and profile.access_status = 'active';
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  select team.* into v_team
  from public.teams team
  where team.id = p_team_id
    and team.organisation_id = v_caller_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;
  if v_team.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'TEAM_ARCHIVED';
  end if;
  if not coalesce(public.can_manage_team(p_team_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.organisation_id = v_team.organisation_id
    and profile.auth_user_id is not null
    and profile.access_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_ELIGIBLE';
  end if;

  return query
  insert into public.team_memberships as membership (team_id, user_id, role)
  values (p_team_id, p_profile_id, 'member'::public.team_role)
  on conflict on constraint team_memberships_team_id_user_id_key
  do update set team_id = membership.team_id
  returning membership.id, membership.team_id, membership.user_id,
    membership.role, membership.created_at;
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

-- Leaving an archived team would erase retained membership history. This is
-- the one existing membership mutation that does not authorize through
-- can_manage_team, so it receives an explicit active-team lock/check.
create or replace function public.leave_team(p_team_id uuid)
returns table (
  membership_id uuid,
  team_id uuid,
  profile_id uuid,
  role public.team_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_profile_id uuid := public.current_profile_id();
  v_caller_organisation_id uuid;
  v_team public.teams%rowtype;
  v_own_membership public.team_memberships%rowtype;
  v_admin_count integer;
begin
  select profile.organisation_id into v_caller_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id
    and profile.access_status = 'active';
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  select team.* into v_team
  from public.teams team
  where team.id = p_team_id
    and team.organisation_id = v_caller_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;
  if v_team.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'TEAM_ARCHIVED';
  end if;

  select membership.* into v_own_membership
  from public.team_memberships membership
  where membership.team_id = p_team_id
    and membership.user_id = v_caller_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBERSHIP_NOT_FOUND';
  end if;

  if v_own_membership.role = 'team_leader'::public.team_role then
    select count(*) into v_admin_count
    from public.team_memberships membership
    where membership.team_id = p_team_id
      and membership.role = 'team_leader'::public.team_role;
    if v_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'FINAL_TEAM_ADMIN_LEAVE_BLOCKED';
    end if;
  end if;

  return query
  delete from public.team_memberships membership
  where membership.id = v_own_membership.id
  returning membership.id, membership.team_id, membership.user_id,
    membership.role, membership.created_at;
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

-- The deployed unread summary predates archive and enumerates memberships and
-- church-admin organisation teams directly. Keep the cursor/history rows, but
-- omit archived teams from the active session summary.
create or replace function public.get_team_chat_unread_summary()
returns table (
  team_id uuid,
  unread_count integer,
  latest_message_id uuid,
  latest_message_created_at timestamptz,
  latest_message_sender_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_org_id uuid;
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  select profile.organisation_id into v_org_id
  from public.profiles profile
  where profile.id = v_profile_id
    and profile.access_status = 'active';
  if v_org_id is null then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;

  return query
  with accessible as (
    select membership.team_id, membership.created_at as membership_created_at
    from public.team_memberships membership
    join public.teams team_row on team_row.id = membership.team_id
    where membership.user_id = v_profile_id
      and team_row.archived_at is null
    union all
    select team_row.id, null::timestamptz
    from public.teams team_row
    where public.is_church_admin(v_org_id)
      and team_row.organisation_id = v_org_id
      and team_row.archived_at is null
  ),
  team_access as (
    select accessible_row.team_id,
      max(accessible_row.membership_created_at) as membership_created_at
    from accessible accessible_row
    group by accessible_row.team_id
  ),
  cursors as (
    select team_access_row.team_id,
      read_state.last_read_at,
      read_state.last_read_message_id,
      greatest(
        read_state.last_read_at,
        team_access_row.membership_created_at
      ) as effective_at
    from team_access team_access_row
    left join public.chat_read_states read_state
      on read_state.user_id = v_profile_id
     and read_state.team_id = team_access_row.team_id
  )
  select
    cursor_row.team_id,
    coalesce((
      select count(*)::integer
      from public.chat_messages message
      where message.team_id = cursor_row.team_id
        and message.sender_id <> v_profile_id
        and cursor_row.effective_at is not null
        and (
          message.created_at > cursor_row.effective_at
          or (
            message.created_at = cursor_row.effective_at
            and cursor_row.last_read_message_id is not null
            and cursor_row.effective_at = cursor_row.last_read_at
            and message.id > cursor_row.last_read_message_id
          )
        )
    ), 0) as unread_count,
    latest.id,
    latest.created_at,
    latest.sender_id,
    cursor_row.last_read_message_id,
    cursor_row.last_read_at
  from cursors cursor_row
  left join lateral (
    select message.id, message.created_at, message.sender_id
    from public.chat_messages message
    where message.team_id = cursor_row.team_id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Explicit function ACLs and API documentation.
-- ---------------------------------------------------------------------------

revoke all on function public.create_team(text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.update_team(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.archive_team(uuid)
  from public, anon, authenticated;
revoke all on function public.restore_team(uuid)
  from public, anon, authenticated;

grant execute on function public.create_team(text, text, uuid) to authenticated;
grant execute on function public.update_team(uuid, text, text) to authenticated;
grant execute on function public.archive_team(uuid) to authenticated;
grant execute on function public.restore_team(uuid) to authenticated;

-- Replaced helper/member functions retain the established authenticated-only
-- execution boundary.
revoke all on function public.team_org(uuid) from public, anon, authenticated;
revoke all on function public.is_team_member(uuid) from public, anon, authenticated;
revoke all on function public.is_team_leader(uuid) from public, anon, authenticated;
revoke all on function public.can_access_team(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_team(uuid) from public, anon, authenticated;
revoke all on function public.is_choir_team(uuid) from public, anon, authenticated;
revoke all on function public.entry_team(uuid) from public, anon, authenticated;
revoke all on function public.assignment_team(uuid) from public, anon, authenticated;
revoke all on function public.song_team(uuid) from public, anon, authenticated;
revoke all on function public.message_team(uuid) from public, anon, authenticated;
revoke all on function public.is_my_assignment(uuid) from public, anon, authenticated;
revoke all on function public.is_song_leader_for_entry(uuid) from public, anon, authenticated;
revoke all on function public.is_section_leader_for_entry(uuid, text)
  from public, anon, authenticated;
revoke all on function public.add_team_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.leave_team(uuid)
  from public, anon, authenticated;
revoke all on function public.get_team_chat_unread_summary()
  from public, anon, authenticated;

grant execute on function public.team_org(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_team_leader(uuid) to authenticated;
grant execute on function public.can_access_team(uuid) to authenticated;
grant execute on function public.can_manage_team(uuid) to authenticated;
grant execute on function public.is_choir_team(uuid) to authenticated;
grant execute on function public.entry_team(uuid) to authenticated;
grant execute on function public.assignment_team(uuid) to authenticated;
grant execute on function public.song_team(uuid) to authenticated;
grant execute on function public.message_team(uuid) to authenticated;
grant execute on function public.is_my_assignment(uuid) to authenticated;
grant execute on function public.is_song_leader_for_entry(uuid) to authenticated;
grant execute on function public.is_section_leader_for_entry(uuid, text) to authenticated;
grant execute on function public.add_team_member(uuid, uuid) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.get_team_chat_unread_summary() to authenticated;

comment on function public.create_team(text, text, uuid) is
  'Creates one active team in the authenticated church admin active organisation, optionally with exactly one initial team-admin membership.';
comment on function public.update_team(uuid, text, text) is
  'Updates active team name and description under active-organisation church-admin authority.';
comment on function public.archive_team(uuid) is
  'Soft-archives one active team without deleting memberships, content, files, or history.';
comment on function public.restore_team(uuid) is
  'Restores the same archived team row and its retained membership-based access.';
comment on function public.leave_team(uuid) is
  'Removes only the active-team membership of the auth-derived caller; archived membership history is retained.';
comment on function public.get_team_chat_unread_summary() is
  'Returns server-authoritative unread metadata for active accessible teams only; archived read cursors and messages remain retained.';

commit;
