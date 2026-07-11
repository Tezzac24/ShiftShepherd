-- ============================================================================
-- Shift Shepherd - Team Membership Management V1
--
-- Team leaders and church admins can add an existing linked profile from the
-- same organisation to a team, or remove an ordinary member. Membership roles
-- are deliberately not editable in this slice: adds always use `member`, and
-- leader memberships cannot be removed through this API.
--
-- `authenticated` keeps SELECT-only table access. These narrow SECURITY
-- DEFINER RPCs derive the caller from auth.uid(), repeat every authority and
-- tenant check server-side, and expose no caller/organisation/role parameter.
-- ============================================================================

begin;

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
  v_caller_profile_id uuid;
  v_caller_organisation_id uuid;
  v_team_organisation_id uuid;
begin
  select p.id, p.organisation_id
  into v_caller_profile_id, v_caller_organisation_id
  from public.profiles p
  where p.auth_user_id = (select auth.uid());

  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  -- Restrict the lookup to the caller's organisation so a foreign team id is
  -- indistinguishable from an unknown id.
  select t.organisation_id
  into v_team_organisation_id
  from public.teams t
  where t.id = p_team_id
    and t.organisation_id = v_caller_organisation_id;

  if v_team_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  if not coalesce(public.can_manage_team(p_team_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  -- V1 adds only people who already have a linked Auth account. Missing,
  -- unlinked, and cross-organisation ids intentionally share one response.
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.organisation_id = v_team_organisation_id
      and p.auth_user_id is not null
  ) then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_ELIGIBLE';
  end if;

  -- The existing unique(team_id, user_id) constraint is the race-safe guard.
  -- A duplicate request returns the canonical existing row without changing
  -- its role or created_at, making retries idempotent.
  return query
  insert into public.team_memberships as membership (team_id, user_id, role)
  values (p_team_id, p_profile_id, 'member'::public.team_role)
  on conflict on constraint team_memberships_team_id_user_id_key
  do update set team_id = membership.team_id
  returning
    membership.id,
    membership.team_id,
    membership.user_id,
    membership.role,
    membership.created_at;
end;
$$;

comment on function public.add_team_member(uuid, uuid) is
  'Adds one linked same-organisation profile to a team as member when the auth.uid()-derived caller can_manage_team. Duplicate calls are idempotent.';

revoke all on function public.add_team_member(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.add_team_member(uuid, uuid)
  to authenticated;

create or replace function public.remove_team_member(
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
  v_caller_profile_id uuid;
  v_caller_organisation_id uuid;
  v_team_organisation_id uuid;
  v_membership public.team_memberships%rowtype;
begin
  select p.id, p.organisation_id
  into v_caller_profile_id, v_caller_organisation_id
  from public.profiles p
  where p.auth_user_id = (select auth.uid());

  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  select t.organisation_id
  into v_team_organisation_id
  from public.teams t
  where t.id = p_team_id
    and t.organisation_id = v_caller_organisation_id;

  if v_team_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  if not coalesce(public.can_manage_team(p_team_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  -- Leaving a team is a separate user-owned flow. Blocking self-removal keeps
  -- the caller's authenticated session permissions from becoming stale and
  -- prevents an accidental loss of management access.
  if p_profile_id = v_caller_profile_id then
    raise exception using errcode = 'P0001', message = 'SELF_REMOVAL_BLOCKED';
  end if;

  select membership.*
  into v_membership
  from public.team_memberships membership
  where membership.team_id = p_team_id
    and membership.user_id = p_profile_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBERSHIP_NOT_FOUND';
  end if;

  -- Removing a leader would also change team authority. Role reassignment is
  -- explicitly outside Membership Management V1, so preserve leadership and
  -- require the church-admin role-management workflow instead.
  if v_membership.role = 'team_leader'::public.team_role then
    raise exception using errcode = 'P0001', message = 'TEAM_LEADER_REMOVAL_BLOCKED';
  end if;

  return query
  delete from public.team_memberships membership
  where membership.id = v_membership.id
  returning
    membership.id,
    membership.team_id,
    membership.user_id,
    membership.role,
    membership.created_at;
end;
$$;

comment on function public.remove_team_member(uuid, uuid) is
  'Removes one ordinary membership when the auth.uid()-derived caller can_manage_team. Team-leader memberships are protected because role editing is outside V1.';

revoke all on function public.remove_team_member(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_team_member(uuid, uuid)
  to authenticated;

commit;
