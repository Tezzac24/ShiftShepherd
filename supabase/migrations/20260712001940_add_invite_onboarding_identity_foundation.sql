-- ============================================================================
-- Shift Shepherd - Invite, onboarding, and multi-organisation identity V1
--
-- Forward-only compatibility migration. Existing profiles remain the stable
-- organisation-scoped identity referenced by teams, rotas, chat, unread
-- cursors, notification preferences, and push tokens. A new user_accounts row
-- owns account-global display name and the one active organisation profile.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Stop email-only organisation access and make profiles multi-org capable.
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created_link_existing_profile on auth.users;
drop function if exists public.link_auth_user_to_existing_profile();

drop index if exists public.profiles_email_lower_uidx;
alter table public.profiles drop constraint if exists profiles_auth_user_id_key;

alter table public.profiles
  add column display_name_override text;

alter table public.profiles
  add constraint profiles_display_name_override_length_check
  check (
    display_name_override is null
    or pg_catalog.char_length(pg_catalog.btrim(display_name_override)) between 2 and 100
  );

create unique index profiles_auth_user_organisation_uidx
  on public.profiles (auth_user_id, organisation_id)
  where auth_user_id is not null;

create unique index profiles_organisation_email_lower_uidx
  on public.profiles (organisation_id, lower(pg_catalog.btrim(email)));

comment on column public.profiles.display_name_override is
  'Optional organisation-specific display name. profiles.full_name remains the synchronized effective name (override ?? user_accounts.global_display_name) for compatibility.';

-- ---------------------------------------------------------------------------
-- 2. Account-global identity and active-profile integrity.
-- ---------------------------------------------------------------------------

create table public.user_accounts (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  global_display_name text,
  name_confirmed_at timestamptz,
  active_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_accounts_global_name_length_check check (
    global_display_name is null
    or pg_catalog.char_length(pg_catalog.btrim(global_display_name)) between 2 and 100
  ),
  constraint user_accounts_name_confirmation_check check (
    (global_display_name is null and name_confirmed_at is null)
    or global_display_name is not null
  )
);

create index user_accounts_active_profile_idx
  on public.user_accounts (active_profile_id)
  where active_profile_id is not null;

create trigger user_accounts_set_updated_at
  before update on public.user_accounts
  for each row execute function public.set_updated_at();

create function public.validate_user_account_active_profile()
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
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_PROFILE_NOT_OWNED';
  end if;
  return new;
end;
$$;

create trigger user_accounts_validate_active_profile
  before insert or update of auth_user_id, active_profile_id on public.user_accounts
  for each row execute function public.validate_user_account_active_profile();

revoke all on function public.validate_user_account_active_profile()
  from public, anon, authenticated;

-- Backfill one account row per existing Auth identity. The oldest linked
-- profile supplies the deterministic global name and active context.
insert into public.user_accounts (
  auth_user_id,
  global_display_name,
  name_confirmed_at,
  active_profile_id
)
select
  auth_user.id,
  first_profile.full_name,
  case when first_profile.id is null then null else now() end,
  first_profile.id
from auth.users auth_user
left join lateral (
  select profile.id, profile.full_name
  from public.profiles profile
  where profile.auth_user_id = auth_user.id
  order by profile.created_at, profile.id
  limit 1
) first_profile on true
on conflict (auth_user_id) do nothing;

-- Preserve every visible existing name. A linked profile whose name differs
-- from the chosen account-global name becomes an explicit org override.
update public.profiles profile
set display_name_override = case
  when profile.full_name is distinct from account.global_display_name
    then profile.full_name
  else null
end
from public.user_accounts account
where profile.auth_user_id = account.auth_user_id;

create function public.create_user_account_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_accounts (auth_user_id)
  values (new.id)
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

comment on function public.create_user_account_for_auth_user() is
  'Creates only the account-global identity shell for a new Auth user. It never links or creates organisation access.';

revoke all on function public.create_user_account_for_auth_user()
  from public, anon, authenticated;

create trigger on_auth_user_created_create_account
  after insert on auth.users
  for each row execute function public.create_user_account_for_auth_user();

alter table public.user_accounts enable row level security;

create policy "users view their own account identity"
  on public.user_accounts for select to authenticated
  using (auth_user_id = (select auth.uid()));

