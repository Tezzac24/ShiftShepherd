-- ============================================================================
-- Shift Shepherd - link new Supabase Auth users to existing profiles
--
-- Profiles are created/seeded by church admins before Auth users. When an
-- Auth user is later created with the same email, link that existing profile
-- without creating any profile, role, or membership rows.
--
-- This migration intentionally handles Auth-user inserts only. Email-change
-- relinking and backfilling Auth users created before this trigger are out of
-- scope and remain explicit admin operations.
-- ============================================================================

begin;

-- Matching is case-insensitive, so enforce that the match can never be
-- ambiguous. The live preflight found no rows that violate this invariant.
create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email));

comment on index public.profiles_email_lower_uidx is
  'Ensures an Auth email can match at most one existing profile, case-insensitively.';

create or replace function public.link_auth_user_to_existing_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  update public.profiles
  set auth_user_id = new.id
  where lower(email) = lower(new.email)
    and auth_user_id is null;

  return new;
end;
$$;

comment on function public.link_auth_user_to_existing_profile() is
  'Links a newly inserted Auth user to one existing unlinked profile with the same email; never creates or overwrites a profile.';

-- SECURITY DEFINER is required because Auth inserts are not performed as a
-- profile-owning app user and profiles has RLS. Keep this trigger-only helper
-- out of the Data API/RPC surface.
revoke all on function public.link_auth_user_to_existing_profile() from public;
revoke all on function public.link_auth_user_to_existing_profile() from anon, authenticated;

drop trigger if exists on_auth_user_created_link_existing_profile on auth.users;

create trigger on_auth_user_created_link_existing_profile
  after insert on auth.users
  for each row
  execute function public.link_auth_user_to_existing_profile();

commit;
