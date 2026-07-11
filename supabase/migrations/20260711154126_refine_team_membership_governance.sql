-- ============================================================================
-- Shift Shepherd - Membership Governance and Leave Team V1
--
-- Organisation authority and a person's role inside one team are independent.
-- Team leaders may remove ordinary members (including church admins whose team
-- role is `member`), while only church admins may remove a non-final team
-- leader. Every member leaves through the caller-owned `leave_team` RPC.
--
-- Both removal paths lock the owning team row before reading/deleting an
-- administrative membership. That team-scoped lock serializes simultaneous
-- leader removal/leave operations, so two transactions cannot both observe
-- another leader and leave a team without leadership.
-- ============================================================================

begin;

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
  v_target_membership public.team_memberships%rowtype;
  v_remaining_admin_count integer;
begin
  select profile.id, profile.organisation_id
  into v_caller_profile_id, v_caller_organisation_id
  from public.profiles profile
  where profile.auth_user_id = (select auth.uid());

  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  -- Scope the lookup to the caller's organisation and acquire the common
  -- team lock before any membership lock/count. A foreign id remains
  -- indistinguishable from an unknown id.
  select team.organisation_id
  into v_team_organisation_id
  from public.teams team
  where team.id = p_team_id
    and team.organisation_id = v_caller_organisation_id
  for update;

  if v_team_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  if not coalesce(public.can_manage_team(p_team_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  if p_profile_id = v_caller_profile_id then
    raise exception using errcode = 'P0001', message = 'SELF_REMOVAL_USE_LEAVE_TEAM';
  end if;

  select membership.*
  into v_target_membership
  from public.team_memberships membership
  where membership.team_id = p_team_id
    and membership.user_id = p_profile_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBERSHIP_NOT_FOUND';
  end if;

  -- Target protection depends only on this membership's team role. The
  -- target's organisation role is deliberately never read or changed.
  if v_target_membership.role = 'team_leader'::public.team_role then
    if not coalesce(public.is_church_admin(v_team_organisation_id), false) then
      raise exception using errcode = 'P0001', message = 'PEER_TEAM_ADMIN_REMOVAL_BLOCKED';
    end if;

    select count(*)
    into v_remaining_admin_count
    from public.team_memberships membership
    where membership.team_id = p_team_id
      and membership.role = 'team_leader'::public.team_role;

    if v_remaining_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'FINAL_TEAM_ADMIN_REMOVAL_BLOCKED';
    end if;
  end if;

  return query
  delete from public.team_memberships membership
  where membership.id = v_target_membership.id
  returning
    membership.id,
    membership.team_id,
    membership.user_id,
    membership.role,
    membership.created_at;
end;
$$;

comment on function public.remove_team_member(uuid, uuid) is
  'Removes one non-self team membership for an auth.uid()-derived manager. Team leaders cannot remove peer leaders; church admins may remove a non-final leader. Organisation roles and accounts are untouched.';

create or replace function public.leave_team(
  p_team_id uuid
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
  v_own_membership public.team_memberships%rowtype;
  v_admin_count integer;
begin
  select profile.id, profile.organisation_id
  into v_caller_profile_id, v_caller_organisation_id
  from public.profiles profile
  where profile.auth_user_id = (select auth.uid());

  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;

  select team.organisation_id
  into v_team_organisation_id
  from public.teams team
  where team.id = p_team_id
    and team.organisation_id = v_caller_organisation_id
  for update;

  if v_team_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  select membership.*
  into v_own_membership
  from public.team_memberships membership
  where membership.team_id = p_team_id
    and membership.user_id = v_caller_profile_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBERSHIP_NOT_FOUND';
  end if;

  if v_own_membership.role = 'team_leader'::public.team_role then
    select count(*)
    into v_admin_count
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
  returning
    membership.id,
    membership.team_id,
    membership.user_id,
    membership.role,
    membership.created_at;
end;
$$;

comment on function public.leave_team(uuid) is
  'Removes only the auth.uid()-derived caller membership. A team leader may leave only when another leader remains; profile, Auth account, organisation role, and other memberships are untouched.';

-- Keep the membership table read-only to app roles. Postgres/Supabase default
-- ancillary grants are removed too; all writes stay behind the narrow RPCs.
revoke all on table public.team_memberships from anon, authenticated;
grant select on table public.team_memberships to authenticated;

revoke all on function public.remove_team_member(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_team_member(uuid, uuid)
  to authenticated;

revoke all on function public.leave_team(uuid)
  from public, anon, authenticated;
grant execute on function public.leave_team(uuid)
  to authenticated;

commit;
