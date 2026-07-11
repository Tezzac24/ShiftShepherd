-- ============================================================================
-- Shift Shepherd - Profile Editing V1 + Team Avatars V1
--
-- Profile editing is deliberately limited to the caller's own full_name and
-- phone. Email, auth linkage, organisation, roles, and memberships remain
-- outside the RPC and authenticated keeps no UPDATE grant on profiles.
--
-- Team avatars use one private image bucket. `teams.avatar_url` stores the
-- object path (`teams/<teamId>/<generatedFileName>`), never a public/signed
-- URL. Team members/admins may read; team leaders/admins may upload/delete
-- and repoint the team through a narrow RPC. No anon policy or table UPDATE
-- grant is added.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Profile Editing V1: two safe, self-owned fields only.
-- ----------------------------------------------------------------------------

create or replace function public.update_own_profile(
  p_full_name text,
  p_phone text
)
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
  v_profile_id uuid;
  v_full_name text := pg_catalog.btrim(p_full_name);
  v_phone text := nullif(pg_catalog.btrim(p_phone), '');
begin
  select p.id
  into v_profile_id
  from public.profiles p
  where p.auth_user_id = (select auth.uid());

  if v_profile_id is null then
    raise exception 'No linked profile for the current user';
  end if;

  if v_full_name is null or pg_catalog.char_length(v_full_name) < 2 then
    raise exception 'Full name must be at least 2 characters';
  end if;

  if pg_catalog.char_length(v_full_name) > 100 then
    raise exception 'Full name must be 100 characters or fewer';
  end if;

  if v_phone is not null and pg_catalog.char_length(v_phone) > 30 then
    raise exception 'Phone number must be 30 characters or fewer';
  end if;

  return query
  update public.profiles p
  set full_name = v_full_name,
      phone = v_phone
  where p.id = v_profile_id
  returning p.id, p.full_name, p.phone;
end;
$$;

comment on function public.update_own_profile(text, text) is
  'Updates only the calling linked profile full_name and phone. Email, auth linkage, organisation, roles, and memberships cannot be changed.';

revoke all on function public.update_own_profile(text, text)
  from public, anon, authenticated;
grant execute on function public.update_own_profile(text, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- Team Avatars V1: nullable private-storage path on visible team rows.
-- ----------------------------------------------------------------------------

alter table public.teams
  add column avatar_url text;

alter table public.teams
  add constraint teams_avatar_path_matches_team
  check (
    avatar_url is null
    or avatar_url like 'teams/' || id::text || '/_%'
  );

comment on column public.teams.avatar_url is
  'Private team-avatars object path under teams/<team id>/; never a public or signed URL.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-avatars',
  'team-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "team members can view team avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'team-avatars'
    and (storage.foldername(name))[1] = 'teams'
    and exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(storage.objects.name))[2]
        and public.can_access_team(t.id)
    )
  );

create policy "team managers upload team avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-avatars'
    and (storage.foldername(name))[1] = 'teams'
    and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
    and exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(storage.objects.name))[2]
        and public.can_manage_team(t.id)
    )
  );

create policy "team managers delete team avatars"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-avatars'
    and (storage.foldername(name))[1] = 'teams'
    and exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(storage.objects.name))[2]
        and public.can_manage_team(t.id)
    )
  );

create or replace function public.set_team_avatar_path(
  p_team_id uuid,
  p_avatar_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_team(p_team_id) then
    raise exception 'You do not have permission to manage this team';
  end if;

  if p_avatar_path is not null
     and p_avatar_path not like 'teams/' || p_team_id::text || '/_%' then
    raise exception 'Team avatar path must be inside the team folder';
  end if;

  update public.teams
  set avatar_url = p_avatar_path
  where id = p_team_id;

  if not found then
    raise exception 'Team not found';
  end if;
end;
$$;

comment on function public.set_team_avatar_path(uuid, text) is
  'Sets or clears one team avatar path for a caller authorised by can_manage_team. Updates no other team field.';

revoke all on function public.set_team_avatar_path(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_team_avatar_path(uuid, text)
  to authenticated;

commit;