revoke all on table public.user_accounts from public, anon, authenticated;
grant select on table public.user_accounts to authenticated;
grant select on table public.user_accounts to service_role;

-- Profile changes stay behind narrow RPCs. The historical broad UPDATE policy
-- is removed even though authenticated already has no table UPDATE grant.
drop policy if exists "users can update their own profile" on public.profiles;

-- ---------------------------------------------------------------------------
-- 3. Active-profile-aware identity helpers. Normal Data API queries expose
--    only the active organisation, never all organisations linked to account.
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
  where account.auth_user_id = (select auth.uid())
$$;

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = public.current_profile_id()
      and profile.organisation_id = org
  )
$$;

create or replace function public.has_org_role(
  org uuid,
  required public.organisation_role_name
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_roles role_row
    where role_row.user_id = public.current_profile_id()
      and role_row.organisation_id = org
      and role_row.role = required
  )
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
    where membership.user_id = public.current_profile_id()
      and membership.team_id = team
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
    where membership.user_id = public.current_profile_id()
      and membership.team_id = team
      and membership.role = 'team_leader'
  )
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
    where assignment_row.id = assignment
      and assignment_row.user_id = public.current_profile_id()
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
    from public.rota_assignments assignment
    where assignment.rota_entry_id = entry
      and assignment.role_name = 'Song Leader'
      and assignment.user_id = public.current_profile_id()
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
    from public.rota_assignments assignment
    where assignment.rota_entry_id = entry
      and assignment.user_id = public.current_profile_id()
      and (
        assignment.role_name = 'Song Leader'
        or (song_section = 'praise' and assignment.role_name = 'Praise Leader')
        or (song_section = 'worship' and assignment.role_name = 'Worship Leader')
      )
  )
$$;

