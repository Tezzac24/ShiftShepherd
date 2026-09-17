-- ============================================================================
-- Team Creation Idempotency V1
--
-- create_team is protected against ordinary double taps in the app, but an
-- ambiguous network retry (transport timeout after the server committed) could
-- still create two teams because the backend had no request-level idempotency
-- contract. This migration persists one client-generated request identifier
-- per logical create attempt on the created team row, scoped to the caller's
-- server-derived organisation, and makes create_team return the canonical
-- existing team (plus its existing initial membership, never re-inserted)
-- when the same organisation replays the same identifier.
--
-- Team names deliberately remain non-unique: a different request identifier
-- may create another team with the same display name. Historical teams keep a
-- null identifier and remain valid. update_team, archive_team, restore_team,
-- every helper, policy, trigger, and publication are unchanged, and no
-- existing row is created, removed, or rewritten.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Persisted creation-request identity, unique per organisation.
--
-- The partial unique index is the durable guarantee: even if the organisation
-- lock below were ever bypassed, two teams could not carry the same request
-- identifier inside one organisation. It is scoped to organisation_id so a
-- request identifier reused by another organisation can neither collide with
-- nor resolve to this organisation's team.
-- ---------------------------------------------------------------------------

alter table public.teams
  add column create_request_id uuid;

comment on column public.teams.create_request_id is
  'Client-generated identifier of the logical create_team request that created this row; null for teams created before request idempotency existed. Unique per organisation, never unique across organisations.';

create unique index teams_organisation_create_request_id_key
  on public.teams (organisation_id, create_request_id)
  where create_request_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Replace create_team with a required request identifier.
--
-- The previous three-argument signature is dropped rather than overloaded so
-- PostgREST resolution stays unambiguous and every create is keyed. The body
-- is the deployed Team Creation & Editing V1 function with one addition: an
-- organisation-scoped replay lookup under the existing organisation-row lock,
-- placed after every authority and validation check and before any insert.
-- ---------------------------------------------------------------------------

drop function public.create_team(text, text, uuid);

create function public.create_team(
  p_name text,
  p_description text default null,
  p_initial_admin_profile_id uuid default null,
  p_request_id uuid default null
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

  -- Every create is keyed. The parameter defaults to null only so an explicit
  -- omission fails with this stable contract rather than a PostgREST
  -- signature mismatch; the app always sends a fresh identifier.
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST_ID';
  end if;
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_NAME';
  end if;
  if pg_catalog.char_length(v_description) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_DESCRIPTION';
  end if;

  -- Replay: the organisation-row lock above serializes every create in this
  -- organisation, so the lookup cannot race the original insert. The team row
  -- is locked before its membership is read, matching the organisation -> team
  -- -> membership order used by archive/restore and the membership RPCs. The
  -- identifier only ever resolves inside the caller's own organisation.
  select team.* into v_team
  from public.teams team
  where team.organisation_id = v_organisation_id
    and team.create_request_id = p_request_id
  for update;
  if found then
    -- The identifier is bound to its original payload; a different name,
    -- description, or missing initial membership is not the same request.
    if v_team.name is distinct from v_name
      or v_team.description is distinct from v_description
    then
      raise exception using errcode = 'P0001', message = 'CREATE_REQUEST_MISMATCH';
    end if;
    if p_initial_admin_profile_id is not null then
      select membership.* into v_membership
      from public.team_memberships membership
      where membership.team_id = v_team.id
        and membership.user_id = p_initial_admin_profile_id;
      if not found then
        raise exception using errcode = 'P0001', message = 'CREATE_REQUEST_MISMATCH';
      end if;
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
    return;
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

  insert into public.teams (
    organisation_id,
    name,
    description,
    type,
    archived_at,
    archived_by,
    create_request_id
  )
  values (
    v_organisation_id,
    v_name,
    v_description,
    'generic'::public.team_type,
    null,
    null,
    p_request_id
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
  when serialization_failure or deadlock_detected or unique_violation then
    raise exception using errcode = 'P0001', message = 'CONFLICT_RETRY';
end;
$$;

comment on function public.create_team(text, text, uuid, uuid) is
  'Creates one active team in the authenticated church admin active organisation, optionally with exactly one initial team-admin membership. p_request_id is required: replaying the same identifier inside the same organisation returns the same existing team and membership without creating anything; another organisation can never resolve it; team names stay non-unique.';

-- ---------------------------------------------------------------------------
-- 3. Explicit function ACL for the replacement signature.
-- ---------------------------------------------------------------------------

revoke all on function public.create_team(text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_team(text, text, uuid, uuid) to authenticated;

commit;
