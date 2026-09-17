-- ============================================================================
-- Invitation acceptance role conflict target fix
--
-- accept_organisation_invitation_internal returns a table whose columns
-- include organisation_id. PL/pgSQL exposes those result columns as variables,
-- so the unqualified conflict target in its baseline role insert,
--   on conflict (organisation_id, user_id) do nothing
-- is ambiguous with the organisation_roles column. PostgreSQL raises SQLSTATE
-- 42702 the first time that statement runs, which is every first-time
-- acceptance (a new person or a re-invited removed profile). The whole call
-- rolls back, the Edge Function reports INVITATION_REQUEST_FAILED, and nobody
-- can join an organisation from an invitation. The already-accepted replay
-- branch returns before that insert, but no invitation can reach it.
--
-- This forward-only replacement is the definition deployed by
-- 20260712103321_add_organisation_membership_role_management.sql with one
-- change: the conflict target names the existing unique constraint
-- organisation_roles_organisation_id_user_id_key (unique on organisation_id,
-- user_id), which is not subject to PL/pgSQL name resolution. The signature,
-- result columns, SECURITY DEFINER, search_path, row locks, verified-email and
-- replay checks, removed-profile reactivation (baseline general_member only),
-- and service_role-only EXECUTE are unchanged. No table, policy, trigger,
-- index, grant on any other object, or existing row changes.
-- ============================================================================

begin;

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
  on conflict on constraint organisation_roles_organisation_id_user_id_key do nothing;

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

revoke all on function public.accept_organisation_invitation_internal(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_organisation_invitation_internal(uuid, text, text)
  to service_role;

commit;