-- Preserve the helper execution boundary established by 20260711024931.
revoke all on function public.current_profile_id() from public, anon, authenticated;
revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
revoke all on function public.has_org_role(uuid, public.organisation_role_name) from public, anon, authenticated;
revoke all on function public.is_team_member(uuid) from public, anon, authenticated;
revoke all on function public.is_team_leader(uuid) from public, anon, authenticated;
revoke all on function public.is_my_assignment(uuid) from public, anon, authenticated;
revoke all on function public.is_song_leader_for_entry(uuid) from public, anon, authenticated;
revoke all on function public.is_section_leader_for_entry(uuid, text) from public, anon, authenticated;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.organisation_role_name) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_team_leader(uuid) to authenticated;
grant execute on function public.is_my_assignment(uuid) to authenticated;
grant execute on function public.is_song_leader_for_entry(uuid) to authenticated;
grant execute on function public.is_section_leader_for_entry(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Account bootstrap, active switching, and display-name ownership.
-- ---------------------------------------------------------------------------

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
  profile_created_at timestamptz
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
    account.active_profile_id,
    profile.id,
    profile.organisation_id,
    organisation.name,
    profile.full_name,
    profile.display_name_override,
    profile.email,
    profile.phone,
    profile.avatar_url,
    profile.created_at
  from public.user_accounts account
  left join public.profiles profile
    on profile.auth_user_id = account.auth_user_id
  left join public.organisations organisation
    on organisation.id = profile.organisation_id
  where account.auth_user_id = v_auth_user_id
  order by organisation.name nulls first, profile.created_at, profile.id;
end;
$$;

create function public.set_global_display_name(p_display_name text)
returns table (
  account_auth_user_id uuid,
  global_display_name text,
  name_confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(p_display_name);
begin
  if v_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;
  if v_name is null or pg_catalog.char_length(v_name) < 2 then
    raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_REQUIRED';
  end if;
  if pg_catalog.char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_TOO_LONG';
  end if;

  insert into public.user_accounts as account (
    auth_user_id,
    global_display_name,
    name_confirmed_at
  ) values (
    v_auth_user_id,
    v_name,
    now()
  )
  on conflict (auth_user_id) do update
    set global_display_name = excluded.global_display_name,
        name_confirmed_at = excluded.name_confirmed_at;

  update public.profiles profile
  set full_name = v_name
  where profile.auth_user_id = v_auth_user_id
    and profile.display_name_override is null;

  return query
  select account.auth_user_id, account.global_display_name, account.name_confirmed_at
  from public.user_accounts account
  where account.auth_user_id = v_auth_user_id;
end;
$$;

create or replace function public.update_own_profile(p_full_name text)
returns table (
  profile_id uuid,
  full_name text,
  phone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_ACTIVE_PROFILE';
  end if;

  perform public.set_global_display_name(p_full_name);

  return query
  select profile.id, profile.full_name, profile.phone
  from public.profiles profile
  where profile.id = v_profile_id;
end;
$$;

create function public.set_organisation_display_name_override(p_display_name text)
returns table (
  profile_id uuid,
  full_name text,
  display_name_override text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_profile_id uuid := public.current_profile_id();
  v_global_name text;
  v_override text := nullif(pg_catalog.btrim(p_display_name), '');
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_ACTIVE_PROFILE';
  end if;
  select account.global_display_name into v_global_name
  from public.user_accounts account
  where account.auth_user_id = v_auth_user_id;
  if v_global_name is null then
    raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_REQUIRED';
  end if;
  if v_override is not null and pg_catalog.char_length(v_override) < 2 then
    raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_REQUIRED';
  end if;
  if v_override is not null and pg_catalog.char_length(v_override) > 100 then
    raise exception using errcode = 'P0001', message = 'DISPLAY_NAME_TOO_LONG';
  end if;

  return query
  update public.profiles profile
  set display_name_override = v_override,
      full_name = coalesce(v_override, v_global_name)
  where profile.id = v_profile_id
    and profile.auth_user_id = v_auth_user_id
  returning profile.id, profile.full_name, profile.display_name_override;
end;
$$;

create function public.switch_active_profile(p_profile_id uuid)
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
    and profile.auth_user_id = v_auth_user_id;
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

create function public.set_profile_display_names(
  p_global_display_name text,
  p_organisation_display_name text
)
returns table (
  profile_id uuid,
  full_name text,
  display_name_override text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_global_display_name(p_global_display_name);
  return query
  select result.profile_id, result.full_name, result.display_name_override
  from public.set_organisation_display_name_override(
    p_organisation_display_name
  ) result;
end;
$$;

revoke all on function public.get_account_context() from public, anon, authenticated;
revoke all on function public.set_global_display_name(text) from public, anon, authenticated;
revoke all on function public.update_own_profile(text) from public, anon, authenticated;
revoke all on function public.set_organisation_display_name_override(text) from public, anon, authenticated;
revoke all on function public.switch_active_profile(uuid) from public, anon, authenticated;
revoke all on function public.set_profile_display_names(text, text) from public, anon, authenticated;

grant execute on function public.get_account_context() to authenticated;
grant execute on function public.set_global_display_name(text) to authenticated;
grant execute on function public.update_own_profile(text) to authenticated;
grant execute on function public.set_organisation_display_name_override(text) to authenticated;
grant execute on function public.switch_active_profile(uuid) to authenticated;
grant execute on function public.set_profile_display_names(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Transactional organisation creation for no-organisation accounts.
-- ---------------------------------------------------------------------------

create function public.create_organisation(p_organisation_name text)
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
    select 1 from public.profiles profile where profile.auth_user_id = v_auth_user_id
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

revoke all on function public.create_organisation(text) from public, anon, authenticated;
grant execute on function public.create_organisation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Organisation invitations: audit history, deterministic uniqueness, and
--    no direct app-role table writes or token visibility.
-- ---------------------------------------------------------------------------

create table public.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  invited_email_normalized text not null,
  target_profile_id uuid references public.profiles (id) on delete restrict,
  status text not null default 'pending',
  token_hash bytea not null,
  invited_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  accepted_by_auth_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_sent_at timestamptz,
  send_count integer not null default 1,
  accepted_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,

  constraint organisation_invitations_status_check check (
    status in ('pending', 'accepted', 'expired', 'revoked', 'superseded')
  ),
  constraint organisation_invitations_email_normalized_check check (
    invited_email_normalized = lower(pg_catalog.btrim(invited_email_normalized))
    and invited_email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint organisation_invitations_hash_length_check check (
    pg_catalog.octet_length(token_hash) = 32
  ),
  constraint organisation_invitations_send_count_check check (send_count >= 1),
  constraint organisation_invitations_expiration_check check (expires_at > created_at),
  constraint organisation_invitations_status_timestamps_check check (
    (status <> 'accepted' or (accepted_at is not null and accepted_by_auth_user_id is not null))
    and (status <> 'revoked' or revoked_at is not null)
    and (status <> 'superseded' or superseded_at is not null)
  )
);

create unique index organisation_invitations_token_hash_uidx
  on public.organisation_invitations (token_hash);
create unique index organisation_invitations_pending_email_uidx
  on public.organisation_invitations (organisation_id, invited_email_normalized)
  where status = 'pending';
create unique index organisation_invitations_pending_target_uidx
  on public.organisation_invitations (target_profile_id)
  where status = 'pending' and target_profile_id is not null;
create index organisation_invitations_admin_list_idx
  on public.organisation_invitations (organisation_id, status, created_at desc);
create index organisation_invitations_target_profile_idx
  on public.organisation_invitations (target_profile_id)
  where target_profile_id is not null;

create trigger organisation_invitations_set_updated_at
  before update on public.organisation_invitations
  for each row execute function public.set_updated_at();

create function public.validate_organisation_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_organisation_id uuid;
  v_target_auth_user_id uuid;
  v_target_email text;
  v_inviter_organisation_id uuid;
begin
  select profile.organisation_id into v_inviter_organisation_id
  from public.profiles profile
  where profile.id = new.invited_by_profile_id;
  if v_inviter_organisation_id is distinct from new.organisation_id then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVITER_WRONG_ORGANISATION';
  end if;

  if new.target_profile_id is not null then
    select
      profile.organisation_id,
      profile.auth_user_id,
      lower(pg_catalog.btrim(profile.email))
    into v_target_organisation_id, v_target_auth_user_id, v_target_email
    from public.profiles profile
    where profile.id = new.target_profile_id;
    if v_target_organisation_id is distinct from new.organisation_id then
      raise exception using errcode = 'P0001', message = 'INVITATION_TARGET_WRONG_ORGANISATION';
    end if;
    if v_target_email is distinct from new.invited_email_normalized then
      raise exception using errcode = 'P0001', message = 'INVITATION_TARGET_EMAIL_MISMATCH';
    end if;
    if new.status = 'pending' and v_target_auth_user_id is not null then
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

create trigger organisation_invitations_validate
  before insert or update on public.organisation_invitations
  for each row execute function public.validate_organisation_invitation();

revoke all on function public.validate_organisation_invitation()
  from public, anon, authenticated;

alter table public.organisation_invitations enable row level security;
revoke all on table public.organisation_invitations from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Church-admin invitation listing. Tokens and Auth internals are excluded.
-- ---------------------------------------------------------------------------

create function public.list_organisation_invitations()
returns table (
  invitation_id uuid,
  invited_email text,
  target_profile_id uuid,
  target_display_name text,
  status text,
  created_at timestamptz,
  last_sent_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  send_count integer,
  invited_by_display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_organisation_id uuid;
begin
  select profile.organisation_id into v_organisation_id
  from public.profiles profile
  where profile.id = v_profile_id;
  if v_profile_id is null
     or not coalesce(public.is_church_admin(v_organisation_id), false) then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  update public.organisation_invitations invitation
  set status = 'expired'
  where invitation.organisation_id = v_organisation_id
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  return query
  select
    invitation.id,
    invitation.invited_email_normalized,
    invitation.target_profile_id,
    target.full_name,
    invitation.status,
    invitation.created_at,
    invitation.last_sent_at,
    invitation.expires_at,
    invitation.accepted_at,
    invitation.revoked_at,
    invitation.send_count,
    inviter.full_name
  from public.organisation_invitations invitation
  left join public.profiles target on target.id = invitation.target_profile_id
  join public.profiles inviter on inviter.id = invitation.invited_by_profile_id
  where invitation.organisation_id = v_organisation_id
  order by invitation.created_at desc, invitation.id desc;
end;
$$;

revoke all on function public.list_organisation_invitations()
  from public, anon, authenticated;
grant execute on function public.list_organisation_invitations()
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Trusted invitation operations. Only service_role can execute these; the
--    Edge Function first validates a JWT and supplies that server-derived Auth
--    user id. Token hashes are SHA-256 hex produced in the trusted runtime.
-- ---------------------------------------------------------------------------

create function public.issue_organisation_invitation_internal(
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
  join public.profiles profile on profile.id = account.active_profile_id
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
    select lower(pg_catalog.btrim(profile.email)), profile.auth_user_id
    into v_email, v_target_auth_user_id
    from public.profiles profile
    where profile.id = v_target_profile_id
      and profile.organisation_id = p_organisation_id
    for update;
    if v_email is null then
      raise exception using errcode = 'P0001', message = 'PROFILE_NOT_ELIGIBLE';
    end if;
    if v_target_auth_user_id is not null then
      raise exception using errcode = 'P0001', message = 'PROFILE_ALREADY_LINKED';
    end if;
  else
    v_email := lower(pg_catalog.btrim(p_invited_email));
  end if;

  if v_email is null
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using errcode = 'P0001', message = 'VALID_EMAIL_REQUIRED';
  end if;

  -- If an admin typed the email of an existing directory person instead of
  -- selecting them, canonicalize to that profile so acceptance reuses it.
  if v_target_profile_id is null then
    select profile.id, profile.auth_user_id
    into v_target_profile_id, v_target_auth_user_id
    from public.profiles profile
    where profile.organisation_id = p_organisation_id
      and lower(pg_catalog.btrim(profile.email)) = v_email
    for update;
    if found and v_target_auth_user_id is not null then
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
    organisation_id,
    invited_email_normalized,
    target_profile_id,
    token_hash,
    invited_by_profile_id,
    expires_at
  ) values (
    p_organisation_id,
    v_email,
    v_target_profile_id,
    decode(p_token_hash_hex, 'hex'),
    v_inviter_profile_id,
    v_expires_at
  ) returning id into v_invitation_id;

  return query select v_invitation_id, v_email, v_organisation_name, v_expires_at;
end;
$$;

create function public.resend_organisation_invitation_internal(
  p_caller_auth_user_id uuid,
  p_invitation_id uuid,
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
  v_organisation_id uuid;
  v_organisation_name text;
  v_old public.organisation_invitations%rowtype;
  v_new_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if p_token_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_TOKEN_HASH';
  end if;

  select profile.id, profile.organisation_id, organisation.name
  into v_inviter_profile_id, v_organisation_id, v_organisation_name
  from public.user_accounts account
  join public.profiles profile on profile.id = account.active_profile_id
  join public.organisations organisation on organisation.id = profile.organisation_id
  join public.organisation_roles role_row
    on role_row.organisation_id = profile.organisation_id
   and role_row.user_id = profile.id
   and role_row.role = 'church_admin'
  where account.auth_user_id = p_caller_auth_user_id
    and profile.auth_user_id = p_caller_auth_user_id;
  if v_inviter_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  select invitation.* into v_old
  from public.organisation_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.organisation_id = v_organisation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_FOUND';
  end if;
  if v_old.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_PENDING';
  end if;
  if v_old.expires_at <= now() then
    update public.organisation_invitations set status = 'expired' where id = v_old.id;
    raise exception using errcode = 'P0001', message = 'INVITATION_EXPIRED';
  end if;

  update public.organisation_invitations
  set status = 'superseded', superseded_at = now()
  where id = v_old.id;

  insert into public.organisation_invitations (
    organisation_id,
    invited_email_normalized,
    target_profile_id,
    token_hash,
    invited_by_profile_id,
    expires_at,
    send_count
  ) values (
    v_old.organisation_id,
    v_old.invited_email_normalized,
    v_old.target_profile_id,
    decode(p_token_hash_hex, 'hex'),
    v_inviter_profile_id,
    v_expires_at,
    v_old.send_count + 1
  ) returning id into v_new_id;

  return query select v_new_id, v_old.invited_email_normalized, v_organisation_name, v_expires_at;
end;
$$;

create function public.mark_organisation_invitation_sent_internal(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organisation_invitations invitation
  set last_sent_at = now()
  where invitation.id = p_invitation_id
    and invitation.status = 'pending';
end;
$$;

create function public.revoke_organisation_invitation_internal(
  p_caller_auth_user_id uuid,
  p_invitation_id uuid
)
returns table (
  invitation_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organisation_id uuid;
  v_status text;
begin
  select profile.organisation_id into v_organisation_id
  from public.user_accounts account
  join public.profiles profile on profile.id = account.active_profile_id
  join public.organisation_roles role_row
    on role_row.organisation_id = profile.organisation_id
   and role_row.user_id = profile.id
   and role_row.role = 'church_admin'
  where account.auth_user_id = p_caller_auth_user_id
    and profile.auth_user_id = p_caller_auth_user_id;
  if v_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHORISED';
  end if;

  select invitation.status into v_status
  from public.organisation_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.organisation_id = v_organisation_id
  for update;
  if v_status is null then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_FOUND';
  end if;
  if v_status = 'revoked' then
    return query select p_invitation_id, 'revoked'::text;
    return;
  end if;
  if v_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_PENDING';
  end if;

  update public.organisation_invitations invitation
  set status = 'revoked', revoked_at = now()
  where invitation.id = p_invitation_id;

  return query select p_invitation_id, 'revoked'::text;
end;
$$;

create function public.preview_organisation_invitation_internal(
  p_token_hash_hex text,
  p_caller_auth_user_id uuid
)
returns table (
  organisation_name text,
  masked_email text,
  status text,
  authentication_required boolean,
  account_matches boolean,
  verified_email_present boolean,
  suggested_display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.organisation_invitations%rowtype;
  v_local text;
  v_domain text;
  v_auth_email text;
  v_email_confirmed_at timestamptz;
begin
  if p_token_hash_hex !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select invitation.* into v_invitation
  from public.organisation_invitations invitation
  where invitation.token_hash = decode(p_token_hash_hex, 'hex')
  for update;
  if not found then
    return;
  end if;
  if v_invitation.status = 'pending' and v_invitation.expires_at <= now() then
    update public.organisation_invitations set status = 'expired' where id = v_invitation.id;
    v_invitation.status := 'expired';
  end if;

  v_local := split_part(v_invitation.invited_email_normalized, '@', 1);
  v_domain := split_part(v_invitation.invited_email_normalized, '@', 2);
  if p_caller_auth_user_id is not null then
    select lower(pg_catalog.btrim(auth_user.email)), auth_user.email_confirmed_at
    into v_auth_email, v_email_confirmed_at
    from auth.users auth_user
    where auth_user.id = p_caller_auth_user_id;
  end if;

  return query
  select
    organisation.name,
    case
      when pg_catalog.char_length(v_local) <= 1 then '*' || '@' || v_domain
      else left(v_local, 1) || repeat('*', greatest(pg_catalog.char_length(v_local) - 1, 2)) || '@' || v_domain
    end,
    v_invitation.status,
    true,
    case
      when p_caller_auth_user_id is null then null
      else v_email_confirmed_at is not null
        and v_auth_email = v_invitation.invited_email_normalized
    end,
    case
      when p_caller_auth_user_id is null then null
      else v_email_confirmed_at is not null and v_auth_email is not null
    end,
    case
      when p_caller_auth_user_id is not null
       and v_email_confirmed_at is not null
       and v_auth_email = v_invitation.invited_email_normalized
        then target.full_name
      else null
    end
  from public.organisations organisation
  left join public.profiles target on target.id = v_invitation.target_profile_id
  where organisation.id = v_invitation.organisation_id;
end;
$$;

create function public.accept_organisation_invitation_internal(
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
  v_existing_profile_id uuid;
  v_organisation_name text;
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
      and profile.organisation_id = v_invitation.organisation_id;
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
    set global_display_name = v_supplied_name,
        name_confirmed_at = now()
    where auth_user_id = p_caller_auth_user_id;
    v_global_name := v_supplied_name;
  end if;

  select profile.id into v_existing_profile_id
  from public.profiles profile
  where profile.auth_user_id = p_caller_auth_user_id
    and profile.organisation_id = v_invitation.organisation_id
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
    if v_existing_profile_id is not null and v_existing_profile_id <> v_profile.id then
      raise exception using errcode = 'P0001', message = 'ORGANISATION_ALREADY_JOINED';
    end if;

    update public.profiles profile
    set auth_user_id = p_caller_auth_user_id,
        full_name = v_global_name,
        display_name_override = null
    where profile.id = v_profile.id
    returning profile.* into v_profile;
  else
    if v_existing_profile_id is not null then
      raise exception using errcode = 'P0001', message = 'ORGANISATION_ALREADY_JOINED';
    end if;
    insert into public.profiles (
      auth_user_id,
      organisation_id,
      full_name,
      email,
      display_name_override
    ) values (
      p_caller_auth_user_id,
      v_invitation.organisation_id,
      v_global_name,
      v_invitation.invited_email_normalized,
      null
    ) returning * into v_profile;
  end if;

  insert into public.organisation_roles (organisation_id, user_id, role)
  values (v_profile.organisation_id, v_profile.id, 'general_member')
  on conflict (organisation_id, user_id) do nothing;

  update public.user_accounts
  set active_profile_id = v_profile.id
  where auth_user_id = p_caller_auth_user_id;

  update public.organisation_invitations invitation
  set status = 'accepted',
      accepted_by_auth_user_id = p_caller_auth_user_id,
      accepted_at = now()
  where invitation.id = v_invitation.id;

  select organisation.name into v_organisation_name
  from public.organisations organisation
  where organisation.id = v_profile.organisation_id;

  return query select v_invitation.id, v_profile.id, v_profile.organisation_id,
    v_organisation_name, v_global_name, false;
end;
$$;

revoke all on function public.issue_organisation_invitation_internal(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.resend_organisation_invitation_internal(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_organisation_invitation_sent_internal(uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_organisation_invitation_internal(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.preview_organisation_invitation_internal(text, uuid)
  from public, anon, authenticated;
revoke all on function public.accept_organisation_invitation_internal(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.issue_organisation_invitation_internal(uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.resend_organisation_invitation_internal(uuid, uuid, text)
  to service_role;
grant execute on function public.mark_organisation_invitation_sent_internal(uuid)
  to service_role;
grant execute on function public.revoke_organisation_invitation_internal(uuid, uuid)
  to service_role;
grant execute on function public.preview_organisation_invitation_internal(text, uuid)
  to service_role;
grant execute on function public.accept_organisation_invitation_internal(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 9. Existing membership RPCs must resolve the active profile, not an
--    ambiguous arbitrary row when one Auth user has several organisations.
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
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_profile_id
      and profile.organisation_id = v_team_organisation_id
      and profile.auth_user_id is not null
  ) then
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
  v_caller_profile_id uuid := public.current_profile_id();
  v_caller_organisation_id uuid;
  v_team_organisation_id uuid;
  v_target_membership public.team_memberships%rowtype;
  v_remaining_admin_count integer;
begin
  select profile.organisation_id into v_caller_organisation_id
  from public.profiles profile where profile.id = v_caller_profile_id;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;
  select team.organisation_id into v_team_organisation_id
  from public.teams team
  where team.id = p_team_id and team.organisation_id = v_caller_organisation_id
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
  select membership.* into v_target_membership
  from public.team_memberships membership
  where membership.team_id = p_team_id and membership.user_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBERSHIP_NOT_FOUND';
  end if;
  if v_target_membership.role = 'team_leader'::public.team_role then
    if not coalesce(public.is_church_admin(v_team_organisation_id), false) then
      raise exception using errcode = 'P0001', message = 'PEER_TEAM_ADMIN_REMOVAL_BLOCKED';
    end if;
    select count(*) into v_remaining_admin_count
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
  returning membership.id, membership.team_id, membership.user_id,
    membership.role, membership.created_at;
end;
$$;

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
  v_team_organisation_id uuid;
  v_own_membership public.team_memberships%rowtype;
  v_admin_count integer;
begin
  select profile.organisation_id into v_caller_organisation_id
  from public.profiles profile where profile.id = v_caller_profile_id;
  if v_caller_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NO_LINKED_PROFILE';
  end if;
  select team.organisation_id into v_team_organisation_id
  from public.teams team
  where team.id = p_team_id and team.organisation_id = v_caller_organisation_id
  for update;
  if v_team_organisation_id is null then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;
  select membership.* into v_own_membership
  from public.team_memberships membership
  where membership.team_id = p_team_id and membership.user_id = v_caller_profile_id
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
end;
$$;

revoke all on function public.add_team_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_team_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_team(uuid) from public, anon, authenticated;
grant execute on function public.add_team_member(uuid, uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;

comment on table public.user_accounts is
  'One account-global identity per Auth user, including global display name and the single validated active organisation profile.';
comment on table public.organisation_invitations is
  'App-owned, email-targeted organisation invitations. Only SHA-256 token hashes are stored; raw bearer tokens exist only in invitation links.';

commit;
