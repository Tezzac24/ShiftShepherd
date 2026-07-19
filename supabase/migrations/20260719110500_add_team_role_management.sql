-- ============================================================================
-- Team Role Management V1
--
-- Adds the one missing team-membership write: changing an existing member's
-- team role. Only an active organisation church admin may promote a member to
-- team_leader or demote a team_leader to member. Zero-leader teams stay valid:
-- the final team leader may be deliberately demoted, and a zero-leader team is
-- recovered by promoting an existing member. Team leaders who are not church
-- admins cannot change roles; the existing remove_team_member / leave_team
-- final-leader protections are intentionally untouched, so demotion-first is
-- the supported way to release a final leader.
--
-- No table, column, enum, trigger, policy, or publication changes. No rows are
-- created, removed, or backfilled.
-- ============================================================================

begin;

create function public.set_team_member_role(
  p_team_id uuid,
  p_profile_id uuid,
  p_role public.team_role
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
  v_auth_user_id uuid := (select auth.uid());
  v_caller_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
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
  if p_role is null then
    raise exception using errcode = 'P0001', message = 'INVALID_ROLE';
  end if;

  -- The shared team-row lock serializes role changes with archive/restore and
  -- with the final-admin counts inside remove_team_member and leave_team. An
  -- organisation-scoped lookup keeps a foreign team id indistinguishable from
  -- an unknown id.
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

  -- The target profile lock makes this role write atomic with organisation
  -- removal cleanup: if the role change wins, removal waits and then deletes
  -- the membership; if removal wins, this check resumes against removed state
  -- and rejects. Removed, unlinked, and cross-organisation targets share the
  -- missing-membership response without leaking why.
  perform 1
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.organisation_id = v_team.organisation_id
    and profile.auth_user_id is not null
    and profile.access_status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBERSHIP_NOT_FOUND';
  end if;

  -- Role management only changes an existing membership; it never creates one.
  -- A church admin adds the person through add_team_member first.
  select membership.* into v_membership
  from public.team_memberships membership
  where membership.team_id = p_team_id
    and membership.user_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBERSHIP_NOT_FOUND';
  end if;

  -- Idempotent: an unchanged role returns the canonical row without rewriting
  -- it. There is deliberately no final-leader block here — demoting the final
  -- team_leader to zero leaders is a valid church-admin decision, and no
  -- replacement leader or membership is ever created automatically.
  if v_membership.role is distinct from p_role then
    update public.team_memberships membership
    set role = p_role
    where membership.id = v_membership.id
    returning membership.* into v_membership;
  end if;

  return query select
    v_membership.id,
    v_membership.team_id,
    v_membership.user_id,
    v_membership.role,
    v_membership.created_at;
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

comment on function public.set_team_member_role(uuid, uuid, public.team_role) is
  'Sets one existing same-organisation team membership to member or team_leader for an auth.uid()-derived active church admin. Archived teams are rejected, unchanged roles are idempotent, final-leader demotion to a zero-leader team is allowed, and no membership is created or removed.';

revoke all on function public.set_team_member_role(uuid, uuid, public.team_role)
  from public, anon, authenticated;
grant execute on function public.set_team_member_role(uuid, uuid, public.team_role) to authenticated;

commit;
