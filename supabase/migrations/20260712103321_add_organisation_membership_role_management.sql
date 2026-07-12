-- ============================================================================
-- Shift Shepherd - Organisation Membership & Role Management V1
--
-- Profiles remain stable organisation identities and historical attribution
-- keys. Access removal is explicit soft state: current roles, team memberships,
-- and profile-owned push tokens are revoked, while every historical profile FK,
-- the global Auth user, user_accounts row, and other organisation profiles stay.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Explicit organisation-access lifecycle on stable profiles.
-- ---------------------------------------------------------------------------

create type public.organisation_access_status as enum ('active', 'removed');

alter table public.profiles
  add column access_status public.organisation_access_status not null default 'active',
  add column access_removed_at timestamptz,
  add column access_removed_by uuid references public.profiles (id) on delete set null,
  add column access_removal_reason text;

alter table public.profiles
  add constraint profiles_access_state_consistency_check check (
    (
      access_status = 'active'
      and access_removed_at is null
      and access_removed_by is null
      and access_removal_reason is null
    )
    or
    (
      access_status = 'removed'
      and access_removed_at is not null
      and access_removal_reason in ('admin_removed', 'self_left')
    )
  );

create index profiles_organisation_access_name_idx
  on public.profiles (organisation_id, access_status, lower(full_name), id);
create index profiles_auth_active_idx
  on public.profiles (auth_user_id, created_at, id)
  where auth_user_id is not null and access_status = 'active';
create index profiles_access_removed_by_idx
  on public.profiles (access_removed_by)
  where access_removed_by is not null;

comment on column public.profiles.access_status is
  'Current organisation access lifecycle. Removed profiles remain stable directory/history identities but grant no organisation access.';
comment on column public.profiles.access_removal_reason is
  'admin_removed or self_left. Historical authored and assigned rows are intentionally retained.';

