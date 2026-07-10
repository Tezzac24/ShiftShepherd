-- ============================================================================
-- Shift Shepherd - profile avatar storage (Storage foundation V1)
--
-- First Supabase Storage slice: a private `profile-avatars` bucket, object
-- policies scoped to each user's own folder, and a narrow RPC that lets a
-- signed-in user point their own `profiles.avatar_url` at an uploaded object.
--
-- Object path convention (enforced by the write policies and the RPC):
--   profiles/<profileId>/<fileName>     e.g. profiles/9b7.../avatar-1760....jpg
--
-- In live mode `profiles.avatar_url` holds this storage *path*, not a URL -
-- the private bucket means display always goes through short-lived signed
-- URLs generated client-side. No table changes: `avatar_url` already exists.
--
-- Deliberately out of scope: announcement images, chat attachments, team
-- avatars, anon access, public buckets, backfill.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Bucket: private, images only, 5 MB cap (the app validates the same limits
-- client-side with friendly copy; the bucket is the enforcement backstop)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Object policies (RLS is already enabled on storage.objects; anon gets no
-- policy, so anonymous users can read/write nothing)
--
-- Reads mirror profile visibility: you can see an avatar exactly when you can
-- see its profile row (same organisation). Writes are confined to the
-- caller's own profiles/<profileId>/ folder; unlinked auth users have no
-- current_profile_id() and therefore no folder.
-- ----------------------------------------------------------------------------

create policy "org members can view profile avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'profiles'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[2]
        and public.is_org_member(p.organisation_id)
    )
  );

create policy "users upload their own profile avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = public.current_profile_id()::text
  );

create policy "users update their own profile avatar objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = public.current_profile_id()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = public.current_profile_id()::text
  );

create policy "users delete their own profile avatar objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = public.current_profile_id()::text
  );

-- ----------------------------------------------------------------------------
-- Narrow avatar-path setter. `authenticated` has no UPDATE grant on
-- public.profiles (and the existing self-update RLS policy is not
-- column-constrained), so instead of opening table-level update this RPC
-- changes exactly one column on exactly the caller's own row.
-- ----------------------------------------------------------------------------

create or replace function public.set_own_profile_avatar_path(new_avatar_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_id uuid := public.current_profile_id();
begin
  if profile_id is null then
    raise exception 'No linked profile for the current user';
  end if;
  -- Non-null paths must live in the caller's own avatar folder and name an
  -- actual file ('/_%' = slash + at least one character).
  if new_avatar_path is not null
     and new_avatar_path not like 'profiles/' || profile_id::text || '/_%' then
    raise exception 'Avatar path must be inside your own profile folder';
  end if;
  update public.profiles set avatar_url = new_avatar_path where id = profile_id;
end;
$$;

comment on function public.set_own_profile_avatar_path(text) is
  'Sets (or clears, with null) the calling user''s own profiles.avatar_url to a profile-avatars storage path under profiles/<own profile id>/. Updates no other column and no other row.';

revoke execute on function public.set_own_profile_avatar_path(text) from public;
grant execute on function public.set_own_profile_avatar_path(text) to authenticated;

commit;