-- An account pointer may reference only an active profile owned by that Auth
-- user. Existing rows were backfilled active, so this is forward-safe.
create or replace function public.validate_user_account_active_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active_profile_id is not null and not exists (
    select 1
    from public.profiles profile
    where profile.id = new.active_profile_id
      and profile.auth_user_id = new.auth_user_id
      and profile.access_status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_PROFILE_NOT_AVAILABLE';
  end if;
  return new;
end;
$$;

-- Defense in depth: privileged code must repair the account pointer before it
-- marks an active profile removed. App roles have no direct profile write grant.
create function public.validate_profile_access_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.access_status = 'active'
     and new.access_status = 'removed'
     and exists (
       select 1
       from public.user_accounts account
       where account.active_profile_id = new.id
     ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_PROFILE_REPAIR_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_access_transition
  before update of access_status on public.profiles
  for each row execute function public.validate_profile_access_transition();

revoke all on function public.validate_user_account_active_profile()
  from public, anon, authenticated;
revoke all on function public.validate_profile_access_transition()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Active-profile helpers and account state exclude removed access.
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id
  from public.user_accounts account
  join public.profiles profile
    on profile.id = account.active_profile_id
   and profile.auth_user_id = account.auth_user_id
   and profile.access_status = 'active'
  where account.auth_user_id = (select auth.uid())
$$;

drop function public.get_account_context();

create function public.get_account_context()
returns table (
  account_auth_user_id uuid,
  global_display_name text,
  name_confirmed_at timestamptz,
  active_profile_id uuid,
  profile_id uuid,
  organisation_id uuid,
  organisation_name text,
  profile_full_name text,
  display_name_override text,
  profile_email text,
  profile_phone text,
  profile_avatar_url text,
  profile_created_at timestamptz,
  profile_access_status public.organisation_access_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;

  insert into public.user_accounts (auth_user_id)
  values (v_auth_user_id)
  on conflict (auth_user_id) do nothing;

  return query
  select
    account.auth_user_id,
    account.global_display_name,
    account.name_confirmed_at,
    case
      when active_profile.id is not null then account.active_profile_id
      else null::uuid
    end,
    profile.id,
    profile.organisation_id,
    organisation.name,
    profile.full_name,
    profile.display_name_override,
    profile.email,
    profile.phone,
    profile.avatar_url,
    profile.created_at,
    profile.access_status
  from public.user_accounts account
  left join public.profiles active_profile
    on active_profile.id = account.active_profile_id
   and active_profile.auth_user_id = account.auth_user_id
   and active_profile.access_status = 'active'
  left join public.profiles profile
    on profile.auth_user_id = account.auth_user_id
   and profile.access_status = 'active'
  left join public.organisations organisation
    on organisation.id = profile.organisation_id
  where account.auth_user_id = v_auth_user_id
  order by organisation.name nulls first, profile.created_at, profile.id;
end;
$$;

create or replace function public.switch_active_profile(p_profile_id uuid)
returns table (
  profile_id uuid,
  organisation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_organisation_id uuid;
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;

  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.auth_user_id = v_auth_user_id
    and profile.access_status = 'active';
  if v_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_AVAILABLE';
  end if;

  update public.user_accounts account
  set active_profile_id = p_profile_id
  where account.auth_user_id = v_auth_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_NOT_FOUND';
  end if;

  return query select p_profile_id, v_organisation_id;
end;
$$;

-- Creation is available when the account has no current organisation access;
-- removed historical profiles do not block a fresh organisation.
create or replace function public.create_organisation(p_organisation_name text)
returns table (
  organisation_id uuid,
  profile_id uuid,
  organisation_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(p_organisation_name);
  v_global_name text;
  v_name_confirmed_at timestamptz;
  v_email text;
  v_email_confirmed_at timestamptz;
  v_organisation_id uuid;
  v_profile_id uuid;
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;
  if v_name is null or pg_catalog.char_length(v_name) < 2 then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_NAME_REQUIRED';
  end if;
  if pg_catalog.char_length(v_name) > 120 then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_NAME_TOO_LONG';
  end if;

  select account.global_display_name, account.name_confirmed_at
  into v_global_name, v_name_confirmed_at
  from public.user_accounts account
  where account.auth_user_id = v_auth_user_id
  for update;
  if v_global_name is null or v_name_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_REQUIRED';
  end if;
  if exists (
    select 1
    from public.profiles profile
    where profile.auth_user_id = v_auth_user_id
      and profile.access_status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ALREADY_JOINED';
  end if;

  select auth_user.email, auth_user.email_confirmed_at
  into v_email, v_email_confirmed_at
  from auth.users auth_user
  where auth_user.id = v_auth_user_id;
  if v_email is null or v_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'VERIFIED_EMAIL_REQUIRED';
  end if;
  v_email := lower(pg_catalog.btrim(v_email));

  insert into public.organisations (name)
  values (v_name)
  returning id into v_organisation_id;

  insert into public.profiles (
    auth_user_id,
    organisation_id,
    full_name,
    email,
    display_name_override
  ) values (
    v_auth_user_id,
    v_organisation_id,
    v_global_name,
    v_email,
    null
  ) returning id into v_profile_id;

  insert into public.organisation_roles (organisation_id, user_id, role)
  values (v_organisation_id, v_profile_id, 'church_admin');

  insert into public.event_categories (organisation_id, name, colour)
  values
    (v_organisation_id, 'Service', '#2F5FC4'),
    (v_organisation_id, 'Rehearsal', '#7556C8'),
    (v_organisation_id, 'Prayer Meeting', '#B34747'),
    (v_organisation_id, 'Bible Study', '#2D7D6A'),
    (v_organisation_id, 'Team Meeting', '#5D6B7A'),
    (v_organisation_id, 'Youth Event', '#D17A22'),
    (v_organisation_id, 'Children''s Ministry', '#C45C93'),
    (v_organisation_id, 'Outreach', '#3B8C4A'),
    (v_organisation_id, 'Special Event', '#A35AB5'),
    (v_organisation_id, 'Conference', '#336A9E'),
    (v_organisation_id, 'Social Event', '#A06B35'),
    (v_organisation_id, 'Other', '#6B7280');

  update public.user_accounts account
  set active_profile_id = v_profile_id
  where account.auth_user_id = v_auth_user_id;

  return query select v_organisation_id, v_profile_id, v_name;
end;
$$;

-- Internal account repair. The caller holds the profile and organisation rows;
-- this additionally serializes changes to the target account's active pointer.
create function public.repair_active_profile_after_access_loss(
  p_auth_user_id uuid,
  p_removed_profile_id uuid
)
returns table (
  active_profile_id uuid,
  remaining_profile_count integer,
  transition text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_active_profile_id uuid;
  v_next_profile_id uuid;
  v_remaining_count integer;
begin
  select account.active_profile_id
  into v_current_active_profile_id
  from public.user_accounts account
  where account.auth_user_id = p_auth_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_NOT_FOUND';
  end if;

  select
    count(*)::integer,
    (array_agg(profile.id order by profile.created_at, profile.id))[1]
  into v_remaining_count, v_next_profile_id
  from public.profiles profile
  where profile.auth_user_id = p_auth_user_id
    and profile.access_status = 'active'
    and profile.id <> p_removed_profile_id;

  if v_current_active_profile_id = p_removed_profile_id then
    if v_remaining_count = 1 then
      update public.user_accounts account
      set active_profile_id = v_next_profile_id
      where account.auth_user_id = p_auth_user_id;
      return query select v_next_profile_id, v_remaining_count, 'selected_remaining'::text;
    else
      update public.user_accounts account
      set active_profile_id = null
      where account.auth_user_id = p_auth_user_id;
      return query select null::uuid, v_remaining_count,
        case when v_remaining_count = 0 then 'no_organisations' else 'choose_organisation' end;
    end if;
  end if;

  -- The active pointer is intentionally unchanged when another organisation
  -- was removed. Touch the owner-readable account row anyway so every access
  -- loss invalidates that account's organisation selector immediately.
  update public.user_accounts account
  set updated_at = now()
  where account.auth_user_id = p_auth_user_id;

  return query select v_current_active_profile_id, v_remaining_count, 'active_unchanged'::text;
end;
$$;

revoke all on function public.repair_active_profile_after_access_loss(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bounded admin read model and transactional role replacement.
-- ---------------------------------------------------------------------------

create function public.list_organisation_members(
  p_search text default null,
  p_limit integer default 100
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  avatar_url text,
  access_status public.organisation_access_status,
  access_removed_at timestamptz,
  access_removal_reason text,
  linked boolean,
  role public.organisation_role_name,
  team_count integer,
  pending_invitation_status text,
  is_current_user boolean,
  is_last_church_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_search text := lower(left(pg_catalog.btrim(coalesce(p_search, '')), 100));
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id;
  if v_caller_profile_id is null
     or not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  return query
  with effective_admins as (
    select count(*)::integer as admin_count
    from public.organisation_roles role_row
    join public.profiles profile on profile.id = role_row.user_id
    where role_row.organisation_id = v_organisation_id
      and role_row.role = 'church_admin'
      and profile.access_status = 'active'
      and profile.auth_user_id is not null
  )
  select
    profile.id,
    profile.full_name,
    profile.email,
    profile.avatar_url,
    profile.access_status,
    profile.access_removed_at,
    profile.access_removal_reason,
    profile.auth_user_id is not null,
    role_row.role,
    count(distinct membership.id)::integer,
    pending.status,
    profile.id = v_caller_profile_id,
    coalesce(
      role_row.role = 'church_admin'
      and profile.access_status = 'active'
      and profile.auth_user_id is not null
      and effective_admins.admin_count = 1,
      false
    )
  from public.profiles profile
  left join public.organisation_roles role_row
    on role_row.organisation_id = profile.organisation_id
   and role_row.user_id = profile.id
  left join public.team_memberships membership on membership.user_id = profile.id
  left join lateral (
    select case
      when invitation.expires_at <= now() then 'expired'::text
      else invitation.status
    end as status
    from public.organisation_invitations invitation
    where invitation.target_profile_id = profile.id
      and invitation.status = 'pending'
    order by invitation.created_at desc, invitation.id desc
    limit 1
  ) pending on true
  cross join effective_admins
  where profile.organisation_id = v_organisation_id
    and (
      v_search = ''
      or pg_catalog.strpos(lower(profile.full_name), v_search) > 0
      or pg_catalog.strpos(lower(profile.email), v_search) > 0
    )
  group by profile.id, role_row.role, pending.status,
    effective_admins.admin_count, v_caller_profile_id
  order by
    case profile.access_status when 'active' then 0 else 1 end,
    lower(profile.full_name),
    profile.id
  limit v_limit;
end;
$$;

create function public.set_organisation_member_role(
  p_profile_id uuid,
  p_role text
)
returns table (
  profile_id uuid,
  role public.organisation_role_name
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_target public.profiles%rowtype;
  v_current_role public.organisation_role_name;
  v_new_role public.organisation_role_name;
  v_admin_count integer;
begin
  if p_role is null
     or p_role not in ('church_admin', 'announcement_manager', 'event_manager', 'general_member') then
    raise exception using errcode = 'P0001', message = 'INVALID_ROLE';
  end if;
  v_new_role := p_role::public.organisation_role_name;

  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;

  perform 1
  from public.organisations organisation
  where organisation.id = v_organisation_id
  for update;

  if not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  select profile.* into v_target
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.organisation_id = v_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_FOUND';
  end if;
  if v_target.access_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'ALREADY_REMOVED';
  end if;
  if v_target.auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_LINKED';
  end if;

  select role_row.role into v_current_role
  from public.organisation_roles role_row
  where role_row.organisation_id = v_organisation_id
    and role_row.user_id = p_profile_id
  for update;

  if v_current_role = 'church_admin' and v_new_role <> 'church_admin' then
    select count(*)::integer into v_admin_count
    from public.organisation_roles role_row
    join public.profiles profile on profile.id = role_row.user_id
    where role_row.organisation_id = v_organisation_id
      and role_row.role = 'church_admin'
      and profile.access_status = 'active'
      and profile.auth_user_id is not null;
    if v_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_CHURCH_ADMIN';
    end if;
  end if;

  insert into public.organisation_roles as role_row (
    organisation_id,
    user_id,
    role
  ) values (
    v_organisation_id,
    p_profile_id,
    v_new_role
  )
  on conflict (organisation_id, user_id) do update
    set role = excluded.role;

  return query select p_profile_id, v_new_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin removal and caller-owned Leave organisation.
-- ---------------------------------------------------------------------------

create function public.remove_organisation_member(p_profile_id uuid)
returns table (
  profile_id uuid,
  access_status public.organisation_access_status,
  active_profile_id uuid,
  remaining_profile_count integer,
  transition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_target public.profiles%rowtype;
  v_target_role public.organisation_role_name;
  v_admin_count integer;
  v_repair record;
begin
  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;

  perform 1
  from public.organisations organisation
  where organisation.id = v_organisation_id
  for update;
  if not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;
  if p_profile_id = v_caller_profile_id then
    raise exception using errcode = 'P0001', message = 'CANNOT_REMOVE_SELF_HERE';
  end if;

  select profile.* into v_target
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.organisation_id = v_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_FOUND';
  end if;
  if v_target.access_status = 'removed' then
    raise exception using errcode = 'P0001', message = 'ALREADY_REMOVED';
  end if;
  if v_target.auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_LINKED';
  end if;

  select role_row.role into v_target_role
  from public.organisation_roles role_row
  where role_row.organisation_id = v_organisation_id
    and role_row.user_id = p_profile_id
  for update;
  if v_target_role = 'church_admin' then
    select count(*)::integer into v_admin_count
    from public.organisation_roles role_row
    join public.profiles profile on profile.id = role_row.user_id
    where role_row.organisation_id = v_organisation_id
      and role_row.role = 'church_admin'
      and profile.access_status = 'active'
      and profile.auth_user_id is not null;
    if v_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_CHURCH_ADMIN';
    end if;
  end if;

  select * into v_repair
  from public.repair_active_profile_after_access_loss(
    v_target.auth_user_id,
    v_target.id
  );

  delete from public.organisation_roles role_row
  where role_row.organisation_id = v_organisation_id
    and role_row.user_id = v_target.id;
  delete from public.team_memberships membership
  using public.teams team
  where membership.user_id = v_target.id
    and team.id = membership.team_id
    and team.organisation_id = v_organisation_id;
  delete from public.push_tokens token where token.user_id = v_target.id;

  update public.profiles profile
  set access_status = 'removed',
      access_removed_at = now(),
      access_removed_by = v_caller_profile_id,
      access_removal_reason = 'admin_removed'
  where profile.id = v_target.id;

  return query select v_target.id, 'removed'::public.organisation_access_status,
    v_repair.active_profile_id, v_repair.remaining_profile_count, v_repair.transition;
end;
$$;

create function public.leave_organisation()
returns table (
  profile_id uuid,
  access_status public.organisation_access_status,
  active_profile_id uuid,
  remaining_profile_count integer,
  transition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
  v_caller_role public.organisation_role_name;
  v_admin_count integer;
  v_repair record;
begin
  if v_auth_user_id is null or v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;
  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_caller_profile_id;

  perform 1
  from public.organisations organisation
  where organisation.id = v_organisation_id
  for update;

  -- Serialize self-removal against team additions and push registration,
  -- which lock this same profile before creating current-access rows.
  perform 1
  from public.profiles profile
  where profile.id = v_caller_profile_id
    and profile.auth_user_id = v_auth_user_id
    and profile.access_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;

  select role_row.role into v_caller_role
  from public.organisation_roles role_row
  where role_row.organisation_id = v_organisation_id
    and role_row.user_id = v_caller_profile_id
  for update;
  if v_caller_role = 'church_admin' then
    select count(*)::integer into v_admin_count
    from public.organisation_roles role_row
    join public.profiles profile on profile.id = role_row.user_id
    where role_row.organisation_id = v_organisation_id
      and role_row.role = 'church_admin'
      and profile.access_status = 'active'
      and profile.auth_user_id is not null;
    if v_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_CHURCH_ADMIN';
    end if;
  end if;

  select * into v_repair
  from public.repair_active_profile_after_access_loss(
    v_auth_user_id,
    v_caller_profile_id
  );

  delete from public.organisation_roles role_row
  where role_row.organisation_id = v_organisation_id
    and role_row.user_id = v_caller_profile_id;
  delete from public.team_memberships membership
  using public.teams team
  where membership.user_id = v_caller_profile_id
    and team.id = membership.team_id
    and team.organisation_id = v_organisation_id;
  delete from public.push_tokens token where token.user_id = v_caller_profile_id;

  update public.profiles profile
  set access_status = 'removed',
      access_removed_at = now(),
      access_removed_by = v_caller_profile_id,
      access_removal_reason = 'self_left'
  where profile.id = v_caller_profile_id
    and profile.access_status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;

  return query select v_caller_profile_id, 'removed'::public.organisation_access_status,
    v_repair.active_profile_id, v_repair.remaining_profile_count, v_repair.transition;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Current-access writes serialize with removal and reject removed profiles.
-- ---------------------------------------------------------------------------

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
  v_team_organisation_id uuid;
begin
  select profile.organisation_id into v_caller_organisation_id
  from public.profiles profile where profile.id = v_caller_profile_id;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;
  select team.organisation_id into v_team_organisation_id
  from public.teams team
  where team.id = p_team_id and team.organisation_id = v_caller_organisation_id;
  if v_team_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;
  if not coalesce(public.can_manage_team(p_team_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;
  -- The target profile lock makes this eligibility decision atomic with
  -- organisation removal. If add wins, removal waits and deletes the new row;
  -- if removal wins, this check resumes against removed state and rejects.
  perform 1
  from public.profiles profile
    where profile.id = p_profile_id
      and profile.organisation_id = v_team_organisation_id
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
end;
$$;

-- Push registration is another current-access write. Locking the active
-- profile prevents a token from being inserted after removal cleanup.
create or replace function public.register_push_token(p_token text, p_platform text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_profile_id uuid := public.current_profile_id();
  v_registered_at timestamptz;
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;
  if p_token is null
     or pg_catalog.char_length(p_token) > 512
     or p_token !~ '^Expo(nent)?PushToken\[[^\s\[\]]+\]$' then
    raise exception using errcode = 'P0001', message = 'INVALID_EXPO_PUSH_TOKEN';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception using errcode = 'P0001', message = 'UNSUPPORTED_PLATFORM';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = v_profile_id
    and profile.auth_user_id = v_auth_user_id
    and profile.access_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORGANISATION_ACCESS_REMOVED';
  end if;

  insert into public.push_tokens as token_row (user_id, token, platform)
  values (v_profile_id, p_token, p_platform::public.push_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform
  returning token_row.updated_at into v_registered_at;

  return v_registered_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Removed-profile invitation rejoin. Existing active unlinked profiles keep
--    their deliberate setup; removed profiles reactivate with baseline role.
-- ---------------------------------------------------------------------------

create or replace function public.validate_organisation_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_organisation_id uuid;
  v_target_auth_user_id uuid;
  v_target_email text;
  v_target_access_status public.organisation_access_status;
  v_inviter_organisation_id uuid;
begin
  select profile.organisation_id into v_inviter_organisation_id
  from public.profiles profile
  where profile.id = new.invited_by_profile_id;
  if v_inviter_organisation_id is distinct from new.organisation_id then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVITER_WRONG_ORGANISATION';
  end if;

  if new.target_profile_id is not null then
    select profile.organisation_id, profile.auth_user_id,
      lower(pg_catalog.btrim(profile.email)), profile.access_status
    into v_target_organisation_id, v_target_auth_user_id,
      v_target_email, v_target_access_status
    from public.profiles profile
    where profile.id = new.target_profile_id;
    if v_target_organisation_id is distinct from new.organisation_id then
      raise exception using errcode = 'P0001', message = 'INVITATION_TARGET_WRONG_ORGANISATION';
    end if;
    if v_target_email is distinct from new.invited_email_normalized then
      raise exception using errcode = 'P0001', message = 'INVITATION_TARGET_EMAIL_MISMATCH';
    end if;
    if new.status = 'pending'
       and v_target_auth_user_id is not null
       and v_target_access_status <> 'removed' then
      raise exception using errcode = 'P0001', message = 'PROFILE_ALREADY_LINKED';
    end if;
    if new.status = 'accepted'
       and v_target_auth_user_id is distinct from new.accepted_by_auth_user_id then
      raise exception using errcode = 'P0001', message = 'INVITATION_ACCEPTOR_MISMATCH';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.organisation_id is distinct from new.organisation_id
       or old.invited_email_normalized is distinct from new.invited_email_normalized
       or old.target_profile_id is distinct from new.target_profile_id
       or old.token_hash is distinct from new.token_hash
       or old.invited_by_profile_id is distinct from new.invited_by_profile_id
       or old.created_at is distinct from new.created_at then
      raise exception using errcode = 'P0001', message = 'INVITATION_IMMUTABLE_FIELDS';
    end if;
    if old.status <> 'pending' and new.status is distinct from old.status then
      raise exception using errcode = 'P0001', message = 'INVITATION_TERMINAL';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.issue_organisation_invitation_internal(
  p_caller_auth_user_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid,
  p_invited_email text,
  p_token_hash_hex text
)
returns table (
  invitation_id uuid,
  invited_email text,
  organisation_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter_profile_id uuid;
  v_organisation_name text;
  v_email text;
  v_target_auth_user_id uuid;
  v_target_access_status public.organisation_access_status;
  v_target_profile_id uuid := p_target_profile_id;
  v_invitation_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if p_token_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_TOKEN_HASH';
  end if;

  select profile.id, organisation.name
  into v_inviter_profile_id, v_organisation_name
  from public.user_accounts account
  join public.profiles profile
    on profile.id = account.active_profile_id
   and profile.access_status = 'active'
  join public.organisations organisation on organisation.id = profile.organisation_id
  join public.organisation_roles role_row
    on role_row.organisation_id = profile.organisation_id
   and role_row.user_id = profile.id
   and role_row.role = 'church_admin'
  where account.auth_user_id = p_caller_auth_user_id
    and profile.auth_user_id = p_caller_auth_user_id
    and profile.organisation_id = p_organisation_id;
  if v_inviter_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  update public.organisation_invitations invitation
  set status = 'expired'
  where invitation.organisation_id = p_organisation_id
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  if v_target_profile_id is not null then
    select lower(pg_catalog.btrim(profile.email)), profile.auth_user_id,
      profile.access_status
    into v_email, v_target_auth_user_id, v_target_access_status
    from public.profiles profile
    where profile.id = v_target_profile_id
      and profile.organisation_id = p_organisation_id
    for update;
    if v_email is null then
      raise exception using errcode = 'P0001', message = 'PROFILE_NOT_ELIGIBLE';
    end if;
    if v_target_auth_user_id is not null and v_target_access_status <> 'removed' then
      raise exception using errcode = 'P0001', message = 'PROFILE_ALREADY_LINKED';
    end if;
  else
    v_email := lower(pg_catalog.btrim(p_invited_email));
  end if;

  if v_email is null
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode = 'P0001', message = 'VALID_EMAIL_REQUIRED';
  end if;

  if v_target_profile_id is null then
    select profile.id, profile.auth_user_id, profile.access_status
    into v_target_profile_id, v_target_auth_user_id, v_target_access_status
    from public.profiles profile
    where profile.organisation_id = p_organisation_id
      and lower(pg_catalog.btrim(profile.email)) = v_email
    for update;
    if found
       and v_target_auth_user_id is not null
       and v_target_access_status <> 'removed' then
      raise exception using errcode = 'P0001', message = 'PROFILE_ALREADY_LINKED';
    end if;
  end if;

  if exists (
    select 1
    from public.organisation_invitations invitation
    where invitation.organisation_id = p_organisation_id
      and invitation.status = 'pending'
      and (
        invitation.invited_email_normalized = v_email
        or (v_target_profile_id is not null and invitation.target_profile_id = v_target_profile_id)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVITATION_ALREADY_PENDING';
  end if;

  insert into public.organisation_invitations (
    organisation_id, invited_email_normalized, target_profile_id,
    token_hash, invited_by_profile_id, expires_at
  ) values (
    p_organisation_id, v_email, v_target_profile_id,
    decode(p_token_hash_hex, 'hex'), v_inviter_profile_id, v_expires_at
  ) returning id into v_invitation_id;

  return query select v_invitation_id, v_email, v_organisation_name, v_expires_at;
end;
$$;

create or replace function public.accept_organisation_invitation_internal(
  p_caller_auth_user_id uuid,
  p_token_hash_hex text,
  p_global_display_name text
)
returns table (
  invitation_id uuid,
  profile_id uuid,
  organisation_id uuid,
  organisation_name text,
  global_display_name text,
  already_accepted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.organisation_invitations%rowtype;
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_global_name text;
  v_supplied_name text := nullif(pg_catalog.btrim(p_global_display_name), '');
  v_profile public.profiles%rowtype;
  v_existing_active_profile_id uuid;
  v_organisation_name text;
  v_was_removed boolean := false;
begin
  if p_token_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID';
  end if;

  select invitation.* into v_invitation
  from public.organisation_invitations invitation
  where invitation.token_hash = decode(p_token_hash_hex, 'hex')
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID';
  end if;

  if v_invitation.status = 'accepted' then
    if v_invitation.accepted_by_auth_user_id <> p_caller_auth_user_id then
      raise exception using errcode = 'P0001', message = 'INVITATION_ALREADY_ACCEPTED';
    end if;
    select profile.* into v_profile
    from public.profiles profile
    where profile.auth_user_id = p_caller_auth_user_id
      and profile.organisation_id = v_invitation.organisation_id
      and profile.access_status = 'active';
    if v_profile.id is null then
      raise exception using errcode = 'P0001', message = 'INVITATION_ACCEPTANCE_INCOMPLETE';
    end if;
    update public.user_accounts
    set active_profile_id = v_profile.id
    where auth_user_id = p_caller_auth_user_id;
    select organisation.name into v_organisation_name
    from public.organisations organisation where organisation.id = v_profile.organisation_id;
    select account.global_display_name into v_global_name
    from public.user_accounts account where account.auth_user_id = p_caller_auth_user_id;
    return query select v_invitation.id, v_profile.id, v_profile.organisation_id,
      v_organisation_name, v_global_name, true;
    return;
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVITATION_' || upper(v_invitation.status);
  end if;
  if v_invitation.expires_at <= now() then
    update public.organisation_invitations set status = 'expired' where id = v_invitation.id;
    raise exception using errcode = 'P0001', message = 'INVITATION_EXPIRED';
  end if;

  select lower(pg_catalog.btrim(auth_user.email)), auth_user.email_confirmed_at
  into v_auth_email, v_email_confirmed_at
  from auth.users auth_user
  where auth_user.id = p_caller_auth_user_id;
  if v_auth_email is null or v_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'VERIFIED_EMAIL_REQUIRED';
  end if;
  if v_auth_email <> v_invitation.invited_email_normalized then
    raise exception using errcode = 'P0001', message = 'INVITATION_EMAIL_MISMATCH';
  end if;

  insert into public.user_accounts (auth_user_id)
  values (p_caller_auth_user_id)
  on conflict (auth_user_id) do nothing;
  select account.global_display_name into v_global_name
  from public.user_accounts account
  where account.auth_user_id = p_caller_auth_user_id
  for update;
  if v_global_name is null then
    if v_supplied_name is null or pg_catalog.char_length(v_supplied_name) < 2 then
      raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_REQUIRED';
    end if;
    if pg_catalog.char_length(v_supplied_name) > 100 then
      raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_TOO_LONG';
    end if;
    update public.user_accounts
    set global_display_name = v_supplied_name, name_confirmed_at = now()
    where auth_user_id = p_caller_auth_user_id;
    v_global_name := v_supplied_name;
  end if;

  select profile.id into v_existing_active_profile_id
  from public.profiles profile
  where profile.auth_user_id = p_caller_auth_user_id
    and profile.organisation_id = v_invitation.organisation_id
    and profile.access_status = 'active'
  for update;

  if v_invitation.target_profile_id is not null then
    select profile.* into v_profile
    from public.profiles profile
    where profile.id = v_invitation.target_profile_id
      and profile.organisation_id = v_invitation.organisation_id
    for update;
    if v_profile.id is null
       or lower(pg_catalog.btrim(v_profile.email)) <> v_invitation.invited_email_normalized then
      raise exception using errcode = 'P0001', message = 'PROFILE_NOT_ELIGIBLE';
    end if;
    if v_profile.auth_user_id is not null
       and v_profile.auth_user_id <> p_caller_auth_user_id then
      raise exception using errcode = 'P0001', message = 'PROFILE_ALREADY_LINKED';
    end if;
    if v_existing_active_profile_id is not null
       and v_existing_active_profile_id <> v_profile.id then
      raise exception using errcode = 'P0001', message = 'ORGANISATION_ALREADY_JOINED';
    end if;
    v_was_removed := v_profile.access_status = 'removed';

    update public.profiles profile
    set auth_user_id = p_caller_auth_user_id,
        full_name = v_global_name,
        display_name_override = null,
        access_status = 'active',
        access_removed_at = null,
        access_removed_by = null,
        access_removal_reason = null
    where profile.id = v_profile.id
    returning profile.* into v_profile;
  else
    if v_existing_active_profile_id is not null then
      raise exception using errcode = 'P0001', message = 'ORGANISATION_ALREADY_JOINED';
    end if;
    insert into public.profiles (
      auth_user_id, organisation_id, full_name, email, display_name_override
    ) values (
      p_caller_auth_user_id, v_invitation.organisation_id, v_global_name,
      v_invitation.invited_email_normalized, null
    ) returning * into v_profile;
  end if;

  if v_was_removed then
    delete from public.organisation_roles role_row
    where role_row.organisation_id = v_profile.organisation_id
      and role_row.user_id = v_profile.id;
    delete from public.team_memberships membership
    using public.teams team
    where membership.user_id = v_profile.id
      and team.id = membership.team_id
      and team.organisation_id = v_profile.organisation_id;
    delete from public.push_tokens token where token.user_id = v_profile.id;
  end if;

  insert into public.organisation_roles (organisation_id, user_id, role)
  values (v_profile.organisation_id, v_profile.id, 'general_member')
  on conflict (organisation_id, user_id) do nothing;

  update public.user_accounts
  set active_profile_id = v_profile.id
  where auth_user_id = p_caller_auth_user_id;

  update public.organisation_invitations invitation
  set status = 'accepted', accepted_by_auth_user_id = p_caller_auth_user_id,
      accepted_at = now()
  where invitation.id = v_invitation.id;

  select organisation.name into v_organisation_name
  from public.organisations organisation
  where organisation.id = v_profile.organisation_id;

  return query select v_invitation.id, v_profile.id, v_profile.organisation_id,
    v_organisation_name, v_global_name, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS/ACL boundary: profiles and organisation roles are read-only tables
--    for app roles; all sensitive writes use the RPCs above.
-- ---------------------------------------------------------------------------

drop policy if exists "church admins manage organisation roles"
  on public.organisation_roles;

revoke all on table public.organisation_roles from anon, authenticated;
grant select on table public.organisation_roles to authenticated;
revoke insert, update, delete on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

revoke all on function public.current_profile_id() from public, anon, authenticated;
revoke all on function public.get_account_context() from public, anon, authenticated;
revoke all on function public.switch_active_profile(uuid) from public, anon, authenticated;
revoke all on function public.create_organisation(text) from public, anon, authenticated;
revoke all on function public.list_organisation_members(text, integer) from public, anon, authenticated;
revoke all on function public.set_organisation_member_role(uuid, text) from public, anon, authenticated;
revoke all on function public.remove_organisation_member(uuid) from public, anon, authenticated;
revoke all on function public.leave_organisation() from public, anon, authenticated;
revoke all on function public.add_team_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.register_push_token(text, text) from public, anon, authenticated;
revoke all on function public.validate_organisation_invitation() from public, anon, authenticated;
revoke all on function public.issue_organisation_invitation_internal(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.accept_organisation_invitation_internal(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.get_account_context() to authenticated;
grant execute on function public.switch_active_profile(uuid) to authenticated;
grant execute on function public.create_organisation(text) to authenticated;
grant execute on function public.list_organisation_members(text, integer) to authenticated;
grant execute on function public.set_organisation_member_role(uuid, text) to authenticated;
grant execute on function public.remove_organisation_member(uuid) to authenticated;
grant execute on function public.leave_organisation() to authenticated;
grant execute on function public.add_team_member(uuid, uuid) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.issue_organisation_invitation_internal(uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.accept_organisation_invitation_internal(uuid, text, text)
  to service_role;

comment on function public.list_organisation_members(text, integer) is
  'Admin-only bounded member read model for the active organisation; exposes no Auth ids, invitation hashes, or push tokens.';
comment on function public.set_organisation_member_role(uuid, text) is
  'Replaces one active linked member role. The shared organisation row lock serializes last-church-admin checks.';
comment on function public.remove_organisation_member(uuid) is
  'Revokes another active linked profile access while retaining its profile/history/global account and repairing its active profile atomically.';
comment on function public.leave_organisation() is
  'Revokes only the auth.uid()-derived current organisation access, with last-admin protection and atomic active-profile repair.';

-- The account row is owner-readable through RLS. Publishing its UPDATE gives
-- the affected account an immediate invalidation when an admin changes its
-- active profile; payload data is never applied directly by the client.
alter publication supabase_realtime add table public.user_accounts;

commit;
